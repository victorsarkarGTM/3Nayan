import { describe, expect, it } from 'vitest';
import { adminReassign } from '../admin-reassign/handler.ts';
import { adminTransition } from '../admin-transition/handler.ts';
import { createApplicant, createStaff, invoke, serviceClient, setPractitionerStatus } from './helpers.ts';

describe('admin-reassign', () => {
  it('super_admin reassigns an application to another reviewer (audited)', async () => {
    const a = await createApplicant();
    await setPractitionerStatus(a.practitionerId, 'submitted');
    const rev1 = await createStaff('reviewer');
    const rev2 = await createStaff('reviewer');
    const boss = await createStaff('super_admin');
    await invoke(adminTransition, { practitionerId: a.practitionerId, action: 'claim', expectedStatus: 'submitted' }, { token: rev1.token });
    const r = await invoke(adminReassign, { practitionerId: a.practitionerId, reviewerId: rev2.userId }, { token: boss.token });
    expect(r.status).toBe(200);
    const { data } = await serviceClient().from('practitioners').select('assigned_reviewer_id').eq('id', a.practitionerId).single();
    expect(data!.assigned_reviewer_id).toBe(rev2.userId);
    const { data: audit } = await serviceClient().from('audit_log').select('action').eq('target_id', a.practitionerId).eq('action', 'practitioner.reassign');
    expect(audit).toHaveLength(1);
  });

  it('reviewer cannot reassign → 403; target must be an active reviewer → 400', async () => {
    const a = await createApplicant();
    const rev = await createStaff('reviewer');
    const sup = await createStaff('support');
    const boss = await createStaff('super_admin');
    expect((await invoke(adminReassign, { practitionerId: a.practitionerId, reviewerId: rev.userId }, { token: rev.token })).status).toBe(403);
    const r = await invoke(adminReassign, { practitionerId: a.practitionerId, reviewerId: sup.userId }, { token: boss.token });
    expect(r.status).toBe(400);
    expect(r.body.error?.code).toBe('validation_failed');
  });
});
