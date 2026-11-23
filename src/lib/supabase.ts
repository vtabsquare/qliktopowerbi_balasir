import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { PUBLIC_APP_CONFIG } from '@/config/public-app-config';

const supabaseUrl = PUBLIC_APP_CONFIG.supabaseUrl;
const supabaseAnonKey = PUBLIC_APP_CONFIG.supabaseAnonKey;

export const isSupabaseConfigured = Boolean(supabaseUrl && supabaseAnonKey);
export const supabaseConfigSource = PUBLIC_APP_CONFIG.supabaseConfigSource;

/**
 * Dedicated Production Supabase Client
 * Uses isolated 'sb-prod-auth-token' storage key.
 */
export const supabaseProd: SupabaseClient = isSupabaseConfigured
  ? createClient(supabaseUrl, supabaseAnonKey, {
      auth: {
        storageKey: 'sb-prod-auth-token',
        persistSession: true,
        autoRefreshToken: true,
        detectSessionInUrl: true,
      },
    })
  : (null as unknown as SupabaseClient);

/**
 * Dedicated Demo Supabase Client
 * Uses isolated 'sb-demo-auth-token' storage key.
 * Logging in or out here never touches Production sessions.
 */
export const supabaseDemo: SupabaseClient = isSupabaseConfigured
  ? createClient(supabaseUrl, supabaseAnonKey, {
      auth: {
        storageKey: 'sb-demo-auth-token',
        persistSession: true,
        autoRefreshToken: true,
        detectSessionInUrl: true,
      },
    })
  : (null as unknown as SupabaseClient);

/**
 * Context-aware Supabase Proxy
 * Automatically routes calls to either Demo or Production client based on current URL path.
 */
export function isDemoEnvironment(): boolean {
  if (typeof window === 'undefined') return false;
  return (
    window.location.pathname.startsWith('/demo') ||
    window.location.search.includes('demo=true') ||
    window.location.search.includes('env=demo')
  );
}

export function getSupabase(isDemo?: boolean): SupabaseClient {
  const demo = isDemo !== undefined ? isDemo : isDemoEnvironment();
  return demo ? supabaseDemo : supabaseProd;
}

export const supabase: SupabaseClient = new Proxy({} as SupabaseClient, {
  get(_target, prop) {
    const client = getSupabase();
    if (!client) return undefined;
    const value = (client as unknown as Record<string | symbol, unknown>)[prop];
    return typeof value === 'function' ? value.bind(client) : value;
  },
});
