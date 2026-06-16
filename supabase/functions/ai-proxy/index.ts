// ai-proxy — metered, multi-provider, streaming LLM proxy for SLOP.game.
//
// Flow: verify the caller's Supabase JWT → refresh allowance + read balance →
// gate Pro-only models → pre-check enough credits for the worst case → call the
// provider with the SECRET key (xAI / OpenAI / Anthropic) → stream OpenAI-style
// SSE back to the browser (js/ai.js parses this unchanged) → meter the REAL token
// usage and spend_credits(). Secret keys never leave the server.
//
// Secrets (supabase secrets set …): XAI_API_KEY, OPENAI_API_KEY, ANTHROPIC_API_KEY.
// SUPABASE_URL / SUPABASE_ANON_KEY are injected automatically.

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { corsHeaders, jsonRes, clamp } from '../_shared/cors.ts';
import { modelInfo, estimateCredits, creditsFor } from '../_shared/models.ts';

const ANTHROPIC_MAX_OUT = 64000;
const OTHER_MAX_OUT = 32768;

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  if (req.method !== 'POST') return jsonRes(405, { error: 'POST only' });

  try {
    const authHeader = req.headers.get('Authorization') || '';
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_ANON_KEY')!,
      { global: { headers: { Authorization: authHeader } } },
    );
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return jsonRes(401, { error: 'sign in to use slop AI' });

    const body = await req.json().catch(() => ({}));
    const { model, messages, max_tokens = 16384, temperature = 0.6 } = body || {};
    if (!Array.isArray(messages) || !model) return jsonRes(400, { error: 'bad AI request' });

    const info = modelInfo(model);

    // billing snapshot (also applies monthly + daily allowance)
    const { data: bill, error: be } = await supabase.rpc('my_billing');
    if (be) return jsonRes(500, { error: 'billing unavailable — try again' });
    const me = Array.isArray(bill) ? bill[0] : bill;
    const isPro = !!me?.is_pro;
    const credits = Number(me?.credits ?? 0);

    if (info.tier === 'pro' && !isPro) {
      return jsonRes(403, { error: `${model} is a Pro model — go Pro or pick a free model.`, code: 'pro_required' });
    }

    const provider = info.provider;
    const approxIn = Math.ceil(JSON.stringify(messages).length / 4);
    const maxOut = Math.min(Number(max_tokens) || 16384, provider === 'anthropic' ? ANTHROPIC_MAX_OUT : OTHER_MAX_OUT);
    const estimate = estimateCredits(model, approxIn, maxOut);
    if (credits < estimate) {
      return jsonRes(402, {
        error: `not enough credits (need ~${estimate}, you have ${credits}). top up, or pick a cheaper/faster model.`,
        code: 'insufficient_credits', need: estimate, have: credits,
      });
    }

    // ---- build the upstream request for the chosen provider
    let url: string; let headers: Record<string, string>; let payload: Record<string, unknown>;
    if (provider === 'anthropic') {
      const key = Deno.env.get('ANTHROPIC_API_KEY');
      if (!key) return jsonRes(501, { error: 'Claude models are not configured on this server yet' });
      const system = messages.filter((m: any) => m.role === 'system').map((m: any) => String(m.content ?? '')).join('\n\n');
      const msgs = messages.filter((m: any) => m.role !== 'system')
        .map((m: any) => ({ role: m.role === 'assistant' ? 'assistant' : 'user', content: String(m.content ?? '') }));
      url = 'https://api.anthropic.com/v1/messages';
      headers = { 'Content-Type': 'application/json', 'x-api-key': key, 'anthropic-version': '2023-06-01' };
      payload = { model, ...(system ? { system } : {}), messages: msgs, max_tokens: maxOut, stream: true };
      // Opus 4.8/4.7 reject temperature/top_p; only send temperature to other Claude models.
      if (!/^claude-opus/.test(model)) payload.temperature = clamp(temperature, 0, 1);
    } else {
      const isOpenAI = provider === 'openai';
      const key = isOpenAI ? Deno.env.get('OPENAI_API_KEY') : Deno.env.get('XAI_API_KEY');
      if (!key) return jsonRes(501, { error: `${provider} models are not configured on this server yet` });
      url = isOpenAI ? 'https://api.openai.com/v1/chat/completions' : 'https://api.x.ai/v1/chat/completions';
      headers = { 'Content-Type': 'application/json', Authorization: `Bearer ${key}` };
      // OpenAI's reasoning models (gpt-5*, o-series) require `max_completion_tokens`
      // and reject a custom temperature (only the default is allowed). xAI (grok) and
      // gpt-4o use the legacy `max_tokens` + temperature shape.
      const reasoning = isOpenAI && /^(gpt-5|o[0-9])/.test(model);
      payload = reasoning
        ? { model, messages, max_completion_tokens: maxOut, stream: true, stream_options: { include_usage: true }, reasoning_effort: 'low' }
        : { model, messages, max_tokens: maxOut, temperature: clamp(temperature, 0, 1.5), stream: true, stream_options: { include_usage: true } };
    }

    const upstream = await fetch(url, { method: 'POST', headers, body: JSON.stringify(payload) });
    if (!upstream.ok || !upstream.body) {
      const text = await upstream.text().catch(() => '');
      return jsonRes(upstream.status || 502, { error: `${provider} error ${upstream.status}: ${text.slice(0, 300)}` });
    }

    // ---- stream through, normalising to OpenAI-style chunks, capturing usage
    const reader = upstream.body.getReader();
    const dec = new TextDecoder();
    const enc = new TextEncoder();
    let buf = '';
    let tin = 0, tout = 0, outChars = 0;

    const out = new ReadableStream({
      async start(controller) {
        const emit = (txt: string) => { outChars += txt.length; controller.enqueue(enc.encode(`data: ${JSON.stringify({ choices: [{ delta: { content: txt } }] })}\n\n`)); };
        try {
          for (;;) {
            const { done, value } = await reader.read();
            if (done) break;
            buf += dec.decode(value, { stream: true });
            const lines = buf.split('\n');
            buf = lines.pop() ?? '';
            for (const line of lines) {
              const s = line.trim();
              if (!s.startsWith('data:')) continue;
              const data = s.slice(5).trim();
              if (!data || data === '[DONE]') continue;
              let ev: any; try { ev = JSON.parse(data); } catch { continue; }
              if (provider === 'anthropic') {
                if (ev.type === 'message_start' && ev.message?.usage?.input_tokens != null) tin = ev.message.usage.input_tokens;
                else if (ev.type === 'content_block_delta' && ev.delta?.type === 'text_delta' && ev.delta.text) emit(ev.delta.text);
                else if (ev.type === 'message_delta' && ev.usage?.output_tokens != null) tout = ev.usage.output_tokens;
              } else {
                const d = ev.choices?.[0]?.delta?.content;
                if (d) emit(d);
                if (ev.usage) { tin = ev.usage.prompt_tokens || tin; tout = ev.usage.completion_tokens || tout; }
              }
            }
          }
        } catch { /* upstream/client disconnect */ }

        // Meter the REAL usage (fall back to a char estimate if absent) and spend —
        // do this BEFORE closing so it runs inside the live request, not racing the
        // isolate shutdown after the response ends.
        if (!tin) tin = approxIn;
        if (!tout) tout = Math.ceil(outChars / 4);
        const { usd, credits: cost } = creditsFor(model, tin, tout);
        try {
          await supabase.rpc('spend_credits', {
            p_amount: cost, p_reason: 'ai_studio', p_model: model,
            p_tokens_in: tin, p_tokens_out: tout, p_usd: Number(usd.toFixed(5)),
          });
        } catch { /* never block the response on metering */ }

        controller.enqueue(enc.encode('data: [DONE]\n\n'));
        controller.close();
      },
    });

    return new Response(out, {
      headers: { ...corsHeaders, 'Content-Type': 'text/event-stream; charset=utf-8', 'Cache-Control': 'no-cache' },
    });
  } catch (e) {
    return jsonRes(500, { error: String((e as Error)?.message || e) });
  }
});
