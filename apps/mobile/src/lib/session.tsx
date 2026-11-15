import type { Session } from '@supabase/supabase-js';
import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from 'react';
import { hasCurrentConsents } from '@3nayan/client';
import { supabase } from './supabase';

type State = { ready: boolean; session: Session | null; onboarded: boolean; isStaff: boolean; refresh: () => Promise<void> };
const Ctx = createContext<State>({ ready: false, session: null, onboarded: false, isStaff: false, refresh: async () => {} });

export function SessionProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<Omit<State, 'refresh'>>({ ready: false, session: null, onboarded: false, isStaff: false });

  const evaluate = useCallback(async (session: Session | null) => {
    if (!session) return setState({ ready: true, session: null, onboarded: false, isStaff: false });
    const uid = session.user.id;
    const [{ data: staff }, { data: profile }, consented] = await Promise.all([
      supabase.from('staff').select('user_id').eq('user_id', uid).maybeSingle(),
      supabase.from('profiles').select('full_name').eq('id', uid).maybeSingle(),
      hasCurrentConsents(supabase),
    ]);
    setState({ ready: true, session, isStaff: !!staff, onboarded: !!profile?.full_name && consented });
  }, []);

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => evaluate(data.session));
    const { data } = supabase.auth.onAuthStateChange((_e, session) => {
      evaluate(session);
    });
    return () => data.subscription.unsubscribe();
  }, [evaluate]);

  const refresh = useCallback(async () => {
    const { data } = await supabase.auth.getSession();
    await evaluate(data.session);
  }, [evaluate]);

  return <Ctx.Provider value={{ ...state, refresh }}>{children}</Ctx.Provider>;
}

export const useSession = () => useContext(Ctx);
