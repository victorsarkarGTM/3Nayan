import {
  AppError,
  STEP_SCHEMAS,
  applicationCompleteness,
  kycStatuses,
  snapshotFromRow,
  stepToColumns,
  type ApplicationSnapshot,
  type Completeness,
  type PractitionerRow,
  type StepNumber,
} from '@3nayan/shared';
import { callFunction, check, checkMaybe } from './functions.ts';
import type { PractitionerDbRow, Sb } from './types.ts';

export type CategoryNode = { id: string; name: string; slug: string; children: Array<{ id: string; name: string; slug: string }> };

export async function listCategories(sb: Sb): Promise<CategoryNode[]> {
  const rows = check(await sb.from('categories').select('id,parent_id,name,slug,sort_order').eq('active', true).order('sort_order'));
  return rows
    .filter((r) => !r.parent_id)
    .map((top) => ({
      id: top.id,
      name: top.name,
      slug: top.slug,
      children: rows.filter((c) => c.parent_id === top.id).map((c) => ({ id: c.id, name: c.name, slug: c.slug })),
    }));
}

async function myPractitioner(sb: Sb): Promise<PractitionerDbRow | null> {
  const { data: u } = await sb.auth.getUser();
  if (!u.user) throw new AppError('unauthenticated');
  return checkMaybe(await sb.from('practitioners').select('*').eq('user_id', u.user.id).maybeSingle());
}

export async function getMyApplication(sb: Sb): Promise<{
  practitioner: PractitionerDbRow | null;
  snapshot: ApplicationSnapshot | null;
  completeness: Completeness | null;
}> {
  const p = await myPractitioner(sb);
  if (!p) return { practitioner: null, snapshot: null, completeness: null };
  const [cats, docs, checks] = await Promise.all([
    sb.from('practitioner_categories').select('category_id').eq('practitioner_id', p.id),
    sb.from('practitioner_documents').select('id').eq('practitioner_id', p.id),
    sb.from('my_verification_checks').select('kind,status'),
  ]);
  const snapshot = snapshotFromRow(p as unknown as PractitionerRow, {
    subcategoryIds: check(cats).map((c) => c.category_id),
    certificateIds: check(docs).map((d) => d.id),
    kyc: kycStatuses((check(checks) ?? []).map((c) => ({ kind: c.kind ?? '', status: c.status ?? '' }))),
  });
  return { practitioner: p, snapshot, completeness: applicationCompleteness(snapshot) };
}

export async function startApplication(sb: Sb): Promise<PractitionerDbRow> {
  const existing = await myPractitioner(sb);
  if (existing) return existing;
  const { data: u } = await sb.auth.getUser();
  return check(await sb.from('practitioners').insert({ user_id: u.user!.id }).select('*').single());
}

/**
 * Save one step. Full saves validate with the step schema first (no network on failure);
 * `draft: true` (autosave) writes whatever was provided — completeness is checked at submit.
 */
export async function saveStep(sb: Sb, step: StepNumber, data: unknown, opts: { draft?: boolean } = {}): Promise<void> {
  let value = data as Record<string, unknown>;
  if (!opts.draft) {
    const parsed = STEP_SCHEMAS[step].safeParse(data);
    if (!parsed.success) {
      throw new AppError('validation_failed', parsed.error.issues.map((i) => ({ path: i.path, message: i.message })));
    }
    value = parsed.data as Record<string, unknown>;
  }
  const p = await myPractitioner(sb);
  if (!p) throw new AppError('not_found');
  const columns = stepToColumns(step, value);
  if (Object.keys(columns).length) check(await sb.from('practitioners').update(columns).eq('id', p.id));

  if (step === 1 && Array.isArray(value.subcategoryIds)) {
    const ids = value.subcategoryIds as string[];
    check(await sb.from('practitioner_categories').delete().eq('practitioner_id', p.id));
    if (ids.length) {
      check(await sb.from('practitioner_categories').insert(ids.map((category_id) => ({ practitioner_id: p.id, category_id }))));
    }
  }
  if (step === 3 && Array.isArray(value.certificateIds)) {
    const keep = value.certificateIds as string[];
    const existing = check(await sb.from('practitioner_documents').select('id').eq('practitioner_id', p.id));
    const remove = existing.map((d) => d.id).filter((id) => !keep.includes(id));
    if (remove.length) check(await sb.from('practitioner_documents').delete().in('id', remove));
  }
  if (step === 6 && value.declarationAccepted === true && typeof value.agreementVersion === 'string') {
    const { data: u } = await sb.auth.getUser();
    check(
      await sb.from('consents').upsert(
        { user_id: u.user!.id, document: 'practitioner_agreement', version: value.agreementVersion },
        { onConflict: 'user_id,document,version', ignoreDuplicates: true },
      ),
    );
  }
}

export async function getMyVerificationChecks(sb: Sb) {
  return check(await sb.from('my_verification_checks').select('*'));
}

export async function getMyStatusHistory(sb: Sb) {
  const p = await myPractitioner(sb);
  if (!p) return [];
  return check(
    await sb
      .from('practitioner_status_history')
      .select('from_status,to_status,action,reason,created_at')
      .eq('practitioner_id', p.id)
      .order('created_at', { ascending: false }),
  );
}

type KycResult = { status: string; nameMatchScore: number | null };
export const verifyPan = (sb: Sb, pan: string) => callFunction<KycResult>(sb, 'kyc-pan-verify', { pan });
export const verifyBank = (sb: Sb, accountNumber: string, ifsc: string) =>
  callFunction<KycResult>(sb, 'kyc-bank-verify', { accountNumber, ifsc });
export const startDigilocker = (sb: Sb, platform: 'web' | 'mobile') =>
  callFunction<{ url: string }>(sb, 'kyc-digilocker-start', { platform });
export const submitApplication = (sb: Sb) => callFunction<{ status: string }>(sb, 'practitioner-submit', {});
export const reapply = (sb: Sb) => callFunction<{ status: string }>(sb, 'practitioner-reapply', {});
