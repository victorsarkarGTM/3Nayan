'use client';

import { useEffect, useState, type FormEvent } from 'react';
import { listMyCertificates, uploadPractitionerFile } from '@3nayan/client';
import { LIMITS } from '@3nayan/shared';
import { Button, Card, Field, TextArea, TextInput } from '@/components/ui';
import { fieldErrors, messageFor } from '@/lib/errors';
import { supabase } from '@/lib/supabase';
import { StepActions } from './StepActions';
import type { StepProps } from './Wizard';

type Cert = { id: string; file_name: string };

export function Step3({ ctx, onContinue }: StepProps) {
  const init = (ctx.app?.snapshot?.step3 ?? {}) as { credentialsText?: string; links?: string[] };
  const [certs, setCerts] = useState<Cert[]>([]);
  const [text, setText] = useState(init.credentialsText ?? '');
  const [links, setLinks] = useState<string[]>(init.links?.length ? init.links : ['']);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [error, setError] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const [busy, setBusy] = useState(false);
  const practitionerId = ctx.app!.practitioner!.id;

  useEffect(() => {
    listMyCertificates(supabase()).then(setCerts);
  }, []);

  const toData = (c: Cert[], t: string, l: string[]) => ({
    certificateIds: c.map((x) => x.id),
    ...(t.trim() ? { credentialsText: t } : {}),
    links: l.map((x) => x.trim()).filter(Boolean),
  });

  async function onFiles(files: FileList | null) {
    if (!files) return;
    setUploading(true);
    setErrors({});
    const added: Cert[] = [];
    for (const f of Array.from(files)) {
      if (certs.length + added.length >= LIMITS.certificatesMax) break;
      try {
        const { documentId } = await uploadPractitionerFile(supabase(), practitionerId, 'certificate', f, { fileName: f.name });
        added.push({ id: documentId!, file_name: f.name });
      } catch (e) {
        setErrors({ certificates: `${f.name}: ${messageFor(e)}` });
      }
    }
    setCerts((c) => [...c, ...added]);
    setUploading(false);
  }

  function remove(id: string) {
    const next = certs.filter((c) => c.id !== id);
    setCerts(next);
    ctx.saveDraft(3, toData(next, text, links));
  }

  async function submit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await ctx.saveFull(3, toData(certs, text, links));
      onContinue();
    } catch (err) {
      setErrors(fieldErrors(err));
      setError('Some details need another look.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <form onSubmit={submit} noValidate className="flex flex-col gap-5">
      <Card className="flex flex-col gap-4">
        <Field label="Certificates" hint={`Optional. PDF, JPG or PNG, up to 10 MB each, at most ${LIMITS.certificatesMax}.`} error={errors.certificates}>
          {(id, d) => (
            <input id={id} aria-describedby={d} type="file" multiple accept="application/pdf,image/jpeg,image/png" className="text-sm"
              disabled={uploading || certs.length >= LIMITS.certificatesMax} onChange={(e) => onFiles(e.target.files)} />
          )}
        </Field>
        {uploading && <p className="text-sm text-muted">Uploading…</p>}
        {certs.length > 0 && (
          <ul className="flex flex-col divide-y divide-line rounded-md border border-line">
            {certs.map((c) => (
              <li key={c.id} className="flex items-center justify-between px-3 py-2 text-sm">
                <span>{c.file_name}</span>
                <Button type="button" variant="ghost" onClick={() => remove(c.id)} aria-label={`Remove ${c.file_name}`}>
                  Remove
                </Button>
              </li>
            ))}
          </ul>
        )}
      </Card>
      <Card className="flex flex-col gap-4">
        <Field label="Training and lineage" hint={`Optional. Who trained you, and in what tradition. ${text.length}/${LIMITS.credentialsTextMax}`} error={errors.credentialsText}>
          {(id, d) => (
            <TextArea id={id} aria-describedby={d} value={text} maxLength={LIMITS.credentialsTextMax}
              onChange={(e) => (setText(e.target.value), ctx.saveDraft(3, toData(certs, e.target.value, links)))} />
          )}
        </Field>
        <fieldset className="flex flex-col gap-2">
          <legend className="text-sm font-medium">Links (optional)</legend>
          <p className="text-xs text-muted">Your website or social profiles, up to {LIMITS.linksMax}.</p>
          {links.map((l, i) => (
            <div key={i}>
              <TextInput aria-label={`Link ${i + 1}`} type="url" placeholder="https://" value={l} invalid={!!errors[`links.${i}`]}
                onChange={(e) => {
                  const next = links.map((x, j) => (j === i ? e.target.value : x));
                  setLinks(next);
                  ctx.saveDraft(3, toData(certs, text, next));
                }} />
              {errors[`links.${i}`] && <p role="alert" className="mt-1 text-xs font-medium text-danger">{errors[`links.${i}`]}</p>}
            </div>
          ))}
          {links.length < LIMITS.linksMax && (
            <div>
              <Button type="button" variant="ghost" onClick={() => setLinks([...links, ''])}>
                Add another link
              </Button>
            </div>
          )}
        </fieldset>
      </Card>
      <StepActions busy={busy} error={error} />
    </form>
  );
}
