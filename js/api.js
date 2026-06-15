// Data layer for slop.game, backed by Supabase (Postgres + RLS).
//
// Auth itself lives in account.js (it talks to supabase.auth directly); this
// module is the typed gateway for profiles, games, plays, and reports. Every
// helper degrades to null/[] when Supabase is unreachable so the static site
// still renders instead of crashing.

import { getSupabase } from './supabase.js';

const sb = () => getSupabase();

// Shape a games row (with embedded owner) into the flat object the UI expects.
function mapGame(row) {
  if (!row) return null;
  return {
    id: row.slug,            // the UI keys play counts + cards by this
    slug: row.slug,
    gameId: row.id,          // the underlying uuid (for moderation/reports)
    name: row.name,
    desc: row.description,
    description: row.description,
    prompt: row.prompt,
    html: row.html,
    thumb: row.thumb,
    username: row.profiles?.username || row.username || 'anon',
    owner_id: row.owner_id,
    plays: row.play_count ?? 0,
    play_count: row.play_count ?? 0,
    status: row.status,
    created_at: row.created_at ? new Date(row.created_at).getTime() : 0,
  };
}

// slugify a game name into a URL-safe segment.
function slugify(name) {
  return String(name || 'slop-game')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 60) || 'game';
}

export const api = {
  // -------------------------------------------------------------- profiles
  async me() {
    const s = sb();
    if (!s) return null;
    const { data: { user } } = await s.auth.getUser();
    if (!user) return null;
    const { data } = await s.from('profiles')
      .select('id, username, display_name, avatar_url, is_moderator')
      .eq('id', user.id)
      .maybeSingle();
    // Signed in but profile row not materialised yet → still "logged in".
    return { id: user.id, email: user.email, username: null, ...(data || {}) };
  },

  async profileByUsername(username) {
    const s = sb();
    if (!s || !username) return null;
    const { data } = await s.from('profiles')
      .select('id, username, display_name, avatar_url')
      .ilike('username', username)
      .maybeSingle();
    return data || null;
  },

  // Validate + claim a unique username for the signed-in user (RPC).
  async claimUsername(username) {
    const s = sb();
    if (!s) throw new Error('cannot reach slop.game servers — check your connection');
    const { data, error } = await s.rpc('claim_username', { p_username: username });
    if (error) throw new Error(friendly(error.message));
    return data;
  },

  // Update the signed-in user's own profile (display name / avatar).
  async updateProfile(patch) {
    const s = sb();
    if (!s) throw new Error('cannot reach slop.game servers — check your connection');
    const { data: { user } } = await s.auth.getUser();
    if (!user) throw new Error('sign in first');
    const fields = {};
    if (patch.display_name !== undefined) fields.display_name = patch.display_name || null;
    if (patch.avatar_url !== undefined) fields.avatar_url = patch.avatar_url || null;
    const { error } = await s.from('profiles').update(fields).eq('id', user.id);
    if (error) throw new Error(friendly(error.message));
    return true;
  },

  // Upload a profile picture to the public `avatars` bucket → returns its URL.
  async uploadAvatar(file) {
    const s = sb();
    if (!s) throw new Error('cannot reach slop.game servers — check your connection');
    const { data: { user } } = await s.auth.getUser();
    if (!user) throw new Error('sign in first');
    const ext = ((file.name || '').split('.').pop() || 'png').toLowerCase().replace(/[^a-z0-9]/g, '') || 'png';
    const path = `${user.id}/avatar.${ext}`;
    const { error } = await s.storage.from('avatars').upload(path, file, { upsert: true, cacheControl: '3600' });
    if (error) throw new Error(error.message);
    const { data } = s.storage.from('avatars').getPublicUrl(path);
    return `${data.publicUrl}?v=${Date.now()}`; // cache-bust on re-upload
  },

  // -------------------------------------------------------------- follows
  async followerCount(userId) {
    const s = sb();
    if (!s || !userId) return 0;
    const { count } = await s.from('follows')
      .select('*', { count: 'exact', head: true })
      .eq('following_id', userId);
    return count || 0;
  },

  async isFollowing(targetId) {
    const s = sb();
    if (!s || !targetId) return false;
    const { data: { user } } = await s.auth.getUser();
    if (!user) return false;
    const { data } = await s.from('follows')
      .select('follower_id')
      .eq('follower_id', user.id)
      .eq('following_id', targetId)
      .maybeSingle();
    return !!data;
  },

  async follow(targetId) {
    const s = sb();
    if (!s) throw new Error('cannot reach slop.game servers — check your connection');
    const { data: { user } } = await s.auth.getUser();
    if (!user) throw new Error('sign in to follow creators');
    const { error } = await s.from('follows').insert({ follower_id: user.id, following_id: targetId });
    if (error && error.code !== '23505') throw new Error(friendly(error.message));
    return true;
  },

  async unfollow(targetId) {
    const s = sb();
    if (!s) return false;
    const { data: { user } } = await s.auth.getUser();
    if (!user) return false;
    await s.from('follows').delete().eq('follower_id', user.id).eq('following_id', targetId);
    return true;
  },

  // -------------------------------------------------------------- games
  // Lightweight list for the browse grid (no html payloads).
  async communityGames() {
    const s = sb();
    if (!s) return null;
    const { data, error } = await s.from('games')
      .select('id, slug, name, description, thumb, play_count, created_at, owner_id, profiles ( username )')
      .eq('status', 'published')
      .order('created_at', { ascending: false })
      .limit(500);
    if (error) return null;
    return (data || []).map(mapGame);
  },

  // Games for a single profile page.
  async gamesByOwner(ownerId) {
    const s = sb();
    if (!s || !ownerId) return [];
    const { data } = await s.from('games')
      .select('id, slug, name, description, thumb, play_count, created_at, owner_id, profiles ( username )')
      .eq('owner_id', ownerId)
      .eq('status', 'published')
      .order('created_at', { ascending: false });
    return (data || []).map(mapGame);
  },

  // Full game (with html) by slug — for the play page. Returns null if missing
  // or removed (so removed games 404 on the play route).
  async communityGame(slug) {
    const s = sb();
    if (!s || !slug) return null;
    const { data } = await s.from('games')
      .select('id, slug, name, description, prompt, html, thumb, play_count, status, owner_id, profiles ( username )')
      .eq('slug', slug)
      .eq('status', 'published')
      .maybeSingle();
    return mapGame(data);
  },

  // Publish a game: pick a globally-unique slug then insert. Returns
  // { slug, id, url } or throws a friendly error.
  async publishGame(game) {
    const s = sb();
    if (!s) throw new Error('cannot reach slop.game servers — check your connection');
    const { data: { user } } = await s.auth.getUser();
    if (!user) throw new Error('sign in first, then come back to publish');

    const base = slugify(game.name);
    for (let attempt = 0; attempt < 5; attempt++) {
      const slug = attempt === 0 ? base : `${base}-${Math.random().toString(36).slice(2, 6)}`;
      const { data, error } = await s.from('games').insert({
        slug,
        owner_id: user.id,
        name: game.name,
        description: game.desc || game.description || null,
        prompt: game.prompt || null,
        html: game.html,
        thumb: game.thumb || null,
        status: 'published',
      }).select('slug, id').single();
      if (!error) {
        return { slug: data.slug, id: data.id, url: `${location.origin}/play/${data.slug}` };
      }
      if (error.code === '23505') continue; // slug collision — try a new suffix
      throw new Error(friendly(error.message));
    }
    throw new Error('could not find a free name for that game — try renaming it');
  },

  // Moderator soft-delete: flip status to 'removed' (RLS enforces mod-only).
  async removeGame(gameId) {
    const s = sb();
    if (!s) return false;
    const { error } = await s.from('games').update({ status: 'removed' }).eq('id', gameId);
    return !error;
  },

  // -------------------------------------------------------------- plays
  async recordPlay(slug) {
    const s = sb();
    if (!s || !slug) return null;
    const { data, error } = await s.rpc('increment_play_count', { p_slug: slug });
    return error ? null : data;
  },

  // Map of slug → play_count for every published game (the grid merges this in).
  async allPlays() {
    const s = sb();
    if (!s) return null;
    const { data, error } = await s.from('games')
      .select('slug, play_count')
      .eq('status', 'published');
    if (error) return null;
    return Object.fromEntries((data || []).map((g) => [g.slug, g.play_count || 0]));
  },

  // -------------------------------------------------------------- reports
  async reportGame(gameId, _name, reason) {
    const s = sb();
    if (!s) return false;
    const { data: { user } } = await s.auth.getUser();
    const { error } = await s.from('reports').insert({
      game_id: looksLikeUuid(gameId) ? gameId : null,
      reporter_id: user?.id || null,
      reason: reason || null,
    });
    return !error;
  },

  // -------------------------------------------------------------- legacy stubs
  // These belonged to the old node/SQLite backend (community board, friends,
  // invites, waitlist). They are not part of the Supabase scope; they resolve to
  // null so the few remaining callers degrade gracefully instead of throwing.
  config: async () => null,
  posts: async () => null,
  createPost: async () => null,
  joinWaitlist: async () => null,
  friends: async () => null,
  searchUsers: async () => [],
  friendRequest: async () => null,
  friendRespond: async () => null,
  friendRemove: async () => null,
  sendInvite: async () => null,
  inviteSeen: async () => null,
};

function looksLikeUuid(v) {
  return typeof v === 'string' && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(v);
}

// Turn raw Postgres/Supabase errors into something a player can read.
function friendly(msg) {
  const m = String(msg || '');
  if (/duplicate key|already exists|taken/i.test(m)) return 'that username is taken';
  if (/3-20 chars|invalid/i.test(m)) return 'username must be 3-20 chars: letters, numbers, _';
  if (/not signed in|JWT|auth/i.test(m)) return 'sign in first';
  return m || 'something went wrong';
}

export function timeAgo(ts) {
  const s = Math.max(1, Math.floor((Date.now() - ts) / 1000));
  if (s < 60) return `${s}s ago`;
  if (s < 3600) return `${Math.floor(s / 60)}m ago`;
  if (s < 86400) return `${Math.floor(s / 3600)}h ago`;
  return `${Math.floor(s / 86400)}d ago`;
}

export function escapeHTML(s) {
  return String(s ?? '').replace(/[&<>"']/g, (c) => (
    { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]
  ));
}
