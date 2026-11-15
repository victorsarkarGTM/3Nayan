import type { ResidentialAddress } from './core/index.ts';
import type { Deps } from './deps.ts';
import { DuplicateReferenceError } from './providers/razorpay/types.ts';

const MAX_ATTEMPTS = 5;
const errText = (e: unknown) => (e instanceof Error ? e.message : String(e)).slice(0, 500);

/** Razorpay reference ids are limited to 20 characters. */
export const referenceIdFor = (practitionerId: string) => practitionerId.replace(/-/g, '').slice(0, 20);

async function provisionOnce(deps: Deps, practitionerId: string): Promise<void> {
  const db = deps.db;
  const { data: p, error } = await db
    .from('practitioners')
    .select('id,user_id,email,residential_address,razorpay_account_id,razorpay_stakeholder_id,razorpay_product_id,razorpay_settlement_configured')
    .eq('id', practitionerId)
    .single();
  if (error || !p) throw new Error(`practitioner ${practitionerId} not found`);
  const { data: profile } = await db.from('profiles').select('phone').eq('id', p.user_id).single();
  const { data: checks } = await db
    .from('verification_checks')
    .select('id,kind,verified_name')
    .eq('practitioner_id', practitionerId)
    .in('kind', ['pan', 'bank']);
  const pan = checks?.find((c: { kind: string }) => c.kind === 'pan');
  const bank = checks?.find((c: { kind: string }) => c.kind === 'bank');
  if (!pan || !bank) throw new Error('PAN and bank verification are required');
  const [{ data: panNumber }, { data: accountNumber }, { data: bankRow }] = await Promise.all([
    db.rpc('reveal_pan', { p_check_id: pan.id }),
    db.rpc('reveal_bank_account', { p_check_id: bank.id }),
    db.from('verification_checks').select('ifsc').eq('id', bank.id).single(),
  ]);
  if (!panNumber || !accountNumber || !bankRow?.ifsc) throw new Error('encrypted PAN or bank details missing');
  const legalName = pan.verified_name ?? bank.verified_name ?? '';
  const referenceId = referenceIdFor(practitionerId);
  const save = async (values: Record<string, unknown>) => {
    const { error: saveError } = await db.from('practitioners').update(values).eq('id', practitionerId);
    if (saveError) throw new Error(`could not save Razorpay progress: ${saveError.message}`);
  };

  let accountId: string | null = p.razorpay_account_id;
  if (!accountId) {
    try {
      accountId = (
        await deps.razorpay.createLinkedAccount({
          email: p.email,
          phone: profile?.phone ?? '',
          legalName,
          pan: panNumber,
          address: p.residential_address as ResidentialAddress,
          referenceId,
        })
      ).accountId;
    } catch (e) {
      if (!(e instanceof DuplicateReferenceError)) throw e;
      accountId = await deps.razorpay.findAccountByReference(referenceId);
      if (!accountId) throw e;
    }
    await save({ razorpay_account_id: accountId });
  }
  // Each completed step is persisted, so a retry resumes where the last attempt stopped.
  if (!p.razorpay_stakeholder_id) {
    const { stakeholderId } = await deps.razorpay.addStakeholder(accountId, { name: legalName, email: p.email, pan: panNumber });
    await save({ razorpay_stakeholder_id: stakeholderId });
  }
  let productId: string | null = p.razorpay_product_id;
  if (!productId) {
    productId = (await deps.razorpay.requestRouteProduct(accountId)).productId;
    await save({ razorpay_product_id: productId });
  }
  if (!p.razorpay_settlement_configured) {
    await deps.razorpay.configureSettlement(accountId, productId, {
      accountNumber,
      ifsc: bankRow.ifsc,
      beneficiaryName: bank.verified_name ?? legalName,
    });
    await save({ razorpay_settlement_configured: true });
  }
  const status = await deps.razorpay.getAccountStatus(accountId);
  await save({ razorpay_account_status: status });
}

/**
 * Create and configure the practitioner's Razorpay Route account. Retries with exponential backoff
 * (1s, 2s, 4s, 8s between 5 attempts); persistent failure becomes a "Needs attention" item.
 * Never throws: an approval must not fail because of payouts setup.
 */
export async function provisionLinkedAccount(deps: Deps, practitionerId: string): Promise<boolean> {
  let lastError: unknown;
  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
    try {
      await provisionOnce(deps, practitionerId);
      await deps.db
        .from('attention_items')
        .update({ status: 'resolved', resolved_at: deps.now().toISOString() })
        .eq('kind', 'linked_account_failed')
        .eq('target_id', practitionerId)
        .eq('status', 'open');
      return true;
    } catch (e) {
      lastError = e;
      if (attempt < MAX_ATTEMPTS) await deps.sleep(1000 * 2 ** (attempt - 1));
    }
  }
  console.error('linked account provisioning failed', errText(lastError));
  const { data: open } = await deps.db
    .from('attention_items')
    .select('id')
    .eq('kind', 'linked_account_failed')
    .eq('target_id', practitionerId)
    .eq('status', 'open')
    .maybeSingle();
  if (open) {
    await deps.db.from('attention_items').update({ error: errText(lastError) }).eq('id', open.id);
  } else {
    await deps.db
      .from('attention_items')
      .insert({ kind: 'linked_account_failed', target_id: practitionerId, error: errText(lastError) });
  }
  return false;
}

/** Refresh Razorpay status for every account not yet activated (scheduled every 6 hours). */
export async function syncLinkedAccounts(deps: Deps): Promise<number> {
  const { data } = await deps.db
    .from('practitioners')
    .select('id,razorpay_account_id,razorpay_account_status')
    .not('razorpay_account_id', 'is', null)
    .or('razorpay_account_status.is.null,razorpay_account_status.neq.activated');
  let updated = 0;
  for (const p of data ?? []) {
    try {
      const status = await deps.razorpay.getAccountStatus(p.razorpay_account_id);
      if (status !== p.razorpay_account_status) {
        await deps.db.from('practitioners').update({ razorpay_account_status: status }).eq('id', p.id);
        updated++;
      }
    } catch (e) {
      console.error('razorpay status sync failed', p.id, errText(e));
    }
  }
  return updated;
}
