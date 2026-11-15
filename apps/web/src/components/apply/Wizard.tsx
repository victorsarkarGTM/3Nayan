'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useEffect } from 'react';
import type { StepNumber } from '@3nayan/shared';
import { AppShell } from '@/components/AppShell';
import { Alert } from '@/components/ui';
import { Step1 } from './Step1';
import { Step2 } from './Step2';
import { Step3 } from './Step3';
import { Step4 } from './Step4';
import { Step5 } from './Step5';
import { Step6 } from './Step6';
import { useApplication } from './useApplication';

export const STEP_TITLES: Record<StepNumber, string> = {
  1: 'About you',
  2: 'Session formats',
  3: 'Credentials',
  4: 'Video intro',
  5: 'Identity and bank',
  6: 'Agreement',
};

export function Wizard({ step }: { step: StepNumber }) {
  const router = useRouter();
  const ctx = useApplication();
  const status = ctx.app?.practitioner?.status;
  const editable = status === 'draft' || status === 'changes_requested';

  useEffect(() => {
    if (status && !editable) router.replace('/practitioner/status');
  }, [status, editable, router]);

  const next = () => router.push(step < 6 ? `/practitioner/apply/${step + 1}` : '/practitioner/status');
  const steps = ctx.app?.completeness?.steps;

  return (
    <AppShell wide>
      <div className="grid gap-8 md:grid-cols-[220px_1fr]">
        <nav aria-label="Application steps">
          <ol className="flex flex-col gap-1">
            {([1, 2, 3, 4, 5, 6] as StepNumber[]).map((n) => (
              <li key={n}>
                <Link
                  href={`/practitioner/apply/${n}`}
                  aria-current={n === step ? 'step' : undefined}
                  className={`flex items-center justify-between rounded-md px-3 py-2 text-sm ${
                    n === step ? 'bg-primary-soft font-semibold text-primary' : 'text-ink hover:bg-surface'
                  }`}
                >
                  <span>
                    {n}. {STEP_TITLES[n]}
                  </span>
                  <span className={steps?.[n] ? 'text-success' : 'text-muted'} aria-label={steps?.[n] ? 'complete' : 'incomplete'}>
                    {steps?.[n] ? '✓' : '•'}
                  </span>
                </Link>
              </li>
            ))}
          </ol>
        </nav>
        <div>
          <div className="mb-6 flex items-baseline justify-between gap-4">
            <h1 className="text-2xl font-semibold">{STEP_TITLES[step]}</h1>
            <span className="text-xs text-muted" aria-live="polite">
              {ctx.saveState === 'saving' ? 'Saving…' : ctx.saveState === 'saved' ? 'Saved' : ''}
            </span>
          </div>
          {ctx.saveState === 'error' && ctx.saveError && <Alert tone="danger">{ctx.saveError}</Alert>}
          {!ctx.app?.practitioner || !ctx.app.snapshot ? (
            <p className="text-sm text-muted">Loading your application…</p>
          ) : (
            <StepBody step={step} ctx={ctx} onContinue={next} />
          )}
        </div>
      </div>
    </AppShell>
  );
}

export type StepProps = { ctx: ReturnType<typeof useApplication>; onContinue: () => void };

function StepBody({ step, ...props }: StepProps & { step: StepNumber }) {
  switch (step) {
    case 1:
      return <Step1 {...props} />;
    case 2:
      return <Step2 {...props} />;
    case 3:
      return <Step3 {...props} />;
    case 4:
      return <Step4 {...props} />;
    case 5:
      return <Step5 {...props} />;
    case 6:
      return <Step6 {...props} />;
  }
}
