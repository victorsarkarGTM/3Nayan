'use client';

import { useState, type FormEvent } from 'react';
import { avatarUrl, uploadAvatar } from '@3nayan/client';
import { LIMITS, SESSION_LANGUAGES } from '@3nayan/shared';
import { Card, Field, TextArea, TextInput } from '@/components/ui';
import { fieldErrors, messageFor } from '@/lib/errors';
import { supabase } from '@/lib/supabase';
import { StepActions } from './StepActions';
import type { StepProps } from './Wizard';

type S1 = { displayName: string; photoPath: string; bio: string; yearsExperience: number | ''; subcategoryIds: string[]; languages: string[] };

export function Step1({ ctx, onContinue }: StepProps) {
  const init = (ctx.app?.snapshot?.step1 ?? {}) as Partial<S1>;
  const [v, setV] = useState<S1>({
    displayName: init.displayName ?? '',
    photoPath: init.photoPath ?? '',
    bio: init.bio ?? '',
    yearsExperience: init.yearsExperience ?? '',
    subcategoryIds: init.subcategoryIds ?? [],
    languages: init.languages ?? [],
  });
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const toData = (s: S1) => ({ ...s, yearsExperience: s.yearsExperience === '' ? undefined : Number(s.yearsExperience) });
  const update = (patch: Partial<S1>) => {
    const nextV = { ...v, ...patch };
    setV(nextV);
    setErrors({});
    ctx.saveDraft(1, toData(nextV));
  };
  const toggle = (list: string[], item: string, max?: number) =>
    list.includes(item) ? list.filter((x) => x !== item) : max && list.length >= max ? list : [...list, item];

  async function onPhoto(file?: File) {
    if (!file) return;
    try {
      const { path } = await uploadAvatar(supabase(), file);
      update({ photoPath: path });
    } catch (e) {
      setErrors({ photoPath: messageFor(e) });
    }
  }

  async function submit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await ctx.saveFull(1, toData(v));
      onContinue();
    } catch (err) {
      setErrors(fieldErrors(err));
      setError('Some details need another look.');
    } finally {
      setBusy(false);
    }
  }

  const photo = avatarUrl(supabase(), v.photoPath);
  return (
    <form onSubmit={submit} noValidate className="flex flex-col gap-5">
      <Card className="flex flex-col gap-5">
        <Field label="Display name" hint="How seekers will see you" error={errors.displayName}>
          {(id, d) => <TextInput id={id} aria-describedby={d} value={v.displayName} invalid={!!errors.displayName} onChange={(e) => update({ displayName: e.target.value })} />}
        </Field>
        <Field label="Profile photo" hint="A clear, friendly photo of your face. JPG or PNG, up to 5 MB." error={errors.photoPath}>
          {(id, d) => (
            <div className="flex items-center gap-4">
              {photo ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={photo} alt="Your profile photo" className="h-16 w-16 rounded-full object-cover" />
              ) : (
                <div className="h-16 w-16 rounded-full bg-canvas" aria-hidden />
              )}
              <input id={id} aria-describedby={d} type="file" accept="image/jpeg,image/png" className="text-sm" onChange={(e) => onPhoto(e.target.files?.[0])} />
            </div>
          )}
        </Field>
        <Field label="About you" hint={`${v.bio.trim().length}/${LIMITS.bioMax} characters (at least ${LIMITS.bioMin})`} error={errors.bio}>
          {(id, d) => <TextArea id={id} aria-describedby={d} value={v.bio} maxLength={LIMITS.bioMax} invalid={!!errors.bio} onChange={(e) => update({ bio: e.target.value })} />}
        </Field>
        <Field label="Years of experience" error={errors.yearsExperience}>
          {(id, d) => (
            <TextInput id={id} aria-describedby={d} type="number" min={0} max={LIMITS.experienceMax} className="max-w-32" value={v.yearsExperience} invalid={!!errors.yearsExperience}
              onChange={(e) => update({ yearsExperience: e.target.value === '' ? '' : Number(e.target.value) })} />
          )}
        </Field>
      </Card>
      <Card>
        <fieldset>
          <legend className="text-sm font-medium">What do you practise?</legend>
          <p className="mt-1 text-xs text-muted">Choose 1 to {LIMITS.subcategoriesMax}.</p>
          {errors.subcategoryIds && <p role="alert" className="mt-1 text-xs font-medium text-danger">{errors.subcategoryIds}</p>}
          <div className="mt-3 grid gap-4 sm:grid-cols-3">
            {ctx.categories.map((cat) => (
              <div key={cat.id}>
                <p className="text-sm font-semibold">{cat.name}</p>
                <div className="mt-2 flex flex-col gap-1.5">
                  {cat.children.map((sub) => (
                    <label key={sub.id} className="flex items-center gap-2 text-sm">
                      <input type="checkbox" checked={v.subcategoryIds.includes(sub.id)}
                        onChange={() => update({ subcategoryIds: toggle(v.subcategoryIds, sub.id, LIMITS.subcategoriesMax) })} />
                      {sub.name}
                    </label>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </fieldset>
      </Card>
      <Card>
        <fieldset>
          <legend className="text-sm font-medium">Languages you offer sessions in</legend>
          {errors.languages && <p role="alert" className="mt-1 text-xs font-medium text-danger">{errors.languages}</p>}
          <div className="mt-3 flex flex-wrap gap-x-5 gap-y-2">
            {SESSION_LANGUAGES.map((l) => (
              <label key={l} className="flex items-center gap-2 text-sm">
                <input type="checkbox" checked={v.languages.includes(l)} onChange={() => update({ languages: toggle(v.languages, l) })} />
                {l}
              </label>
            ))}
          </div>
        </fieldset>
      </Card>
      <StepActions busy={busy} error={error} />
    </form>
  );
}
