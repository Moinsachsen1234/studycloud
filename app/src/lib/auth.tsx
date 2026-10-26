import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { api, setApiToken, setUnauthorizedHandler } from './api';
import { storage } from './storage';
import type { Me } from './types';

interface AuthCtx {
  status: 'loading' | 'out' | 'in';
  me: Me | null;
  signIn: (token: string) => Promise<void>;
  signOut: () => Promise<void>;
  refreshMe: () => Promise<void>;
}
const Ctx = createContext<AuthCtx>({ status: 'loading', me: null, signIn: async () => {}, signOut: async () => {}, refreshMe: async () => {} });

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const qc = useQueryClient();
  const [booted, setBooted] = useState(false);
  const [hasToken, setHasToken] = useState(false);

  useEffect(() => {
    storage.get('token').then((t) => {
      if (t) {
        setApiToken(t);
        setHasToken(true);
      }
      setBooted(true);
    });
  }, []);

  const signOut = useCallback(async () => {
    try {
      await api('/api/auth/logout', { method: 'POST' });
    } catch {
      /* token may already be invalid */
    }
    setApiToken(null);
    await storage.remove('token');
    setHasToken(false);
    qc.clear();
  }, [qc]);

  useEffect(() => {
    setUnauthorizedHandler(() => {
      setApiToken(null);
      storage.remove('token');
      setHasToken(false);
      qc.clear();
    });
    return () => setUnauthorizedHandler(null);
  }, [qc]);

  const meQ = useQuery({ queryKey: ['me'], queryFn: () => api<Me>('/api/me'), enabled: booted && hasToken, retry: false });

  const signIn = useCallback(
    async (t: string) => {
      setApiToken(t);
      await storage.set('token', t);
      setHasToken(true);
      await qc.invalidateQueries({ queryKey: ['me'] });
    },
    [qc],
  );

  const status: AuthCtx['status'] = !booted ? 'loading' : !hasToken ? 'out' : meQ.isPending ? 'loading' : meQ.data ? 'in' : 'out';
  const value = useMemo(
    () => ({ status, me: meQ.data ?? null, signIn, signOut, refreshMe: async () => void (await qc.invalidateQueries({ queryKey: ['me'] })) }),
    [status, meQ.data, signIn, signOut, qc],
  );
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export const useAuth = () => useContext(Ctx);
