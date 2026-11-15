import type { AdminTransitionInput, PractitionerStatus, StaffRole } from '@3nayan/shared';
import { callFunction, check, checkMaybe } from './functions.ts';
import type { Sb } from './types.ts';

export type ApplicationFilters = {
  status?: PractitionerStatus;
  categoryId?: string;
  city?: string;
  flaggedOnly?: boolean;
  olderThanDays?: number;
};

export type ApplicationListItem = {
  id: string;
  display_name: string | null;
  city: string | null;
  status: PractitionerStatus;
  submitted_at: string | null;
  assigned_reviewer_id: string | null;
  categoryIds: string[];
  flagged: boolean;
};

export async function listApplications(sb: Sb, f: ApplicationFilters = {}): Promise<ApplicationListItem[]> {
  let q = sb
    .from('practitioners')
    .select(
      `id,display_name,city,status,submitted_at,assigned_reviewer_id,
       practitioner_categories${f.categoryId ? '!inner' : ''}(category_id),
       verification_checks(status)`,
    )
    .neq('status', 'draft')
    .order('submitted_at', { ascending: true, nullsFirst: false });
  if (f.status) q = q.eq('status', f.status);
  if (f.categoryId) q = q.eq('practitioner_categories.category_id', f.categoryId);
  if (f.city) q = q.ilike('city', `%${f.city}%`);
  if (f.olderThanDays) q = q.lt('submitted_at', new Date(Date.now() - f.olderThanDays * 86_400_000).toISOString());
  const rows = check(await q) as unknown as Array<
    Omit<ApplicationListItem, 'categoryIds' | 'flagged'> & {
      practitioner_categories: Array<{ category_id: string }>;
      verification_checks: Array<{ status: string }>;
    }
  >;
  return rows
    .map(({ practitioner_categories, verification_checks, ...r }) => ({
      ...r,
      categoryIds: practitioner_categories.map((c) => c.category_id),
      flagged: verification_checks.some((c) => c.status === 'flagged'),
    }))
    .filter((r) => !f.flaggedOnly || r.flagged);
}

export async function getApplicationDetail(sb: Sb, id: string) {
  const [p, cats, docs, checks, history, notes, trials] = await Promise.all([
    sb.from('practitioners').select('*').eq('id', id).single(),
    sb.from('practitioner_categories').select('category_id, categories(name,parent_id)').eq('practitioner_id', id),
    sb.from('practitioner_documents').select('*').eq('practitioner_id', id).order('created_at'),
    sb
      .from('verification_checks')
      .select('id,kind,status,verified_name,name_match_score,masked_ref,attempts,checked_at,last_error,year_of_birth')
      .eq('practitioner_id', id),
    sb.from('practitioner_status_history').select('*').eq('practitioner_id', id).order('created_at', { ascending: false }),
    sb.from('review_notes').select('*').eq('practitioner_id', id).order('created_at', { ascending: false }),
    sb.from('trial_calls').select('*').eq('practitioner_id', id).order('created_at', { ascending: false }),
  ]);
  const practitioner = check(p);
  const profile = checkMaybe(await sb.from('profiles').select('phone,full_name').eq('id', practitioner.user_id).maybeSingle());
  return {
    practitioner,
    profile,
    categories: check(cats),
    documents: check(docs),
    checks: check(checks),
    history: check(history),
    notes: check(notes),
    trials: check(trials),
  };
}

export const adminTransition = (sb: Sb, input: AdminTransitionInput) =>
  callFunction<{ status: PractitionerStatus }>(sb, 'admin-transition', input);
export const reassignApplication = (sb: Sb, practitionerId: string, reviewerId: string) =>
  callFunction<{ assignedReviewerId: string }>(sb, 'admin-reassign', { practitionerId, reviewerId });
export const proposeTrial = (sb: Sb, practitionerId: string, slots: string[]) =>
  callFunction<{ trialId: string }>(sb, 'trial-propose', { practitionerId, slots });
export const recordTrialOutcome = (sb: Sb, trialId: string, outcome: 'completed' | 'missed', notes: string) =>
  callFunction<{ status: string }>(sb, 'trial-outcome', { trialId, outcome, notes });
export const getDocumentUrl = (sb: Sb, path: string) =>
  callFunction<{ url: string; expiresIn: number }>(sb, 'staff-document-url', { path });
export const retryLinkedAccount = (sb: Sb, practitionerId: string) =>
  callFunction<{ ok: boolean }>(sb, 'razorpay-linked-account-retry', { practitionerId });
export const processDeletion = (sb: Sb, requestId: string) =>
  callFunction<{ status: string; noop: boolean }>(sb, 'account-deletion-process', { requestId });
export const inviteStaff = (sb: Sb, email: string, role: StaffRole) =>
  callFunction<{ userId: string }>(sb, 'staff-invite', { email, role });

export async function addReviewNote(sb: Sb, practitionerId: string, body: string) {
  const { data: u } = await sb.auth.getUser();
  check(await sb.from('review_notes').insert({ practitioner_id: practitionerId, staff_id: u.user!.id, body: body.trim() }));
}

export async function listMyTrials(sb: Sb) {
  const { data: u } = await sb.auth.getUser();
  return check(
    await sb
      .from('trial_calls')
      .select('id,status,scheduled_at,proposed_slots,practitioner_id, practitioners(display_name)')
      .eq('reviewer_id', u.user!.id)
      .in('status', ['proposed', 'scheduled', 'completed', 'missed'])
      .order('scheduled_at', { ascending: true, nullsFirst: false }),
  );
}

export async function searchPractitioners(sb: Sb, q: string) {
  const term = q.trim();
  let query = sb
    .from('practitioners')
    .select('id,user_id,display_name,status,city,razorpay_account_status,approved_at')
    .neq('status', 'draft')
    .order('updated_at', { ascending: false })
    .limit(50);
  if (term) {
    const digits = term.replace(/\D/g, '');
    // Only phone-like input searches phone numbers ("Applicant 4f8a91" is a name search).
    if (/^[+\d\s()-]+$/.test(term) && digits.length >= 4) {
      const profiles = check(await sb.from('profiles').select('id').ilike('phone', `%${digits.slice(-10)}%`).limit(50));
      query = query.in('user_id', profiles.map((p) => p.id));
    } else {
      query = query.ilike('display_name', `%${term}%`);
    }
  }
  return check(await query);
}

export async function listAttention(sb: Sb, status: 'open' | 'resolved' = 'open') {
  return check(await sb.from('attention_items').select('*').eq('status', status).order('created_at', { ascending: true }));
}

export async function resolveAttention(sb: Sb, id: string) {
  const { data: u } = await sb.auth.getUser();
  check(
    await sb
      .from('attention_items')
      .update({ status: 'resolved', resolved_by: u.user!.id, resolved_at: new Date().toISOString() })
      .eq('id', id),
  );
}

export async function listCategoriesAdmin(sb: Sb) {
  return check(await sb.from('categories').select('*').order('parent_id', { nullsFirst: true }).order('sort_order'));
}

export async function upsertCategory(sb: Sb, c: { id?: string; parentId: string | null; name: string; slug: string; sortOrder?: number }) {
  const row = { parent_id: c.parentId, name: c.name.trim(), slug: c.slug, sort_order: c.sortOrder ?? 0 };
  if (c.id) check(await sb.from('categories').update(row).eq('id', c.id));
  else check(await sb.from('categories').insert(row));
}

export async function setCategoryActive(sb: Sb, id: string, active: boolean) {
  check(await sb.from('categories').update({ active }).eq('id', id));
}

export async function reorderCategories(sb: Sb, orderedIds: string[]) {
  for (const [i, id] of orderedIds.entries()) check(await sb.from('categories').update({ sort_order: i + 1 }).eq('id', id));
}

export async function listStaff(sb: Sb) {
  return check(await sb.from('staff').select('*').order('created_at'));
}
export async function setStaffRole(sb: Sb, userId: string, role: StaffRole) {
  check(await sb.from('staff').update({ role }).eq('user_id', userId));
}
export async function setStaffActive(sb: Sb, userId: string, active: boolean) {
  check(await sb.from('staff').update({ active }).eq('user_id', userId));
}

export async function getSettings(sb: Sb) {
  const rows = check(await sb.from('platform_settings').select('key,value'));
  return Object.fromEntries(rows.map((r) => [r.key, r.value])) as {
    commission_rate?: { bps: number };
    legal_versions?: Record<string, string>;
  };
}
export async function updateSettings(sb: Sb, key: 'commission_rate' | 'legal_versions', value: unknown) {
  check(await sb.from('platform_settings').upsert({ key, value: value as never }));
}

export async function listAudit(sb: Sb, f: { action?: string; targetId?: string; limit?: number } = {}) {
  let q = sb.from('audit_log').select('*').order('created_at', { ascending: false }).limit(f.limit ?? 100);
  if (f.action) q = q.eq('action', f.action);
  if (f.targetId) q = q.eq('target_id', f.targetId);
  return check(await q);
}
