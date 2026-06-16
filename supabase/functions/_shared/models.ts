// Model catalog + credit pricing — the ONE place pricing lives, so it stays tunable.
//
// 1 credit = $0.01 of retail value; we charge ceil(provider_usd * MARGIN / 0.01).
// Per-1M-token prices below: Anthropic numbers are authoritative (Opus 4.8 $5/$25,
// Sonnet 4.6 $3/$15, Haiku 4.5 $1/$5). xAI/OpenAI prices are sensible defaults —
// set them to your providers' real prices so the margin holds.

export const MARGIN = 1.4;
export const CREDIT_USD = 0.01;
export const PRO_MONTHLY = 600;       // credits granted each month a subscription is active
export const IMAGE_CREDITS = 2;       // flat cost per generated sprite (xAI grok-imagine)

// One-time top-up packs (keep in sync with the Stripe prices you create).
export const TOPUP_CREDITS: Record<string, number> = {
  topup_small: 600,   // ~$5
  topup_large: 3000,  // ~$20 (better rate)
};

export type Tier = 'free' | 'pro';
export type Provider = 'xai' | 'openai' | 'anthropic';
export interface ModelInfo { in: number; out: number; tier: Tier; provider: Provider }

export const MODELS: Record<string, ModelInfo> = {
  // xAI (Grok) — set to your real xAI prices
  'grok-4.3': { in: 3, out: 15, tier: 'pro', provider: 'xai' },
  'grok-4.20-0309-reasoning': { in: 3, out: 15, tier: 'pro', provider: 'xai' },
  'grok-4.20-0309-non-reasoning': { in: 0.5, out: 1.5, tier: 'free', provider: 'xai' },
  // Anthropic (authoritative)
  'claude-opus-4-8': { in: 5, out: 25, tier: 'pro', provider: 'anthropic' },
  'claude-sonnet-4-6': { in: 3, out: 15, tier: 'pro', provider: 'anthropic' },
  'claude-haiku-4-5': { in: 1, out: 5, tier: 'free', provider: 'anthropic' },
  // OpenAI — set to your real OpenAI prices
  'gpt-4o': { in: 2.5, out: 10, tier: 'pro', provider: 'openai' },
  'gpt-4o-mini': { in: 0.15, out: 0.6, tier: 'free', provider: 'openai' },
};

export function providerFor(model: string): Provider {
  const m = String(model || '');
  if (m.startsWith('claude')) return 'anthropic';
  if (m.startsWith('gpt') || m.startsWith('o1') || m.startsWith('o3') || m.startsWith('chatgpt')) return 'openai';
  return 'xai';
}

// Unknown models default to a Pro-tier, Opus-priced entry (conservative).
export function modelInfo(model: string): ModelInfo {
  return MODELS[model] || { in: 5, out: 25, tier: 'pro', provider: providerFor(model) };
}

export function creditsFor(model: string, tokensIn: number, tokensOut: number) {
  const m = modelInfo(model);
  const usd = (tokensIn / 1e6) * m.in + (tokensOut / 1e6) * m.out;
  return { usd, credits: Math.max(1, Math.ceil((usd * MARGIN) / CREDIT_USD)) };
}

// Upper-bound estimate (uses max_tokens for output) so we never deliver a
// response we can't charge for.
export function estimateCredits(model: string, approxIn: number, maxOut: number) {
  return creditsFor(model, approxIn, maxOut).credits;
}
