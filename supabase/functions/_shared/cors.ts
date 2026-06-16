// Shared CORS + JSON helpers for SLOP.game edge functions.
// Origin '*' is safe here: auth is a Bearer access token (not cookies), so a
// hostile origin can't ride the user's session.
export const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

export function jsonRes(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}

export const clamp = (n: number, lo: number, hi: number) =>
  Math.max(lo, Math.min(Number.isFinite(n) ? n : lo, hi));
