/**
 * Local/CI functions server: serves the same handlers as the deployed Edge Functions over HTTP,
 * under Node, with fake providers. Used by end-to-end tests and local app development, because the
 * Supabase edge-runtime container cannot always reach npm (e.g. behind TLS-intercepting proxies).
 *
 *   pnpm functions:dev        → http://127.0.0.1:54331/functions/v1/<name>
 */
import { createServer } from 'node:http';
import { execSync } from 'node:child_process';
import { makeDeps } from './_shared/deps.ts';
import { withHandler, type Handler } from './_shared/http.ts';
import { accountDeletionProcess } from './account-deletion-process/handler.ts';
import { accountDeletionRequest } from './account-deletion-request/handler.ts';
import { adminReassign } from './admin-reassign/handler.ts';
import { adminTransition } from './admin-transition/handler.ts';
import { handleSendSms } from './auth-send-sms/handler.ts';
import { hmsWebhook } from './hms-webhook/handler.ts';
import { jobs } from './jobs/handler.ts';
import { kycBankVerify } from './kyc-bank-verify/handler.ts';
import { handleDigilockerCallback } from './kyc-digilocker-callback/handler.ts';
import { kycDigilockerStart } from './kyc-digilocker-start/handler.ts';
import { kycPanVerify } from './kyc-pan-verify/handler.ts';
import { notifyHandler } from './notify/handler.ts';
import { practitionerReapply } from './practitioner-reapply/handler.ts';
import { practitionerSubmit } from './practitioner-submit/handler.ts';
import { razorpayLinkedAccountRetry } from './razorpay-linked-account-retry/handler.ts';
import { staffDocumentUrl } from './staff-document-url/handler.ts';
import { staffInvite } from './staff-invite/handler.ts';
import { trialJoinToken } from './trial-join-token/handler.ts';
import { trialOutcome } from './trial-outcome/handler.ts';
import { trialPropose } from './trial-propose/handler.ts';
import { trialRescheduleRequest } from './trial-reschedule-request/handler.ts';
import { trialSelect } from './trial-select/handler.ts';

const PORT = Number(process.env.FUNCTIONS_DEV_PORT ?? 54331);

if (!process.env.SUPABASE_URL) {
  const out = execSync('pnpm --silent --filter @3nayan/db exec supabase --workdir ../.. status -o env', { encoding: 'utf8' });
  for (const line of out.split('\n')) {
    const m = line.match(/^([A-Z0-9_]+)="?(.*?)"?$/);
    if (m?.[1] === 'API_URL') process.env.SUPABASE_URL = m[2];
    if (m?.[1] === 'SERVICE_ROLE_KEY') process.env.SUPABASE_SERVICE_ROLE_KEY = m[2];
  }
}
process.env.PROVIDERS ??= 'fake';
process.env.APP_URL ??= 'http://localhost:3000';
process.env.ADMIN_URL ??= 'http://localhost:3001';
process.env.SUPABASE_FUNCTIONS_URL ??= `http://127.0.0.1:${PORT}/functions/v1`;
process.env.SEND_SMS_HOOK_SECRET ??= 'v1,whsec_M25heWFuLWxvY2FsLWRldi1ob29rLXNlY3JldC0wMDE=';

const deps = makeDeps((k) => process.env[k]);
const wrapped: Record<string, Handler> = {
  'account-deletion-process': accountDeletionProcess,
  'account-deletion-request': accountDeletionRequest,
  'admin-reassign': adminReassign,
  'admin-transition': adminTransition,
  jobs,
  'kyc-bank-verify': kycBankVerify,
  'kyc-digilocker-start': kycDigilockerStart,
  'kyc-pan-verify': kycPanVerify,
  notify: notifyHandler,
  'practitioner-reapply': practitionerReapply,
  'practitioner-submit': practitionerSubmit,
  'razorpay-linked-account-retry': razorpayLinkedAccountRetry,
  'staff-document-url': staffDocumentUrl,
  'staff-invite': staffInvite,
  'trial-join-token': trialJoinToken,
  'trial-outcome': trialOutcome,
  'trial-propose': trialPropose,
  'trial-reschedule-request': trialRescheduleRequest,
  'trial-select': trialSelect,
};
const raw: Record<string, (req: Request) => Promise<Response>> = {
  'auth-send-sms': (req) => handleSendSms(req, deps),
  'hms-webhook': (req) => hmsWebhook(req, deps),
  'kyc-digilocker-callback': (req) => handleDigilockerCallback(req, deps),
};

createServer(async (nodeReq, nodeRes) => {
  const url = new URL(nodeReq.url ?? '/', `http://127.0.0.1:${PORT}`);
  const name = url.pathname.replace(/^\/functions\/v1\//, '').replace(/\/$/, '');
  const chunks: Buffer[] = [];
  for await (const c of nodeReq) chunks.push(c as Buffer);
  const req = new Request(url, {
    method: nodeReq.method,
    headers: nodeReq.headers as Record<string, string>,
    body: ['GET', 'HEAD'].includes(nodeReq.method ?? 'GET') ? undefined : Buffer.concat(chunks),
  });
  const fn = raw[name] ?? (wrapped[name] ? withHandler(wrapped[name]!, () => deps) : null);
  const res = fn ? await fn(req) : new Response(JSON.stringify({ ok: false, error: { code: 'not_found' } }), { status: 404 });
  nodeRes.writeHead(res.status, Object.fromEntries(res.headers.entries()));
  nodeRes.end(Buffer.from(await res.arrayBuffer()));
}).listen(PORT, () => console.log(`functions dev server on http://127.0.0.1:${PORT}/functions/v1`));
