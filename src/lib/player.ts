import { supabase } from './supabase';

export interface Player {
  id: string;
  nickname: string;
}

export class NicknameTakenError extends Error {
  constructor() {
    super('暱稱已被使用');
    this.name = 'NicknameTakenError';
  }
}

export async function requestMagicLink(email: string): Promise<void> {
  const { error } = await supabase.auth.signInWithOtp({
    email,
    options: {
      shouldCreateUser: true,
      emailRedirectTo: window.location.origin,
    },
  });
  if (error) throw error;
}

// Fires immediately with the current session (including one just restored from
// a magic-link redirect), then again on every sign-in/sign-out. Returns an
// unsubscribe function.
export function onAuthStateChange(callback: (uid: string | null) => void): () => void {
  const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
    callback(session?.user.id ?? null);
  });
  return () => subscription.unsubscribe();
}

export async function fetchPlayerProfiles(ownerUid: string): Promise<Player[]> {
  const { data, error } = await supabase
    .from('players')
    .select('id, nickname')
    .eq('owner_uid', ownerUid)
    .order('created_at', { ascending: true });

  if (error) throw error;
  return data ?? [];
}

export async function createPlayer(ownerUid: string, nickname: string): Promise<Player> {
  const { data, error } = await supabase
    .from('players')
    .insert({ owner_uid: ownerUid, nickname })
    .select('id, nickname')
    .single();

  if (error) {
    if (error.code === '23505') {
      throw new NicknameTakenError();
    }
    throw error;
  }

  return data;
}

export async function renamePlayer(playerId: string, newNickname: string): Promise<Player> {
  const { data, error } = await supabase
    .from('players')
    .update({ nickname: newNickname })
    .eq('id', playerId)
    .select('id, nickname')
    .single();

  if (error) {
    if (error.code === '23505') {
      throw new NicknameTakenError();
    }
    throw error;
  }

  return data;
}

export interface PlayHistoryEntry {
  id: number;
  score: number;
  played_at: string;
}

export async function fetchPlayHistory(playerId: string, limit = 20): Promise<PlayHistoryEntry[]> {
  const { data, error } = await supabase
    .from('plays')
    .select('id, score, played_at')
    .eq('player_id', playerId)
    .order('played_at', { ascending: false })
    .limit(limit);

  if (error) throw error;
  return data ?? [];
}

export async function fetchPlayCount(playerId: string): Promise<number> {
  const { count, error } = await supabase
    .from('plays')
    .select('*', { count: 'exact', head: true })
    .eq('player_id', playerId);

  if (error) throw error;
  return count ?? 0;
}

export async function recordPlay(playerId: string, score: number): Promise<void> {
  const { error } = await supabase
    .from('plays')
    .insert({ player_id: playerId, score });

  if (error) throw error;
}

export async function logout(): Promise<void> {
  const { error } = await supabase.auth.signOut();
  if (error) throw error;
}

const LAST_PROFILE_KEY_PREFIX = 'treasure-game-last-profile:';

export function getLastActiveProfileId(ownerUid: string): string | null {
  return localStorage.getItem(LAST_PROFILE_KEY_PREFIX + ownerUid);
}

export function setLastActiveProfileId(ownerUid: string, profileId: string): void {
  localStorage.setItem(LAST_PROFILE_KEY_PREFIX + ownerUid, profileId);
}
