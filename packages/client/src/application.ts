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
  if (opts.draft) value = sanitizeDraft(step, value);
  const columns = stepToColumns(step, value);
  if (Object.keys(columns).length) check(await sb.from('practitioners').update(columns).eq('id', p.id));

  if (step === 1 && Array.isArray(value.subcategoryIds)) {
    const ids = value.subcategoryIds as string[];
    check(await sb.from('practitioner_categories').delete().eq('practitioner_id', p.id));
    if (ids.length) {
      check(await sb.from('practitioner_categories').insert(ids.map((category_id) => ({ practitioner_id: p.id, category_id }))));
    }
  }
  // Certificates are added by upload and removed only by an explicit removeCertificate(), never by
  // diffing a screen's (possibly stale or still-loading) list.
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

/**
 * Drafts are unvalidated, but the database still enforces limits; drop values that would be refused
 * so the rest of the step saves (validation reports them at "Save and continue").
 */
function sanitizeDraft(step: StepNumber, v: Record<string, unknown>): Record<string, unknown> {
  const out = { ...v };
  if (step === 1) {
    if (typeof out.displayName === 'string') out.displayName = out.displayName.slice(0, 60);
    const y = out.yearsExperience;
    if (y !== undefined && !(Number.isInteger(y) && (y as number) >= 0 && (y as number) <= 60)) delete out.yearsExperience;
    if (typeof out.bio === 'string') out.bio = out.bio.slice(0, 1500);
  }
  if (step === 3) {
    if (Array.isArray(out.links)) out.links = (out.links as unknown[]).filter((l) => typeof l === 'string' && /^https?:\/\/\S+$/i.test(l)).slice(0, 5);
    if (typeof out.credentialsText === 'string') out.credentialsText = out.credentialsText.slice(0, 2000);
  }
  return out;
}

/** Remove one uploaded certificate (explicit user action). */
export async function removeCertificate(sb: Sb, documentId: string): Promise<void> {
  check(await sb.from('practitioner_documents').delete().eq('id', documentId));
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

export async function listMyCertificates(sb: Sb) {
  const p = await myPractitioner(sb);
  if (!p) return [];
  return check(
    await sb.from('practitioner_documents').select('id,file_name,size_bytes,created_at').eq('practitioner_id', p.id).order('created_at'),
  );
}
