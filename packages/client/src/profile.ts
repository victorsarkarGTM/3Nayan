import { AppError } from '@3nayan/shared';
import { callFunction, check, checkMaybe } from './functions.ts';
import type { Sb } from './types.ts';

export type LegalDocument = 'terms' | 'privacy' | 'practitioner_agreement';

async function uid(sb: Sb): Promise<string> {
  const { data } = await sb.auth.getUser();
  if (!data.user) throw new AppError('unauthenticated');
  return data.user.id;
}

export async function getMyProfile(sb: Sb) {
  const id = await uid(sb);
  return checkMaybe(await sb.from('profiles').select('id,phone,full_name,photo_path,deleted_at').eq('id', id).maybeSingle());
}

export async function updateMyProfile(sb: Sb, p: { fullName: string; photoPath?: string | null }) {
  const fullName = p.fullName.trim();
  if (fullName.length < 1 || fullName.length > 120) throw new AppError('validation_failed', [{ path: ['fullName'], message: 'Enter your full name' }]);
  const id = await uid(sb);
  check(
    await sb
      .from('profiles')
      .update({ full_name: fullName, ...(p.photoPath !== undefined ? { photo_path: p.photoPath } : {}) })
      .eq('id', id),
  );
}

export async function getLegalVersions(sb: Sb): Promise<Record<LegalDocument, string>> {
  const row = checkMaybe(await sb.from('platform_settings').select('value').eq('key', 'legal_versions').maybeSingle());
  return (row?.value as Record<LegalDocument, string>) ?? { terms: '', privacy: '', practitioner_agreement: '' };
}

export async function getMyConsents(sb: Sb) {
  const id = await uid(sb);
  return check(await sb.from('consents').select('document,version,accepted_at').eq('user_id', id));
}

export async function acceptConsents(sb: Sb, docs: Array<{ document: LegalDocument; version: string }>) {
  const id = await uid(sb);
  check(
    await sb
      .from('consents')
      .upsert(docs.map((d) => ({ user_id: id, ...d })), { onConflict: 'user_id,document,version', ignoreDuplicates: true }),
  );
}

/** True when the user has accepted the current Terms and Privacy versions. */
export async function hasCurrentConsents(sb: Sb): Promise<boolean> {
  const [versions, consents] = await Promise.all([getLegalVersions(sb), getMyConsents(sb)]);
  return (['terms', 'privacy'] as const).every((d) => consents.some((c) => c.document === d && c.version === versions[d]));
}

export function requestAccountDeletion(sb: Sb) {
  return callFunction<{ requestId: string }>(sb, 'account-deletion-request', {});
}
