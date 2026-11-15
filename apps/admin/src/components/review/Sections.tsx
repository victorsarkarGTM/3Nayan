'use client';

import { avatarUrl, getDocumentUrl, type getApplicationDetail } from '@3nayan/client';
import { formatIST } from '@3nayan/shared';
import { useState, type ReactNode } from 'react';
import { Badge, Button, Card } from '@/components/ui';
import { messageFor } from '@/lib/errors';

import { supabase } from '@/lib/supabase';

export type Detail = Awaited<ReturnType<typeof getApplicationDetail>>;

const Row = ({ label, children }: { label: string; children: ReactNode }) => (
  <div className="grid gap-1 py-2 sm:grid-cols-[180px_1fr]">
    <dt className="text-sm text-muted">{label}</dt>
    <dd className="text-sm text-ink">{children ?? '—'}</dd>
  </div>
);

export function ApplicationSections({ d }: { d: Detail }) {
  const p = d.practitioner;
  const [videoUrl, setVideoUrl] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const photo = avatarUrl(supabase(), p.photo_path);
  const addr = p.residential_address as { street1?: string; street2?: string; city?: string; state?: string; pincode?: string } | null;

  async function open(path: string) {
    setError(null);
    try {
      const { url } = await getDocumentUrl(supabase(), path);
      window.open(url, '_blank', 'noopener');
    } catch (e) {
      setError(messageFor(e));
    }
  }
  async function playVideo() {
    setError(null);
    try {
      setVideoUrl((await getDocumentUrl(supabase(), p.video_path!)).url);
    } catch (e) {
      setError(messageFor(e));
    }
  }

  return (
    <div className="flex flex-col gap-4">
      {error && <p role="alert" className="text-sm text-danger">{error}</p>}
      <Card>
        <h2 className="mb-2 font-semibold">1. About</h2>
        <div className="flex gap-4">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          {photo && <img src={photo} alt={`${p.display_name} profile photo`} className="h-20 w-20 rounded-full object-cover" />}
          <dl className="flex-1 divide-y divide-line">
            <Row label="Display name">{p.display_name}</Row>
            <Row label="Phone">{d.profile?.phone}</Row>
            <Row label="Experience">{p.years_experience != null ? `${p.years_experience} years` : null}</Row>
            <Row label="Practices">{d.categories.map((c) => (c.categories as { name: string } | null)?.name).filter(Boolean).join(', ')}</Row>
            <Row label="Languages">{p.languages.join(', ')}</Row>
            <Row label="Bio"><span className="whitespace-pre-wrap">{p.bio}</span></Row>
          </dl>
        </div>
      </Card>
      <Card>
        <h2 className="mb-2 font-semibold">2. Session formats</h2>
        <dl className="divide-y divide-line">
          <Row label="Online">{p.offers_online ? 'Yes' : 'No'}</Row>
          <Row label="In person">{p.offers_in_person ? `${p.address_full}, ${p.city} ${p.pincode}` : 'No'}</Row>
        </dl>
      </Card>
      <Card>
        <h2 className="mb-2 font-semibold">3. Credentials</h2>
        <dl className="divide-y divide-line">
          <Row label="Certificates">
            {d.documents.length ? (
              <ul className="flex flex-col gap-1">
                {d.documents.map((doc) => (
                  <li key={doc.id} className="flex items-center gap-2">
                    {doc.file_name}
                    <Button variant="ghost" className="!h-8 !px-2" aria-label={`View ${doc.file_name}`} onClick={() => open(doc.storage_path)}>View</Button>
                  </li>
                ))}
              </ul>
            ) : null}
          </Row>
          <Row label="Training">{p.credentials_text}</Row>
          <Row label="Links">
            {p.links.length ? p.links.map((l) => <a key={l} href={l} target="_blank" rel="noopener noreferrer" className="block text-primary underline">{l}</a>) : null}
          </Row>
        </dl>
      </Card>
      <Card>
        <h2 className="mb-2 font-semibold">4. Video intro</h2>
        {p.video_path ? (
          videoUrl ? (
            <video src={videoUrl} controls className="w-full max-w-lg rounded-md" />
          ) : (
            <Button variant="secondary" onClick={playVideo}>Play video ({Math.round(Number(p.video_duration_seconds ?? 0))} s)</Button>
          )
        ) : (
          <p className="text-sm text-muted">No video uploaded.</p>
        )}
      </Card>
      <Card>
        <h2 className="mb-2 font-semibold">5. Identity and bank</h2>
        <dl className="divide-y divide-line">
          <Row label="Email">{p.email}</Row>
          <Row label="Address">{addr ? [addr.street1, addr.street2, addr.city, addr.state, addr.pincode].filter(Boolean).join(', ') : null}</Row>
          <Row label="GSTIN">{p.gstin}</Row>
        </dl>
        <h3 className="mt-4 text-sm font-semibold">Verification checks</h3>
        <table className="mt-2 w-full text-left text-sm">
          <thead className="text-xs text-muted"><tr><th className="py-1">Check</th><th>Status</th><th>Verified name</th><th>Name match</th><th>Reference</th></tr></thead>
          <tbody>
            {(['pan', 'aadhaar', 'bank'] as const).map((k) => {
              const c = d.checks.find((x) => x.kind === k);
              return (
                <tr key={k} className="border-t border-line">
                  <td className="py-2 uppercase">{k}</td>
                  <td>{c ? <Badge tone={c.status === 'passed' ? 'success' : c.status === 'flagged' ? 'warning' : c.status === 'failed' ? 'danger' : 'neutral'}>{c.status}</Badge> : <Badge>not started</Badge>}</td>
                  <td>{c?.verified_name ?? '—'}</td>
                  <td>{c?.name_match_score != null ? Number(c.name_match_score).toFixed(2) : '—'}</td>
                  <td className="font-mono text-xs">{c?.masked_ref ?? '—'}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </Card>
      <Card>
        <h2 className="mb-2 font-semibold">6. Agreement</h2>
        <dl className="divide-y divide-line">
          <Row label="Agreement version">{p.agreement_version}</Row>
          <Row label="Declaration">{p.declaration_accepted ? 'Accepted' : 'Not accepted'}</Row>
        </dl>
      </Card>
    </div>
  );
}

const ACTION_LABEL: Record<string, string> = {
  submit: 'Submitted',
  claim: 'Claimed',
  request_changes: 'Asked for changes',
  reject: 'Rejected the application',
  schedule_trial: 'Trial time chosen',
  trial_missed: 'Trial marked missed',
  trial_reschedule: 'Asked to reschedule the trial',
  approve: 'Approved the application',
  suspend: 'Suspended the account',
  reinstate: 'Reinstated the account',
  reapply: 'Started a new application',
};

export function Timeline({ d }: { d: Detail }) {
  return (
    <Card>
      <h2 className="mb-3 font-semibold">History</h2>
      {d.history.length === 0 ? (
        <p className="text-sm text-muted">No changes yet.</p>
      ) : (
        <ol className="flex flex-col gap-3">
          {d.history.map((h) => (
            <li key={h.id} className="text-sm">
              <p className="font-medium">{ACTION_LABEL[h.action] ?? h.action}</p>
              <p className="text-xs text-muted">{formatIST(new Date(h.created_at))} · {h.actor_kind}</p>
              {h.reason && <p className="mt-1 text-muted">“{h.reason}”</p>}
            </li>
          ))}
        </ol>
      )}
    </Card>
  );
}
