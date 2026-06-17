// Model ids + picker labels — no network deps (safe for hero.js on first paint).

export const MODELS = {
  cook: 'gpt-5.5',
  remix: 'grok-4.20-0309-non-reasoning',
  studio: 'gpt-5.5',
};

export const MODEL_CHOICES = [
  { id: 'gpt-5.5', label: 'GPT-5.5 — OpenAI flagship', provider: 'openai', tier: 'free' },
  { id: 'grok-4.20-0309-non-reasoning', label: 'Grok 4.20 — fast', provider: 'xai', tier: 'free' },
  { id: 'claude-haiku-4-5', label: 'Claude Haiku 4.5 — fast', provider: 'anthropic', tier: 'free' },
  { id: 'gpt-4o-mini', label: 'GPT-4o mini — fast', provider: 'openai', tier: 'free' },
  { id: 'grok-4.3', label: 'Grok 4.3 — best quality', provider: 'xai', tier: 'pro' },
  { id: 'claude-opus-4-8', label: 'Claude Opus 4.8 — Anthropic flagship', provider: 'anthropic', tier: 'pro' },
  { id: 'claude-sonnet-4-6', label: 'Claude Sonnet 4.6 — Anthropic', provider: 'anthropic', tier: 'pro' },
  { id: 'gpt-4o', label: 'GPT-4o — OpenAI', provider: 'openai', tier: 'pro' },
];

export function isProModel(id) {
  return MODEL_CHOICES.find((m) => m.id === id)?.tier === 'pro';
}

export function providerFor(model) {
  const m = String(model || '');
  if (m.startsWith('claude')) return 'anthropic';
  if (m.startsWith('gpt') || m.startsWith('o1') || m.startsWith('o3') || m.startsWith('chatgpt')) return 'openai';
  return 'xai';
}
