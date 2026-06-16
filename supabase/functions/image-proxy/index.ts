// image-proxy — metered sprite generation (xAI grok-imagine) for SLOP.game.
// Verify JWT → ensure >= IMAGE_CREDITS → generate → spend a flat IMAGE_CREDITS.
// Secret: XAI_API_KEY.

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { corsHeaders, jsonRes } from '../_shared/cors.ts';
import { IMAGE_CREDITS } from '../_shared/models.ts';

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
    if (!user) return jsonRes(401, { error: 'sign in to generate sprites' });

    const { prompt } = await req.json().catch(() => ({}));
    if (!prompt || String(prompt).length > 2000) return jsonRes(400, { error: 'bad image prompt' });

    const { data: bill, error: be } = await supabase.rpc('my_billing');
    if (be) return jsonRes(500, { error: 'billing unavailable — try again' });
    const me = Array.isArray(bill) ? bill[0] : bill;
    if (Number(me?.credits ?? 0) < IMAGE_CREDITS) {
      return jsonRes(402, { error: `not enough credits for a sprite (need ${IMAGE_CREDITS}). top up to keep cooking.`, code: 'insufficient_credits' });
    }

    const key = Deno.env.get('XAI_API_KEY');
    if (!key) return jsonRes(501, { error: 'image generation is not configured on this server yet' });

    const upstream = await fetch('https://api.x.ai/v1/images/generations', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${key}` },
      body: JSON.stringify({ model: 'grok-imagine-image', prompt: String(prompt), n: 1, response_format: 'b64_json' }),
    });
    const data = await upstream.json().catch(() => ({}));
    if (!upstream.ok || !data?.data?.[0]?.b64_json) {
      return jsonRes(upstream.ok ? 502 : upstream.status, { error: data?.error || 'image generation failed' });
    }

    // charge a flat per-sprite cost (best-effort; don't fail the response on metering)
    try { await supabase.rpc('spend_credits', { p_amount: IMAGE_CREDITS, p_reason: 'sprite', p_model: 'grok-imagine-image' }); } catch { /* */ }

    return jsonRes(200, { b64: data.data[0].b64_json, mime: data.data[0].mime_type || 'image/jpeg' });
  } catch (e) {
    return jsonRes(500, { error: String((e as Error)?.message || e) });
  }
});
