'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import {
  getLegalVersions,
  getMyApplication,
  getMyVerificationChecks,
  listCategories,
  saveStep,
  startApplication,
  type CategoryNode,
} from '@3nayan/client';
import type { StepNumber } from '@3nayan/shared';
import { messageFor } from '@/lib/errors';
import { supabase } from '@/lib/supabase';

type App = Awaited<ReturnType<typeof getMyApplication>>;
export type KycRow = Awaited<ReturnType<typeof getMyVerificationChecks>>[number];
export type SaveState = 'idle' | 'saving' | 'saved' | 'error';

/** Loads the caller's application (creating a draft on first visit) and saves steps. */
export function useApplication() {
  const [app, setApp] = useState<App | null>(null);
  const [categories, setCategories] = useState<CategoryNode[]>([]);
  const [checks, setChecks] = useState<KycRow[]>([]);
  const [agreementVersion, setAgreementVersion] = useState('');
  const [saveState, setSaveState] = useState<SaveState>('idle');
  const [saveError, setSaveError] = useState<string | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pending = useRef<{ step: StepNumber; data: unknown } | null>(null);

  const refresh = useCallback(async () => {
    const sb = supabase();
    const [a, c] = await Promise.all([getMyApplication(sb), getMyVerificationChecks(sb)]);
    setApp(a);
    setChecks(c);
    return a;
  }, []);

  useEffect(() => {
    const sb = supabase();
    (async () => {
      await startApplication(sb);
      const [cats, legal] = await Promise.all([listCategories(sb), getLegalVersions(sb)]);
      setCategories(cats);
      setAgreementVersion(legal.practitioner_agreement);
      await refresh();
    })();
  }, [refresh]);

  const runDraft = useCallback(async () => {
    const job = pending.current;
    pending.current = null;
    if (!job) return;
    try {
      await saveStep(supabase(), job.step, job.data, { draft: true });
      setSaveState('saved');
      setSaveError(null);
      await refresh();
    } catch (e) {
      setSaveState('error');
      setSaveError(messageFor(e));
    }
  }, [refresh]);

  /** Autosave (unvalidated draft), debounced 800 ms. */
  const saveDraft = useCallback(
    (step: StepNumber, data: unknown) => {
      if (timer.current) clearTimeout(timer.current);
      pending.current = { step, data };
      setSaveState('saving');
      timer.current = setTimeout(runDraft, 800);
    },
    [runDraft],
  );

  /** Save any pending autosave now (call before leaving the page, e.g. the DigiLocker redirect). */
  const flushDraft = useCallback(async () => {
    if (timer.current) clearTimeout(timer.current);
    await runDraft();
  }, [runDraft]);

  /** Validated save (throws AppError with field details on invalid input). */
  const saveFull = useCallback(
    async (step: StepNumber, data: unknown) => {
      if (timer.current) clearTimeout(timer.current);
      pending.current = null;
      setSaveState('saving');
      try {
        await saveStep(supabase(), step, data);
        setSaveState('saved');
        await refresh();
      } catch (e) {
        setSaveState('error');
        throw e;
      }
    },
    [refresh],
  );

  return { app, categories, checks, agreementVersion, saveState, saveError, saveDraft, flushDraft, saveFull, refresh };
}
