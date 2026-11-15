import { describe, expect, it } from 'vitest';
import { staffDocumentUrl } from '../staff-document-url/handler.ts';
import { createApplicant, createStaff, invoke, serviceClient } from './helpers.ts';

describe('staff-document-url', () => {
  it('returns url and writes audit row', async () => {
    const a = await createApplicant();
    const path = `${a.practitionerId}/certificate/${crypto.randomUUID()}.pdf`;
    const up = await serviceClient().storage.from('practitioner-private').upload(path, new Blob(['%PDF-1.4'], { type: 'application/pdf' }));
    expect(up.error).toBeNull();
    const rev = await createStaff('reviewer');
    const r = await invoke(staffDocumentUrl, { path }, { token: rev.token });
    expect(r.status).toBe(200);
    expect(r.body.data.url).toContain('token=');
    const { data } = await serviceClient().from('audit_log').select('actor_id,metadata').eq('action', 'document.view').eq('target_id', a.practitionerId);
    expect(data).toEqual([{ actor_id: rev.userId, metadata: { path } }]);
  });

  it('non-staff → 403', async () => {
    const a = await createApplicant();
    const r = await invoke(staffDocumentUrl, { path: `${a.practitionerId}/certificate/x.pdf` }, { token: a.token });
    expect(r.status).toBe(403);
  });

  it('path for unknown practitioner → 404', async () => {
    const rev = await createStaff('reviewer');
    const r = await invoke(staffDocumentUrl, { path: `${crypto.randomUUID()}/certificate/x.pdf` }, { token: rev.token });
    expect(r.status).toBe(404);
  });
});
