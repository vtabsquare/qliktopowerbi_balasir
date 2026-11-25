import React, { createContext, useCallback, useContext, useEffect, useRef, useState, useMemo } from 'react';
import { useRouterState } from '@tanstack/react-router';
import { Session, User } from '@supabase/supabase-js';
import { supabaseProd, supabaseDemo, isDemoEnvironment, getSupabase } from '@/lib/supabase';
import { toast } from 'sonner';
import { isDemoUser } from '@/lib/demo-mode';
import { useDemoClipboardProtection } from '@/lib/demo-clipboard-guard';

type AuthContextType = {
  session: Session | null;
  user: User | null;
  loading: boolean;
  isDemo: boolean;
  isDemoEnv: boolean;
  signOut: () => Promise<void>;
};

const AuthContext = createContext<AuthContextType>({
  session: null,
  user: null,
  loading: true,
  isDemo: false,
  isDemoEnv: false,
  signOut: async () => {},
});

// Inactivity timeout: 30 minutes (in milliseconds)
const INACTIVITY_TIMEOUT_MS = 30 * 60 * 1000;

export const AuthProvider = ({ children }: { children: React.ReactNode }) => {
  const [session, setSession] = useState<Session | null>(null);
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const inactivityTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const isDemoEnv = useMemo(() => pathname.startsWith('/demo') || isDemoEnvironment(), [pathname]);
  const activeClient = useMemo(() => getSupabase(isDemoEnv), [isDemoEnv]);

  // ── Inactivity auto-logout ──────────────────────────────────────────────────
  const resetInactivityTimer = useCallback(() => {
    if (inactivityTimer.current) clearTimeout(inactivityTimer.current);
    inactivityTimer.current = setTimeout(async () => {
      if (activeClient) {
        await activeClient.auth.signOut();
        toast.warning('You have been logged out due to 30 minutes of inactivity.');
      }
    }, INACTIVITY_TIMEOUT_MS);
  }, [activeClient]);

  const clearInactivityTimer = useCallback(() => {
    if (inactivityTimer.current) {
      clearTimeout(inactivityTimer.current);
      inactivityTimer.current = null;
    }
  }, []);

  // ── Listen for user activity events ─────────────────────────────────────────
  useEffect(() => {
    if (!session) {
      clearInactivityTimer();
      return;
    }

    const events: (keyof WindowEventMap)[] = [
      'mousemove', 'mousedown', 'keydown', 'touchstart', 'scroll', 'click',
    ];

    const handleActivity = () => resetInactivityTimer();

    events.forEach((e) => window.addEventListener(e, handleActivity, { passive: true }));
    resetInactivityTimer(); // Start timer immediately on session

    return () => {
      events.forEach((e) => window.removeEventListener(e, handleActivity));
      clearInactivityTimer();
    };
  }, [session, resetInactivityTimer, clearInactivityTimer]);

  // ── Supabase auth state listener ─────────────────────────────────────────────
  useEffect(() => {
    if (!activeClient) {
      setLoading(false);
      return;
    }

    activeClient.auth.getSession().then(({ data: { session } }) => {
      setSession(session);
      setUser(session?.user ?? null);
      setLoading(false);
    });

    const { data: { subscription } } = activeClient.auth.onAuthStateChange((_event, session) => {
      setSession(session);
      setUser(session?.user ?? null);
      setLoading(false);
    });

    return () => subscription.unsubscribe();
  }, [activeClient]);

  const signOut = useCallback(async () => {
    if (activeClient) {
      await activeClient.auth.signOut();
    }
    setSession(null);
    setUser(null);
    if (isDemoEnv) {
      window.location.href = '/demo';
    } else {
      window.location.href = '/auth';
    }
  }, [activeClient, isDemoEnv]);

  const isDemo = useMemo(() => isDemoEnv || isDemoUser(user), [isDemoEnv, user]);
  useDemoClipboardProtection(isDemo);

  return (
    <AuthContext.Provider value={{ session, user, loading, isDemo, isDemoEnv, signOut }}>
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => {
  return useContext(AuthContext);
};

export const useDemoMode = () => {
  const { isDemo, user } = useAuth();
  return { isDemo, user };
};
