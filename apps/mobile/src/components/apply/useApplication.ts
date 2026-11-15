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
import { messageForError } from '@/lib/errors';
import { supabase } from '@/lib/supabase';

type App = Awaited<ReturnType<typeof getMyApplication>>;
export type KycRow = Awaited<ReturnType<typeof getMyVerificationChecks>>[number];

/** Same contract as the web hook: loads/creates the draft, autosaves drafts, validated saves. */
export function useApplication() {
  const [app, setApp] = useState<App | null>(null);
  const [categories, setCategories] = useState<CategoryNode[]>([]);
  const [checks, setChecks] = useState<KycRow[]>([]);
  const [agreementVersion, setAgreementVersion] = useState('');
  const [saving, setSaving] = useState<'idle' | 'saving' | 'saved' | 'error'>('idle');
  const [saveError, setSaveError] = useState<string | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pending = useRef<{ step: StepNumber; data: unknown } | null>(null);

  const refresh = useCallback(async () => {
    const [a, c] = await Promise.all([getMyApplication(supabase), getMyVerificationChecks(supabase)]);
    setApp(a);
    setChecks(c);
    return a;
  }, []);

  useEffect(() => {
    (async () => {
      await startApplication(supabase);
      const [cats, legal] = await Promise.all([listCategories(supabase), getLegalVersions(supabase)]);
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
      await saveStep(supabase, job.step, job.data, { draft: true });
      setSaving('saved');
      setSaveError(null);
      await refresh();
    } catch (e) {
      setSaving('error');
      setSaveError(messageForError(e));
    }
  }, [refresh]);

  const saveDraft = useCallback((step: StepNumber, data: unknown) => {
    if (timer.current) clearTimeout(timer.current);
    pending.current = { step, data };
    setSaving('saving');
    timer.current = setTimeout(runDraft, 800);
  }, [runDraft]);

  const flushDraft = useCallback(async () => {
    if (timer.current) clearTimeout(timer.current);
    await runDraft();
  }, [runDraft]);

  const saveFull = useCallback(async (step: StepNumber, data: unknown) => {
    if (timer.current) clearTimeout(timer.current);
    pending.current = null;
    setSaving('saving');
    try {
      await saveStep(supabase, step, data);
      setSaving('saved');
      await refresh();
    } catch (e) {
      setSaving('error');
      throw e;
    }
  }, [refresh]);

  return { app, categories, checks, agreementVersion, saving, saveError, saveDraft, flushDraft, saveFull, refresh };
}

export type AppCtx = ReturnType<typeof useApplication>;
