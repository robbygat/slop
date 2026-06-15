// Supabase client singleton for slop.game.
//
// The URL + anon key below are PUBLIC by design — the anon key is meant to ship
// in the browser and is safe to commit because every table is protected by
// Row Level Security (see supabase/migrations/001_initial.sql). The service_role
// key must NEVER appear in frontend code.
//
// For local development you can override these without editing this file by
// defining `window.SLOP_CONFIG = { supabaseUrl, supabaseAnonKey }` before the
// module loads (e.g. via a small inline script that reads slop.config.json).

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.45.4';

const DEFAULTS = {
  supabaseUrl: 'https://yqlolbebqfsodqgjlbeh.supabase.co',
  supabaseAnonKey:
    'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InlxbG9sYmVicWZzb2RxZ2psYmVoIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODE0OTQ1OTEsImV4cCI6MjA5NzA3MDU5MX0.mDpfE_Se9K52TG-YMouNTtgm7MWSii8L5xsPfozHKYg',
};

const cfg = { ...DEFAULTS, ...(typeof window !== 'undefined' ? window.SLOP_CONFIG : null) };

let client = null;

// Lazily build the singleton so a missing/blocked CDN doesn't crash module load.
export function getSupabase() {
  if (client) return client;
  if (!cfg.supabaseUrl || !cfg.supabaseAnonKey) return null;
  client = createClient(cfg.supabaseUrl, cfg.supabaseAnonKey, {
    auth: {
      persistSession: true,
      autoRefreshToken: true,
      detectSessionInUrl: true, // completes the OAuth redirect (#access_token=…)
    },
  });
  return client;
}

export const SUPABASE_URL = cfg.supabaseUrl;
