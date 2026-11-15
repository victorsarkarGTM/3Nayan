'use client';

import { useCallback, useEffect, useState, type FormEvent } from 'react';
import { inviteStaff, listStaff, setStaffActive, setStaffRole } from '@3nayan/client';
import { STAFF_ROLES, type StaffRole } from '@3nayan/shared';
import { Alert, Badge, Button, Card, Field, TextInput } from '@/components/ui';
import { messageFor } from '@/lib/errors';
import { supabase } from '@/lib/supabase';
import { useStaff } from '@/lib/useStaff';

type Member = Awaited<ReturnType<typeof listStaff>>[number];
const roleLabel = (r: string) => r.replace('_', ' ');
const select = 'rounded-md border border-line bg-surface px-3 py-2 text-sm capitalize';

export default function StaffPage() {
  const me = useStaff();
  const [members, setMembers] = useState<Member[]>([]);
  const [email, setEmail] = useState('');
  const [role, setRole] = useState<StaffRole>('reviewer');
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(() => listStaff(supabase()).then(setMembers), []);
  useEffect(() => {
    Promise.resolve().then(load);
  }, [load]);

  async function run(fn: () => Promise<unknown>, ok?: string) {
    setBusy(true);
    setError(null);
    setNotice(null);
    try {
      await fn();
      if (ok) setNotice(ok);
    } catch (e) {
      setError(messageFor(e));
    } finally {
      setBusy(false);
      await load();
    }
  }

  function invite(e: FormEvent) {
    e.preventDefault();
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email.trim())) return setError('Enter a valid email address');
    return run(() => inviteStaff(supabase(), email.trim(), role), `Invitation sent to ${email.trim()}`).then(() => setEmail(''));
  }

  return (
    <div className="flex flex-col gap-6">
      <h1 className="text-2xl font-semibold">Staff</h1>
      {error && <Alert tone="danger">{error}</Alert>}
      {notice && <Alert tone="success">{notice}</Alert>}
      <Card>
        <form onSubmit={invite} className="flex flex-wrap items-end gap-4">
          <div className="w-72">
            <Field label="Email address">{(id) => <TextInput id={id} type="email" value={email} onChange={(e) => setEmail(e.target.value)} />}</Field>
          </div>
          <Field label="Role">
            {(id) => (
              <select id={id} className={select} value={role} onChange={(e) => setRole(e.target.value as StaffRole)}>
                {STAFF_ROLES.map((r) => <option key={r} value={r}>{roleLabel(r)}</option>)}
              </select>
            )}
          </Field>
          <Button type="submit" busy={busy}>Send invitation</Button>
        </form>
        <p className="mt-3 text-xs text-muted">Invitees set a password from the email, then set up two-factor sign-in on first login.</p>
      </Card>
      <div className="overflow-x-auto rounded-lg border border-line bg-surface">
        <table className="w-full text-left text-sm">
          <thead className="border-b border-line text-xs uppercase tracking-wide text-muted"><tr><th className="px-4 py-3">Email</th><th className="px-4 py-3">Role</th><th className="px-4 py-3">Status</th><th className="px-4 py-3" /></tr></thead>
          <tbody className="divide-y divide-line">
            {members.map((m) => {
              const self = m.user_id === me.userId;
              return (
                <tr key={m.user_id}>
                  <td className="px-4 py-3">{m.email}{self && <span className="ml-2 text-xs text-muted">(you)</span>}</td>
                  <td className="px-4 py-3">
                    <select aria-label={`Role for ${m.email}`} className={select} value={m.role} disabled={self}
                      onChange={(e) => run(() => setStaffRole(supabase(), m.user_id, e.target.value as StaffRole))}>
                      {STAFF_ROLES.map((r) => <option key={r} value={r}>{roleLabel(r)}</option>)}
                    </select>
                  </td>
                  <td className="px-4 py-3">{m.active ? <Badge tone="success">Active</Badge> : <Badge>Deactivated</Badge>}</td>
                  <td className="px-4 py-3 text-right">
                    {!self && (
                      <Button variant="secondary" className="!h-9" onClick={() => run(() => setStaffActive(supabase(), m.user_id, !m.active))}>
                        {m.active ? 'Deactivate' : 'Reactivate'}
                      </Button>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
