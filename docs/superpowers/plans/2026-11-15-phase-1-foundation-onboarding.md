# 3Nayan Phase 1 — Foundation & Practitioner Onboarding Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the 3Nayan monorepo foundation and the complete practitioner onboarding pipeline (phone sign-up → 6-step application with KYC → staff review → in-app trial call → approval with a Razorpay linked account) across web, admin and mobile.

**Architecture:** A pnpm/Turborepo monorepo. Pure business rules live in `packages/shared` and are copied verbatim into the Edge Functions, so web, mobile and server run identical validation. Supabase Postgres with row-level security (RLS) is the source of truth. Every privileged change goes through Supabase Edge Functions, written as pure `handler(req, deps)` functions so Vitest can test them under Node with fake providers.

**Tech Stack:** TypeScript (strict), pnpm 10, Turborepo, Node 22, Zod 3.25, Supabase (Postgres 15+, Auth, Storage, Edge Functions on Deno, pg_cron, pg_net, pgcrypto, Vault, PostGIS), pgTAP, Vitest, Next.js App Router (latest stable) with Tailwind and shadcn/ui, Expo (latest stable SDK, Expo Router, NativeWind, dev build), 100ms Prebuilt (`@100mslive/roomkit-react`, `@100mslive/react-native-room-kit`), tus-js-client, Playwright, Maestro, GitHub Actions.

**Spec:** `docs/superpowers/specs/2026-11-09-phase-1-foundation-onboarding-design.md` (parent: `docs/superpowers/specs/2026-11-09-platform-architecture-design.md`). Executors read both.

## Global Constraints

- Supabase projects live in the Mumbai region (ap-south-1). Never commit secrets: use `.env.local` files (gitignored) and the Supabase, Vercel and EAS secret stores.
- Money is stored as integer paise. Timestamps are stored as `timestamptz` in UTC and displayed in IST (`Asia/Kolkata`).
- OTP is 6 digits, rate-limited to 5 requests per phone per hour (enforced in the SMS hook) and 20 per IP (Supabase's per-IP limiter, which counts per 5-minute window rather than per hour; flagged below).
- Application limits: photo JPG/PNG ≤5 MB, square; bio 100–1,500 chars; experience 0–60 years; 1–5 subcategories; at least 1 language; certificates 0–10 files (PDF/JPG/PNG) ≤10 MB each; credentials text ≤2,000 chars; ≤5 links; video 30–120 s, ≤100 MB, MP4/MOV.
- Session languages (fixed list, in this order): English, Hindi, Bengali, Tamil, Telugu, Marathi, Gujarati, Kannada, Malayalam, Punjabi, Odia, Urdu.
- Agreement declaration, verbatim: "I will not diagnose medical conditions, prescribe medication, or promise guaranteed outcomes."
- KYC: name-match pass threshold is **0.85**. Each check allows a maximum of **3 attempts per rolling 24 h**. **Never store the full Aadhaar number or the Aadhaar document**; store only the last 4 digits. Bank account numbers are encrypted with a key held in Supabase Vault, and only the last 4 digits are ever returned to apps.
- Trial calls: exactly 3 proposed slots of 30 min each, each starting ≥24 h after proposal time. Pick reminder at 72 h, proposal expires at 7 days. One practitioner reschedule. Join window runs from 10 min before the start until 30 min after the slot's end (`start − 10 min` to `start + 60 min`).
- Staff document links are signed URLs valid for **60 seconds**, and every one issued is written to `audit_log`.
- A rejected applicant can reapply **30 days** after rejection.
- Staff must sign in with email, password and TOTP (Supabase MFA at `aal2`). Staff accounts cannot use the public apps, and public accounts cannot use admin.
- Seekers and practitioners never see each other's phone numbers. No phone number appears in any client-readable view except the user's own.
- User-facing errors use plain language, never blame the user, and always suggest a next step (see `USER_MESSAGES` in Task 3).
- Package names: `@3nayan/shared`, `@3nayan/db`, `@3nayan/client`, `@3nayan/functions`, `@3nayan/web`, `@3nayan/admin`, `@3nayan/mobile`.

### Decisions this plan adds to the spec (flagged to the founder)

1. Step 5 also collects **email** and **residential address** (street1, street2, city, state, PIN code). The Razorpay Route linked-account API requires both. The address is prefilled from the in-person address when one exists.
2. The status machine adds three actions that the spec's prose describes but its diagram omits: `trial_missed` (trial_scheduled → in_review), `trial_reschedule` (trial_scheduled → in_review, once, by the practitioner) and `reapply` (rejected → draft after `reapply_after`). The practitioner row is reused on reapply, and the history table keeps the earlier record.
3. KYC attempts that fail because the provider errored do **not** count towards the 3-per-24 h limit; only completed checks count.
4. The per-IP OTP limit uses Supabase's built-in per-IP limiter (20 per 5-minute window), because the SMS hook can't see IP addresses. The per-phone limit of 5 per hour is enforced exactly.

## Review Focus

1. **Two reviewers act on the same application at once** (two tabs or two people). Exactly one action wins; the other gets `conflict` and the UI refreshes. There are no duplicate history rows or notifications. Test: Task 15 `admin-transition concurrent actions`.
2. **An applicant edits their application after submitting, by calling the API directly.** The database rejects any change while status is not `draft` or `changes_requested`, and always rejects client writes to status or payout columns. Test: Task 9 pgTAP `practitioner_column_guard`.
3. **Phone numbers typed in Indian formats** (`98765 43210`, `+91-98765-43210`, `09876543210`, `919876543210`) all normalise to `+919876543210`. Landline-length or non-6–9-leading numbers are rejected before an OTP is sent. Test: Task 3 `normaliseIndianPhone`.
4. **The reviewer's computer clock or time zone is wrong** when proposing slots. The server re-checks the 24 h rule against its own clock, and slots display in IST whatever the device time zone. Tests: Task 7 `formatIST`, Task 16 `trial-propose rejects slot under 24h by server clock`.
5. **The KYC provider is down or slow.** The applicant sees `provider_unavailable` with retry guidance, the attempt is not consumed, and nothing is half-written. Test: Task 14 `provider error does not consume attempt`.

---

## File Structure

```
package.json, pnpm-workspace.yaml, turbo.json, tsconfig.base.json, .nvmrc, .gitignore,
eslint.config.mjs, .prettierrc, .github/workflows/ci.yml, .github/workflows/deploy-staging.yml
packages/shared/src/
  index.ts                 re-exports
  constants.ts             languages, limits, thresholds, durations
  errors.ts                ErrorCode, USER_MESSAGES, AppError
  phone.ts                 normaliseIndianPhone
  schemas/application.ts   Zod schemas for steps 1–6 + completeness
  schemas/functions.ts     Zod request schemas for every Edge Function
  status/practitioner.ts   status machine
  kyc/name-match.ts        name normalisation + scoring
  trial/slots.ts           slot validation, join window, reminders, IST formatting
packages/db/               package.json (scripts), src/database.types.ts (generated)
supabase/config.toml
supabase/migrations/       timestamped SQL, one file per task (named below)
supabase/tests/            pgTAP *.test.sql
supabase/seed.sql          categories + platform_settings defaults
supabase/functions/
  package.json (@3nayan/functions, Vitest), vitest.config.ts, deno.json (import map)
  _shared/core/            GENERATED copy of packages/shared/src (scripts/sync-shared.mjs)
  _shared/http.ts, auth.ts, db.ts, deps.ts, audit.ts
  _shared/providers/{verification,hms,razorpay,msg91,push}/{types,real,fake}.ts
  _shared/notifications/templates.ts
  <function-name>/index.ts (Deno.serve wiring) + handler.ts (logic)
  tests/*.test.ts, tests/helpers.ts
packages/client/src/       typed data-access used by web, admin, mobile
packages/ui-tokens/        tokens.json shared by Tailwind (web, admin) and NativeWind (mobile)
apps/web/                  Next.js public app
apps/admin/                Next.js staff app
apps/mobile/               Expo app; maestro/ flows
scripts/sync-shared.mjs, scripts/bootstrap-admin.mjs
docs/runbooks/staging.md
```

**Function runtime contract (all Edge Functions):** `POST` with a JSON body. Responses are `{ ok: true, data }` (HTTP 200) or `{ ok: false, error: { code: ErrorCode, message: string } }` with status 400 for `validation_failed`, `invalid_transition`, `incomplete_application`, `reapply_too_soon`, `outside_join_window`, and `kyc_attempts_exhausted`; 401 for `unauthenticated`; 403 for `forbidden`; 404 for `not_found`; 409 for `conflict`; 429 for `rate_limited`; 503 for `provider_unavailable`; 500 for `internal`. Exceptions: `auth-send-sms` (Supabase hook format), `hms-webhook` and `kyc-digilocker-callback` (provider formats), and `jobs` (cron).

---

## Milestone 0 — Foundation

### Task 1: Monorepo scaffold

**Files:**
- Create: `package.json`, `pnpm-workspace.yaml`, `turbo.json`, `tsconfig.base.json`, `.nvmrc` (`22`), `.gitignore`, `eslint.config.mjs`, `.prettierrc`
- Create: `packages/shared/{package.json,tsconfig.json,vitest.config.ts,src/index.ts}`
- Test: `packages/shared/src/index.test.ts`
- Modify: `README.md` (add a "Local development" section)

**Interfaces:**
- Produces: root scripts `lint`, `typecheck`, `test`, `build` (all `turbo run <x>`). Workspaces are `apps/*`, `packages/*`, `supabase/functions`. `tsconfig.base.json` sets `strict`, `noUncheckedIndexedAccess`, `moduleResolution: "bundler"`, `allowImportingTsExtensions: true`, `noEmit: true`.
- `packages/shared` has **zero runtime dependencies except `zod`**, and every relative import uses an explicit `.ts` extension. It must stay runnable under Deno (see Task 12).

- [ ] **Step 1:** Write `packages/shared/src/index.test.ts`: `it('exports SHARED_VERSION', () => expect(SHARED_VERSION).toBe('1'))`.
- [ ] **Step 2:** Run `pnpm install && pnpm --filter @3nayan/shared test`. Expected: FAIL (export missing).
- [ ] **Step 3:** Create the workspace files and add `export const SHARED_VERSION = '1'` to `index.ts`.
- [ ] **Step 4:** Run `pnpm lint && pnpm typecheck && pnpm test`. Expected: all pass.
- [ ] **Step 5:** Commit `chore: scaffold pnpm/turborepo monorepo`.

### Task 2: Supabase local project, database test harness and CI

**Files:**
- Create: `supabase/config.toml` (via `npx supabase init`, then edit), `supabase/migrations/20261115000100_extensions.sql`, `supabase/tests/00_extensions.test.sql`, `supabase/seed.sql` (empty for now)
- Create: `packages/db/package.json` with scripts `db:start` (`supabase start`), `db:reset` (`supabase db reset`), `db:test` (`supabase test db`), `db:types` (`supabase gen types typescript --local > src/database.types.ts`)
- Create: `.github/workflows/ci.yml`

**Interfaces:**
- Produces: the local stack via `pnpm --filter @3nayan/db db:start`. Root alias `pnpm db:test`.
- `config.toml` settings: `[auth.sms] enable_signup = true`, `enable_confirmations = true`; `[auth.sms.test_otp]` maps `919999900001 = "123456"`, `919999900002 = "123456"` and `919999900003 = "123456"` (test numbers only, used by end-to-end tests); `[auth.mfa.totp] enroll_enabled = true`, `verify_enabled = true`; `[auth.hook.send_sms] enabled = true`, `uri = "http://host.docker.internal:54321/functions/v1/auth-send-sms"`; `[auth.rate_limit] sign_in_sign_ups = 20` (Supabase's built-in per-IP limiter, which counts per 5-minute window; it is the closest built-in control, because the SMS hook never sees the caller's IP). The 5-per-phone-per-hour limit is enforced in the hook (Task 12).
- The extensions migration enables `pgcrypto`, `postgis`, `pg_cron`, `pg_net`, `supabase_vault`, `pgtap` (tests only).

- [ ] **Step 1:** Write `supabase/tests/00_extensions.test.sql` with `select plan(5)` and `has_extension('pgcrypto')`, `has_extension('postgis')`, `has_extension('pg_cron')`, `has_extension('pg_net')`, `has_extension('supabase_vault')`.
- [ ] **Step 2:** Run `pnpm db:start && pnpm db:test`. Expected: FAIL (extensions missing).
- [ ] **Step 3:** Write the extensions migration and the `config.toml` settings above.
- [ ] **Step 4:** Run `pnpm db:reset && pnpm db:test`. Expected: PASS.
- [ ] **Step 5:** Write `ci.yml`: on every pull request and on push to `main`, run Node 22 and pnpm install, `pnpm lint`, `pnpm typecheck`, `pnpm test`, then `supabase start`, `pnpm db:test` and `pnpm --filter @3nayan/functions test` (that package is added in Task 12; skip it if absent), then `node scripts/sync-shared.mjs --check` (Task 12; skip if absent).
- [ ] **Step 6:** Commit `chore: add supabase local project, pgTAP harness and CI`.

---

## Milestone 1 — Shared domain rules (`packages/shared`, pure TypeScript)

### Task 3: Constants, error codes, phone normalisation

**Files:**
- Create: `packages/shared/src/constants.ts`, `errors.ts`, `phone.ts`
- Test: `packages/shared/src/errors.test.ts`, `phone.test.ts`

**Interfaces:**
- Produces:
  - `SESSION_LANGUAGES` (readonly tuple, exact Global Constraints order), `type SessionLanguage`.
  - `LIMITS = { photoMaxBytes: 5_242_880, bioMin: 100, bioMax: 1500, experienceMax: 60, subcategoriesMin: 1, subcategoriesMax: 5, certificatesMax: 10, certificateMaxBytes: 10_485_760, credentialsTextMax: 2000, linksMax: 5, videoMinSeconds: 30, videoMaxSeconds: 120, videoMaxBytes: 104_857_600 }`.
  - `NAME_MATCH_THRESHOLD = 0.85`, `KYC_MAX_ATTEMPTS_PER_24H = 3`, `REAPPLY_WAIT_DAYS = 30`, `SIGNED_URL_TTL_SECONDS = 60`, `IST_TIMEZONE = 'Asia/Kolkata'`.
  - `type ErrorCode = 'unauthenticated' | 'forbidden' | 'validation_failed' | 'not_found' | 'conflict' | 'invalid_transition' | 'incomplete_application' | 'rate_limited' | 'provider_unavailable' | 'kyc_attempts_exhausted' | 'outside_join_window' | 'reapply_too_soon' | 'internal'`.
  - `USER_MESSAGES: Record<ErrorCode, string>`. `class AppError extends Error { code: ErrorCode; details?: unknown }`.
  - `normaliseIndianPhone(input: string): string | null` returns E.164 `+91XXXXXXXXXX` or `null`.

- [ ] **Step 1: Write failing tests**

```ts
// phone.test.ts
it.each(['9876543210','98765 43210','+91-98765-43210','09876543210','919876543210','+91 98765 43210'])(
  'normalises %s', (v) => expect(normaliseIndianPhone(v)).toBe('+919876543210'));
it.each(['12345','5876543210','98765432101','+1 415 555 0100','abcdefghij',''])(
  'rejects %s', (v) => expect(normaliseIndianPhone(v)).toBeNull());
// errors.test.ts
it('has a message for every code', () => {
  for (const c of ALL_ERROR_CODES) expect(USER_MESSAGES[c].length).toBeGreaterThan(10);
});
it('provider_unavailable message', () =>
  expect(USER_MESSAGES.provider_unavailable).toBe("We couldn't verify this right now — please try again in a few minutes."));
```

- [ ] **Step 2:** Run `pnpm --filter @3nayan/shared test`. Expected: FAIL.
- [ ] **Step 3:** Implement. A valid mobile number has 10 digits starting 6–9 once a `+91`, `91` or `0` prefix is stripped. Export `ALL_ERROR_CODES`. Write the other messages in plain language with a next step, e.g. `conflict`: "This was just updated by someone else. We've refreshed it — please check and try again."
- [ ] **Step 4:** Run the tests. Expected: PASS.
- [ ] **Step 5:** Commit `feat(shared): constants, error codes and phone normalisation`.

### Task 4: Application step schemas and completeness

**Files:**
- Create: `packages/shared/src/schemas/application.ts`
- Test: `packages/shared/src/schemas/application.test.ts`

**Interfaces:**
- Consumes: `LIMITS`, `SESSION_LANGUAGES` (Task 3).
- Produces:
  - `step1Schema` `{ displayName (2–60 chars), photoPath (string), bio, yearsExperience (int), subcategoryIds (uuid[]), languages (SessionLanguage[]) }`
  - `step2Schema` `{ offersOnline: boolean, offersInPerson: boolean, inPerson?: { addressFull, city, pincode (/^[1-9]\d{5}$/), lat, lng } }`, refined so at least one format is chosen and `inPerson` is required when `offersInPerson`.
  - `step3Schema` `{ certificateIds: uuid[] (≤10), credentialsText?: string (≤2000), links: url[] (≤5, http/https only) }`
  - `step4Schema` `{ videoPath: string, videoDurationSeconds: number (30–120), videoBytes: number (≤ videoMaxBytes), videoMime: 'video/mp4'|'video/quicktime' }`
  - `step5Schema` `{ email, residentialAddress: { street1, street2?, city, state, pincode } , gstin?: /^\d{2}[A-Z]{5}\d{4}[A-Z][1-9A-Z]Z[0-9A-Z]$/ }`. KYC results are not form fields; completeness reads them separately.
  - `step6Schema` `{ agreementVersion: string, declarationAccepted: literal(true) }`
  - `fileRuleFor(kind: 'photo'|'certificate'|'video'): { maxBytes: number; mimes: string[] }`
  - `type ApplicationSnapshot = { step1: unknown; step2: unknown; step3: unknown; step4: unknown; step5: unknown; step6: unknown; kyc: { pan: KycStatus; aadhaar: KycStatus; bank: KycStatus } }`, `type KycStatus = 'none'|'pending'|'passed'|'flagged'|'failed'`
  - `applicationCompleteness(s: ApplicationSnapshot): { steps: Record<1|2|3|4|5|6, boolean>; complete: boolean; missing: string[] }`. Step 5 is complete only if its schema passes **and** all three KYC statuses are `passed` or `flagged`.

- [ ] **Step 1:** Write failing tests:
  - `bio of 99 chars fails, 100 passes, 1501 fails`
  - `6 subcategories fails`
  - `offersInPerson without inPerson fails`
  - `neither format fails`
  - `video 29s fails, 121s fails, 30 and 120 pass`
  - `ftp link fails`
  - `declarationAccepted false fails`
  - `step 5 incomplete when bank kyc is 'failed'`
  - `step 5 complete with pan passed, aadhaar flagged, bank passed`
  - `missing lists 'step4.videoPath' for an empty step 4`
  - `fileRuleFor('video').mimes equals ['video/mp4','video/quicktime']`
- [ ] **Step 2:** Run `pnpm --filter @3nayan/shared test`. Expected: FAIL.
- [ ] **Step 3:** Implement with Zod. `missing` holds the dotted paths of the first Zod issue per failing step.
- [ ] **Step 4:** Run the tests. Expected: PASS.
- [ ] **Step 5:** Commit `feat(shared): application step schemas and completeness`.

### Task 5: Practitioner status machine

**Files:**
- Create: `packages/shared/src/status/practitioner.ts`
- Test: `packages/shared/src/status/practitioner.test.ts`

**Interfaces:**
- Produces:
  - `type PractitionerStatus = 'draft'|'submitted'|'in_review'|'changes_requested'|'trial_scheduled'|'approved'|'rejected'|'suspended'`
  - `type StaffRole = 'reviewer'|'support'|'finance'|'super_admin'`
  - `type Actor = { kind: 'practitioner' } | { kind: 'staff'; role: StaffRole } | { kind: 'system' }`
  - `type TransitionAction = 'submit'|'claim'|'request_changes'|'reject'|'schedule_trial'|'trial_missed'|'trial_reschedule'|'approve'|'suspend'|'reinstate'|'reapply'`
  - `type TransitionContext = { reason?: string; trialCompleted?: boolean; rescheduleUsed?: boolean; reapplyAfter?: Date | null; now: Date; applicationComplete?: boolean }`
  - `planTransition(from: PractitionerStatus, action: TransitionAction, actor: Actor, ctx: TransitionContext): { ok: true; to: PractitionerStatus } | { ok: false; code: 'invalid_transition'|'forbidden'|'validation_failed'|'incomplete_application'|'reapply_too_soon' }`
  - `REASON_REQUIRED: TransitionAction[] = ['request_changes','reject','suspend']`

The transition table, implemented exactly as written. "Reviewer" means a `reviewer` or `super_admin` staff role.

| action | from → to | allowed actor | extra requirement |
|---|---|---|---|
| submit | draft→submitted, changes_requested→submitted | practitioner | `applicationComplete === true` |
| claim | submitted→in_review | reviewer | — |
| request_changes | in_review→changes_requested, trial_scheduled→changes_requested | reviewer | reason (non-blank) |
| reject | in_review→rejected, trial_scheduled→rejected | reviewer | reason |
| schedule_trial | in_review→trial_scheduled | system | — |
| trial_missed | trial_scheduled→in_review | reviewer | — |
| trial_reschedule | trial_scheduled→in_review | practitioner | `rescheduleUsed === false` |
| approve | trial_scheduled→approved | reviewer | `trialCompleted === true` |
| suspend | approved→suspended | support, super_admin | reason |
| reinstate | suspended→approved | super_admin | — |
| reapply | rejected→draft | practitioner | `now >= reapplyAfter` |

Error precedence: `invalid_transition` (action not valid from this status), then `forbidden` (wrong actor), then requirement codes (missing reason → `validation_failed`, incomplete → `incomplete_application`, too soon → `reapply_too_soon`, trial not completed or reschedule already used → `invalid_transition`).

- [ ] **Step 1:** Write failing tests: one `it` per table row for the happy path (asserting `to`); plus `submit from in_review → invalid_transition`; `claim by support → forbidden`; `reject with reason '  ' → validation_failed`; `approve with trialCompleted false → invalid_transition`; `trial_reschedule with rescheduleUsed → invalid_transition`; `reapply 1ms before reapplyAfter → reapply_too_soon`; `submit with applicationComplete false → incomplete_application`; `finance can do nothing` (loop over every action and status → never ok).
- [ ] **Step 2:** Run `pnpm --filter @3nayan/shared test`. Expected: FAIL.
- [ ] **Step 3:** Implement as a data table plus one function.
- [ ] **Step 4:** Run the tests. Expected: PASS.
- [ ] **Step 5:** Commit `feat(shared): practitioner status machine`.

### Task 6: Name matching

**Files:**
- Create: `packages/shared/src/kyc/name-match.ts`
- Test: `packages/shared/src/kyc/name-match.test.ts`

**Interfaces:**
- Produces: `normaliseName(s: string): string`, `nameMatchScore(a: string, b: string): number` (0–1), `classifyNameMatch(scores: number[]): 'passed'|'flagged'`. The result is `passed` only if every score is ≥ `NAME_MATCH_THRESHOLD`.

Algorithm (fixed): `normaliseName` uppercases, strips honorifics (`MR`, `MRS`, `MS`, `DR`, `SHRI`, `SMT`, `KUMARI`), removes non-letters, collapses spaces, and sorts the tokens alphabetically. The score is the larger of (a) the Jaro-Winkler similarity of the two normalised strings and (b) token containment: the share of the shorter name's tokens found in the longer one, with a single-letter token matching any token starting with that letter.

- [ ] **Step 1:** Write failing tests:
  - `'Mr. Rahul Kumar Sharma' vs 'RAHUL K SHARMA' ≥ 0.85`
  - `'Sharma Rahul' vs 'Rahul Sharma' === 1`
  - `'Priya Nair' vs 'Rahul Sharma' < 0.5`
  - `'Smt. Anita Devi' vs 'ANITA DEVI' === 1`
  - `classifyNameMatch([0.9, 0.84]) === 'flagged'`
  - `classifyNameMatch([0.85, 1]) === 'passed'`
- [ ] **Step 2:** Run `pnpm --filter @3nayan/shared test`. Expected: FAIL.
- [ ] **Step 3:** Implement (Jaro-Winkler written in place, no dependency).
- [ ] **Step 4:** Run the tests. Expected: PASS.
- [ ] **Step 5:** Commit `feat(shared): KYC name matching`.

### Task 7: Trial slot rules and IST formatting

**Files:**
- Create: `packages/shared/src/trial/slots.ts`
- Test: `packages/shared/src/trial/slots.test.ts`

**Interfaces:**
- Produces:
  - `TRIAL_SLOT_MINUTES = 30`, `TRIAL_MIN_LEAD_HOURS = 24`, `TRIAL_PICK_REMINDER_HOURS = 72`, `TRIAL_EXPIRY_DAYS = 7`
  - `validateProposedSlots(startsIso: string[], now: Date): { ok: true; starts: Date[] } | { ok: false; reason: 'count'|'lead_time'|'overlap'|'invalid_date' }`: exactly 3 slots, each `≥ now + 24h`, no two overlapping.
  - `joinWindow(start: Date): { opensAt: Date; closesAt: Date }` = `start − 10 min` to `start + 60 min`
  - `isWithinJoinWindow(start: Date, now: Date): boolean`
  - `trialDueActions(proposedAt: Date, now: Date, pickReminderSent: boolean): Array<'send_pick_reminder'|'expire'>`
  - `formatIST(d: Date): string`, giving output like `"Mon, 16 Nov 2026, 3:30 pm IST"` (Intl with `timeZone: IST_TIMEZONE`, `en-IN`)

- [ ] **Step 1:** Write failing tests:
  - `2 slots → count`
  - `slot at now+23h59m → lead_time`
  - `overlapping 10:00 and 10:15 → overlap`
  - `three valid → ok`
  - `join opens at start-10m exactly (inclusive) and closes at start+60m (inclusive)`
  - `trialDueActions at 72h without reminder → ['send_pick_reminder']`
  - `at 7d → includes 'expire'`
  - `formatIST(new Date('2026-11-16T10:00:00Z')) === 'Mon, 16 Nov 2026, 3:30 pm IST'`. Run with `TZ=America/New_York` in the test via `process.env.TZ` to prove the output doesn't depend on the device time zone.
- [ ] **Step 2:** Run `pnpm --filter @3nayan/shared test`. Expected: FAIL.
- [ ] **Step 3:** Implement. Also add Zod request schemas for every Edge Function to `packages/shared/src/schemas/functions.ts` (shapes listed in Tasks 12–17 Interfaces) and re-export everything from `index.ts`.
- [ ] **Step 4:** Run the tests. Expected: PASS.
- [ ] **Step 5:** Commit `feat(shared): trial slot rules, IST formatting, function schemas`.

---

## Milestone 2 — Database (migrations + pgTAP)

All tables get `id uuid primary key default gen_random_uuid()` (except where keyed by user), `created_at timestamptz not null default now()`, `updated_at` maintained by a shared `set_updated_at()` trigger, and `enable row level security`. Each task regenerates types with `pnpm --filter @3nayan/db db:types` before committing.

### Task 8: Identity core: profiles, consents, staff, settings, audit

**Files:**
- Create: `supabase/migrations/20261115000200_identity.sql`, `supabase/tests/10_identity.test.sql`
- Modify: `supabase/seed.sql` (add `platform_settings` defaults: `commission_rate = {"bps": 2000}`, `legal_versions = {"terms":"draft-1","privacy":"draft-1","practitioner_agreement":"draft-1"}`)

**Interfaces:**
- Produces tables (columns per spec §12): `profiles` (PK `id` references `auth.users`), `consents`, `staff` (`role` uses the `staff_role` enum), `platform_settings` (PK `key`), `audit_log`.
- Produces SQL:
  - trigger `on_auth_user_created` inserts `profiles(id, phone)` when `new.phone` is not null.
  - `is_staff(roles staff_role[] default null) returns boolean`: true when the caller has an active staff row (with a role in `roles` when given) **and** `auth.jwt()->>'aal' = 'aal2'`.
  - `write_audit(actor_id uuid, actor_kind text, action text, target_table text, target_id uuid, metadata jsonb) returns void` (security definer, executable by `service_role` only).
- RLS: a user reads and updates only their own `profiles` row (columns `full_name`, `photo_path`); inserts and reads only their own `consents`; `staff` is readable by `is_staff()` and writable by `is_staff('{super_admin}')`; `platform_settings` is readable by authenticated users and writable by `is_staff('{super_admin}')`; `audit_log` is readable by `is_staff('{super_admin}')` only, and has no client insert.

- [ ] **Step 1:** Write the pgTAP tests (use `tests.create_supabase_user` and `tests.authenticate_as` from the `basejump-supabase_test_helpers` package, installed in this migration's test setup):
  - `new auth user with phone creates profile`
  - `user A cannot select user B profile` (`is_empty`)
  - `user cannot update own profile phone` (`throws_ok`)
  - `staff row without aal2 → is_staff() false`
  - `reviewer with aal2 → is_staff('{reviewer}') true and is_staff('{super_admin}') false`
  - `authenticated cannot insert audit_log`
  - `reviewer cannot select audit_log`
- [ ] **Step 2:** Run `pnpm db:test`. Expected: FAIL.
- [ ] **Step 3:** Write the migration. Simulate aal2 in tests by setting `request.jwt.claims` with `"aal":"aal2"`.
- [ ] **Step 4:** Run `pnpm db:reset && pnpm db:test`. Expected: PASS.
- [ ] **Step 5:** Commit `feat(db): profiles, consents, staff, settings, audit log`.

### Task 9: Categories and practitioners (with column guard)

**Files:**
- Create: `supabase/migrations/20261115000300_practitioners.sql`, `supabase/tests/20_practitioners.test.sql`
- Modify: `supabase/seed.sql` (categories: top level `Healer` (subcategories Reiki, Pranic Healing, Sound Healing, Crystal Healing, Energy Healing), `Astrologer` (Vedic Astrology, Western Astrology, Numerology, Vastu, Palmistry), `Psychic` (Tarot Reading, Intuitive Reading, Mediumship, Angel Card Reading); slugs in kebab-case)

**Interfaces:**
- Produces: `categories`, `practitioners` (columns per spec §12, plus `email text`, `residential_address jsonb`, `agreement_version text`, `declaration_accepted boolean not null default false`, `video_duration_seconds int`; `status practitioner_status not null default 'draft'`; `user_id unique`), `practitioner_categories`, `practitioner_documents`.
- Produces: trigger `guard_practitioner_update` (BEFORE UPDATE). When `auth.role() <> 'service_role'`, it raises `42501` if any of `status, assigned_reviewer_id, reapply_after, razorpay_account_id, razorpay_account_status, submitted_at, approved_at, user_id` changed, **or** if `old.status not in ('draft','changes_requested')`.
- RLS:
  - `practitioners`: the owner can select, insert (only with `user_id = auth.uid()`) and update their own row; staff (`is_staff()`) can select all. `practitioner_categories` and `practitioner_documents` follow the parent row's owner and staff rules, with owner writes allowed only while the parent is in `draft` or `changes_requested`.
  - `categories`: readable by everyone (anon included) where `active`; writable by super_admin.
  - The seeker-facing listing is not built in Phase 1, so non-owner, non-staff users cannot read practitioner rows at all.

- [ ] **Step 1:** Write the pgTAP tests:
  - `owner can insert own draft`
  - `owner cannot insert for another user_id`
  - `practitioner_column_guard: owner update of status throws`
  - `practitioner_column_guard: owner update of bio while submitted throws`
  - `owner update of bio while changes_requested succeeds`
  - `user B cannot read user A practitioner`
  - `reviewer (aal2) reads all`
  - `anon reads active categories, not inactive`
  - `owner cannot add document when status submitted`
- [ ] **Step 2:** Run `pnpm db:test`. Expected: FAIL.
- [ ] **Step 3:** Write the migration and seed.
- [ ] **Step 4:** Run `pnpm db:reset && pnpm db:test`. Expected: PASS.
- [ ] **Step 5:** Commit `feat(db): categories and practitioners with column guard`.

### Task 10: Verification checks, status history, notes, transition function

**Files:**
- Create: `supabase/migrations/20261115000400_review.sql`, `supabase/tests/30_review.test.sql`

**Interfaces:**
- Produces: `verification_checks` (spec §12 columns; `bank_account_encrypted bytea`; `kind` is unique per practitioner), `practitioner_status_history`, `review_notes`.
- Produces: view `my_verification_checks` (security invoker) exposing `kind, status, verified_name, name_match_score, masked_ref, attempts, checked_at` for the caller's own practitioner only. The table itself has **no** client select policy; staff select the table.
- Produces: `store_bank_account(p_check_id uuid, p_account text, p_ifsc text) returns void` (security definer, service_role only) encrypts with `pgp_sym_encrypt(p_account, (select decrypted_secret from vault.decrypted_secrets where name = 'bank_account_key'))` and sets `masked_ref = 'XXXX' || right(p_account, 4)`. The migration creates the Vault secret `bank_account_key` locally with `vault.create_secret(encode(gen_random_bytes(32),'hex'), 'bank_account_key')` **only if it doesn't exist**. Staging and production create it by hand (runbook, Task 28).
- Produces: `reveal_bank_account(p_check_id uuid) returns text` (security definer, service_role only; used by Task 17).
- Produces: `apply_practitioner_transition(p_id uuid, p_from practitioner_status, p_to practitioner_status, p_actor uuid, p_actor_kind text, p_action text, p_reason text, p_patch jsonb default '{}') returns boolean` (security definer, service_role only). In one statement it updates `practitioners set status = p_to, <whitelisted patch keys: assigned_reviewer_id, reapply_after, submitted_at, approved_at>` **where id = p_id and status = p_from**. If no row updated, it returns false. Otherwise it inserts a history row plus an `audit_log` row (action `practitioner.<p_action>`) and returns true.
- `review_notes`: insert and select by `is_staff('{reviewer,super_admin,support}')`; no owner access.

- [ ] **Step 1:** Write the pgTAP tests:
  - `owner sees own row in my_verification_checks without bank_account_encrypted column` (`hasnt_column` on view)
  - `owner cannot select verification_checks table`
  - `store_bank_account sets masked_ref 'XXXX3210' and reveal returns original`
  - `authenticated cannot execute store_bank_account`
  - `apply_practitioner_transition returns true once and false on second call with same p_from` (that is, a stale `from`)
  - `transition writes exactly one history and one audit row`
  - `owner cannot read review_notes`
- [ ] **Step 2:** Run `pnpm db:test`. Expected: FAIL.
- [ ] **Step 3:** Write the migration.
- [ ] **Step 4:** Run `pnpm db:reset && pnpm db:test`. Expected: PASS.
- [ ] **Step 5:** Commit `feat(db): verification checks, status history, atomic transitions`.

### Task 11: Trials, calls, notifications, attention, deletion, storage

**Files:**
- Create: `supabase/migrations/20261115000500_operations.sql`, `supabase/tests/40_operations.test.sql`

**Interfaces:**
- Produces tables per spec §12: `trial_calls` (plus `proposed_at timestamptz`, `pick_reminder_sent boolean default false`, `hour_reminder_sent boolean default false`, `proposed_slots timestamptz[]`; status uses the `trial_status` enum), `call_events`, `device_tokens` (unique `expo_token`), `notifications`, `attention_items`, `deletion_requests`.
- RLS:
  - `trial_calls`: select by the owning practitioner (via `practitioners.user_id`) and by staff; no client writes.
  - `call_events`: staff select only.
  - `device_tokens`: owner insert, select and delete.
  - `notifications`: owner select of own rows; staff select all.
  - `attention_items`: `is_staff('{finance,support,super_admin}')` select and update of `status`, `resolved_by`.
  - `deletion_requests`: owner select own; staff select.
- Storage buckets (created in the migration via `storage.buckets` insert):
  - `avatars`: public, `file_size_limit = 5242880`, `allowed_mime_types = {image/jpeg,image/png}`.
  - `practitioner-private`: private, `file_size_limit = 104857600`, mimes `{application/pdf,image/jpeg,image/png,video/mp4,video/quicktime}`.
- Storage policies:
  - `avatars`: insert and update where `(storage.foldername(name))[1] = auth.uid()::text`.
  - `practitioner-private`: insert where `(storage.foldername(name))[1]` is the caller's practitioner id **and** that practitioner is in `draft` or `changes_requested`. No select policy for anyone except `service_role`.
  - Certificates over 10 MB are rejected by the client and by `practitioner-submit` (the bucket limit covers the 100 MB video).

- [ ] **Step 1:** Write the pgTAP tests:
  - `owner can read own trial_calls, user B cannot`
  - `authenticated cannot insert trial_calls`
  - `owner can insert into storage.objects under own practitioner folder in draft`
  - `owner cannot insert under another practitioner folder`
  - `owner cannot select storage.objects in practitioner-private`
  - `bucket practitioner-private file_size_limit = 104857600`
  - `support can update attention_items.status`
  - `reviewer cannot read attention_items`
- [ ] **Step 2:** Run `pnpm db:test`. Expected: FAIL.
- [ ] **Step 3:** Write the migration.
- [ ] **Step 4:** Run `pnpm db:reset && pnpm db:test`. Expected: PASS.
- [ ] **Step 5:** Commit `feat(db): trials, notifications, attention queue, storage buckets`.

---

## Milestone 3 — Edge Functions

### Task 12: Function infrastructure and the SMS hook

**Files:**
- Create: `scripts/sync-shared.mjs`, `supabase/functions/{package.json,vitest.config.ts,deno.json}`
- Create: `supabase/functions/_shared/{http.ts,auth.ts,db.ts,deps.ts,audit.ts}`, `_shared/providers/msg91/{types.ts,real.ts,fake.ts}`
- Create: `supabase/functions/auth-send-sms/{index.ts,handler.ts}`
- Create: `supabase/functions/.env.example`, `tests/helpers.ts`
- Test: `supabase/functions/tests/http.test.ts`, `tests/auth-send-sms.test.ts`
- Modify: `.gitignore` (add `supabase/functions/.env.local`), root `package.json` (script `stack:functions` = `supabase functions serve --env-file supabase/functions/.env.local`)

**Interfaces:**
- Produces:
  - `scripts/sync-shared.mjs` copies `packages/shared/src/**` (excluding `*.test.ts`) into `supabase/functions/_shared/core/`, adding the header `// GENERATED — edit packages/shared`. `--check` exits 1 if the copy is out of date. The generated folder **is committed**, because deploys need it.
  - `deno.json` has `"imports": { "zod": "npm:zod@^3.25", "@supabase/supabase-js": "npm:@supabase/supabase-js@^2", "standardwebhooks": "npm:standardwebhooks@^1", "jose": "npm:jose@^5" }`. Each function's `config.toml` entry sets `import_map = "./functions/deno.json"`. The same bare specifiers resolve from `node_modules` under Vitest.
  - `type Deps = { db: SupabaseClient /* service role */; now: () => Date; env: (k: string) => string | undefined; sms: SmsProvider; push: PushProvider; whatsapp: WhatsAppProvider; verification: VerificationProvider; hms: HmsProvider; razorpay: RazorpayProvider }`. Providers are chosen by env `PROVIDERS=fake|real` (fake in local and CI).
  - `withHandler(handler: (req: Request, deps: Deps) => Promise<unknown>): (req: Request) => Promise<Response>` turns `AppError` into the runtime contract, unknown errors into `internal` (logged), and validates `POST`.
  - `getCaller(req, deps): Promise<{ userId: string; staffRole: StaffRole | null; aal: 'aal1'|'aal2' }>`, throwing `AppError('unauthenticated')`.
  - `requireStaff(caller, roles: StaffRole[])` throws `forbidden` unless the caller has one of the roles **and** `aal === 'aal2'`.
  - `audit(deps, entry)` calls the `write_audit` RPC.
  - `SmsProvider.sendOtp(phoneE164: string, otp: string): Promise<{ providerRef: string }>`. `fake` records the call in memory (exported `fakeSmsOutbox`).
  - `auth-send-sms`: verifies the Supabase hook signature with `standardwebhooks` using env `SEND_SMS_HOOK_SECRET`. It refuses with `http_code: 429` when the phone already has 5 rows in `otp_sends` in the last hour (table `otp_sends(phone text, created_at timestamptz)`, service-role only, added in migration `20261115000150_otp_sends.sql` in this task). Otherwise it inserts a row and sends `user.phone` and `sms.otp`. It returns `{}` on success, or `{ error: { http_code: 500, message } }` per the Supabase hook contract.
  - Test helpers: `createUser(phone)`, `createStaff(email, role)` (with an `aal2` session via the admin API plus TOTP), `invoke(name, body, session?)`, `resetDb()`.

- [ ] **Step 1:** Write failing tests:
  - `withHandler maps AppError('conflict') to 409 { ok:false, error:{ code:'conflict', message: USER_MESSAGES.conflict } }`
  - `withHandler maps thrown TypeError to 500 internal`
  - `GET → 400 validation_failed`
  - `auth-send-sms rejects bad signature`
  - `auth-send-sms with valid signature puts { phone:'+919999900001', otp:'123456' } in fakeSmsOutbox`
  - `6th OTP for same phone within an hour → 429 and nothing sent`
- [ ] **Step 2:** Run `pnpm --filter @3nayan/functions test`. Expected: FAIL.
- [ ] **Step 3:** Implement. Add `sync-shared --check` to CI (it is already in Task 2's workflow).
- [ ] **Step 4:** Run `node scripts/sync-shared.mjs && pnpm --filter @3nayan/functions test`. Expected: PASS.
- [ ] **Step 5:** Commit `feat(functions): handler infrastructure and MSG91 send-SMS hook`.

### Task 13: Notification service

**Files:**
- Create: `supabase/functions/_shared/notifications/{templates.ts,notify.ts}`, `_shared/providers/push/{types.ts,real.ts,fake.ts}`, and the WhatsApp half of `_shared/providers/msg91/*`
- Create: `supabase/functions/notify/{index.ts,handler.ts}` (internal only: accepts the service-role key, for scheduled jobs and retries)
- Test: `supabase/functions/tests/notify.test.ts`

**Interfaces:**
- Produces:
  - `TEMPLATES: Record<TemplateKey, { channels: Array<'sms'|'whatsapp'|'push'>; render: (data) => { smsTemplateId?: string; whatsappTemplate?: string; vars: Record<string,string>; pushTitle: string; pushBody: string } }>`, with keys and channels **exactly** as in spec §10's table. MSG91 template ids come from env `MSG91_TEMPLATE_<KEY_UPPER>`.
  - `notify(deps, userId: string, key: TemplateKey, data: Record<string,string>): Promise<{ sent: string[]; failed: string[] }>`. It sends on each channel independently, writes one `notifications` row per channel (`status` = `sent` | `failed`, plus `error`), and removes `device_tokens` that Expo reports as `DeviceNotRegistered`.
  - `PushProvider.send(tokens: string[], title: string, body: string): Promise<Array<{ token: string; ok: boolean; error?: string }>>`, `WhatsAppProvider.send(phoneE164, template, vars)`.

- [ ] **Step 1:** Write failing tests:
  - `application_submitted sends whatsapp+push only (no sms row)`
  - `trial_proposed writes 3 notification rows`
  - `whatsapp failure still sends push and records failed row with error`
  - `DeviceNotRegistered token is deleted`
  - `every TemplateKey in spec list exists`: assert keys equal `['application_submitted','application_changes_requested','trial_proposed','trial_pick_reminder','trial_reminder','application_approved','application_rejected','account_suspended']`
- [ ] **Step 2:** Run `pnpm --filter @3nayan/functions test`. Expected: FAIL.
- [ ] **Step 3:** Implement.
- [ ] **Step 4:** Run the tests. Expected: PASS.
- [ ] **Step 5:** Commit `feat(functions): notification fan-out (SMS, WhatsApp, push)`.

### Task 14: KYC verification functions

**Files:**
- Create: `supabase/functions/_shared/providers/verification/{types.ts,cashfree.ts,fake.ts}`
- Create: `supabase/functions/{kyc-pan-verify,kyc-bank-verify,kyc-digilocker-start,kyc-digilocker-callback}/{index.ts,handler.ts}`, `_shared/kyc.ts`
- Test: `supabase/functions/tests/kyc.test.ts`

**Interfaces:**
- Consumes: `nameMatchScore`, `classifyNameMatch`, `KYC_MAX_ATTEMPTS_PER_24H` (Tasks 3 and 6); `store_bank_account` (Task 10).
- Produces:
  - `VerificationProvider`:
    - `verifyPan(pan: string): Promise<{ valid: boolean; registeredName: string; ref: string }>`
    - `startDigilocker(redirectUrl: string): Promise<{ url: string; verificationId: string }>`
    - `completeDigilocker(verificationId: string): Promise<{ name: string; yearOfBirth: number; aadhaarLast4: string; ref: string }>`
    - `verifyBank(account: string, ifsc: string): Promise<{ valid: boolean; holderName: string; ref: string }>`
  - Providers throw `ProviderError` on outages. `cashfree.ts` calls the Cashfree Secure ID REST API (headers `x-client-id`, `x-client-secret` from env; base URL from `CASHFREE_BASE_URL`, sandbox in staging). Confirm endpoint paths against the current Cashfree docs when implementing.
  - `fake.ts`: PAN `ABCDE1234F` → valid, name "RAHUL KUMAR SHARMA". PAN `ZZZZZ9999Z` → throws `ProviderError`. Bank account `000000000000` → invalid. Any other account → holder "RAHUL K SHARMA". DigiLocker → "Rahul Kumar Sharma", 1990, last4 `1234`.
  - Request schemas: `kycPanVerify { pan: /^[A-Z]{5}\d{4}[A-Z]$/ }`, `kycBankVerify { accountNumber: /^\d{9,18}$/, ifsc: /^[A-Z]{4}0[A-Z0-9]{6}$/ }`, `kycDigilockerStart {}` → `{ url }`.
  - `kyc-digilocker-callback` is a GET from the provider with `verification_id` and `state`. It completes verification and then 302-redirects to `${APP_URL}/practitioner/apply/5?kyc=done` (web) or `threenayan://apply/5?kyc=done` (mobile, chosen by the `state` param set at start).
  - `_shared/kyc.ts`:
    - `recordCheck(deps, practitionerId, kind, result)` upserts `verification_checks` and recomputes `name_match_score` against the other passed or flagged checks. It sets `status` = `passed` | `flagged` from `classifyNameMatch`, or `failed` when the provider says invalid.
    - `assertAttemptsAvailable(deps, practitionerId, kind)` throws `kyc_attempts_exhausted` when 3 completed attempts fall within the last 24 h.
  - Only completed provider responses (valid or invalid) increment `attempts`. A `ProviderError` returns `provider_unavailable` and changes nothing.
  - All KYC functions require that the caller owns a practitioner in `draft` or `changes_requested`.

- [ ] **Step 1:** Write failing tests:
  - `valid PAN records passed check with verified_name`
  - `PAN + bank names 'RAHUL KUMAR SHARMA'/'RAHUL K SHARMA' → both passed`
  - `bank holder 'PRIYA NAIR' → bank flagged with score < 0.85`
  - `invalid bank → failed, attempts 1`
  - `4th completed attempt in 24h → 400 kyc_attempts_exhausted`
  - `provider error does not consume attempt`: PAN `ZZZZZ9999Z` → 503 `provider_unavailable` and `attempts` stays unchanged
  - `bank account stored encrypted: masked_ref 'XXXX3210' and my_verification_checks never exposes the number`
  - `digilocker stores aadhaar last4 only` (assert no column contains a 12-digit number)
  - `practitioner in submitted status → 400 invalid_transition`
- [ ] **Step 2:** Run `pnpm --filter @3nayan/functions test`. Expected: FAIL.
- [ ] **Step 3:** Implement.
- [ ] **Step 4:** Run the tests. Expected: PASS.
- [ ] **Step 5:** Commit `feat(functions): PAN, DigiLocker and bank verification`.

### Task 15: Submission and admin transitions

**Files:**
- Create: `supabase/functions/{practitioner-submit,practitioner-reapply,admin-transition}/{index.ts,handler.ts}`, `_shared/practitioner.ts`
- Test: `supabase/functions/tests/transitions.test.ts`

**Interfaces:**
- Consumes: `planTransition`, `applicationCompleteness` (Tasks 4–5); `apply_practitioner_transition` (Task 10); `notify` (Task 13).
- Produces:
  - `_shared/practitioner.ts`:
    - `loadSnapshot(deps, practitionerId): Promise<ApplicationSnapshot>` builds the snapshot from the DB row, categories, documents and checks. Certificate sizes are checked here against `LIMITS.certificateMaxBytes`.
    - `transition(deps, { practitionerId, action, actor, actorUserId, reason?, expectedStatus, patch? }): Promise<PractitionerStatus>` runs `planTransition`, then the RPC. When the RPC returns false, it re-reads the row: if the status already equals the planned `to` **and** the last history row has the same action and actor, it returns `to` as a no-op (no notification). Otherwise it throws `conflict`.
  - `practitioner-submit {}` → `{ status: 'submitted' }`. Sets `submitted_at`, sends `application_submitted`.
  - `practitioner-reapply {}` → `{ status: 'draft' }`. Clears `declaration_accepted` and `agreement_version` so the agreement must be re-accepted.
  - `admin-transition { practitionerId: uuid, action: 'claim'|'request_changes'|'reject'|'approve'|'suspend'|'reinstate'|'trial_missed', reason?: string, expectedStatus: PractitionerStatus }` → `{ status }`. Side effects:
    - `claim` sets `assigned_reviewer_id` to the caller.
    - `reject` sets `reapply_after = now + 30d` and sends `application_rejected` with the reason.
    - `request_changes` sends `application_changes_requested` with the reason.
    - `approve` requires the latest `trial_calls.status = 'completed'`, sets `approved_at`, sends `application_approved`, then calls `provisionLinkedAccount` (Task 17) in a non-blocking way. A failure there becomes an attention item, never a failed approval.
    - `suspend` sends `account_suspended`.
  - For an assigned application, only `assigned_reviewer_id` or a super_admin may act. Anyone else gets `forbidden`.

- [ ] **Step 1:** Write failing tests:
  - `submit incomplete → 400 incomplete_application`
  - `submit complete (fixture builder fills all steps with fake KYC) → submitted + one notifications batch`
  - `claim by reviewer → in_review with assigned_reviewer_id`
  - `admin-transition concurrent actions`: fire `reject` and `request_changes` with the same `expectedStatus` via `Promise.all` → exactly one 200 and one 409, exactly one history row added, exactly one notification template sent
  - `approve without completed trial → 400 invalid_transition`
  - `reject sets reapply_after = now+30d` (inject a fixed `now`)
  - `reapply before reapply_after → 400 reapply_too_soon`
  - `reviewer without aal2 → 403 forbidden`
  - `other reviewer acting on assigned application → 403`
  - `repeating claim by same reviewer → 200 no-op, no extra history row`
- [ ] **Step 2:** Run `pnpm --filter @3nayan/functions test`. Expected: FAIL.
- [ ] **Step 3:** Implement.
- [ ] **Step 4:** Run the tests. Expected: PASS.
- [ ] **Step 5:** Commit `feat(functions): application submission and staff transitions`.

### Task 16: Trial call functions and 100ms

**Files:**
- Create: `supabase/functions/_shared/providers/hms/{types.ts,real.ts,fake.ts}`
- Create: `supabase/functions/{trial-propose,trial-select,trial-reschedule-request,trial-outcome,trial-join-token,hms-webhook}/{index.ts,handler.ts}`
- Test: `supabase/functions/tests/trials.test.ts`

**Interfaces:**
- Consumes: `validateProposedSlots`, `isWithinJoinWindow`, `formatIST` (Task 7); `transition` (Task 15); `notify` (Task 13).
- Produces:
  - `HmsProvider.createRoom(name: string): Promise<{ roomId: string }>`, `HmsProvider.authToken(roomId: string, userId: string, role: 'reviewer'|'applicant'): Promise<string>`. `real.ts` signs management and app JWTs with `jose` (HS256, env `HMS_ACCESS_KEY` and `HMS_SECRET`), creates rooms with `POST https://api.100ms.live/v2/rooms` and template `HMS_TEMPLATE_ID`. The template has roles `reviewer` and `applicant`, configured in the 100ms dashboard per the runbook.
  - `trial-propose { practitionerId, slots: string[] }` (reviewer, assigned) requires practitioner status `in_review`. It cancels any open `proposed` trial, inserts a `trial_calls` row (`status 'proposed'`, `proposed_at = now`) and sends `trial_proposed` with the three `formatIST` strings. The 24 h rule is checked against **`deps.now()`**, never a client-supplied time.
  - `trial-select { trialId, slotStart }` (owning practitioner) requires `slotStart` to be one of `proposed_slots` and still ≥24 h away. It sets `scheduled_at` and `status 'scheduled'`, creates the 100ms room, then runs `transition(..., 'schedule_trial', system)`.
  - `trial-reschedule-request { trialId }` (practitioner) runs `transition('trial_reschedule')` with `rescheduleUsed`, sets `reschedule_used = true` and `status 'cancelled'`, and adds a staff attention item of kind `trial_reschedule_requested`.
  - `trial-outcome { trialId, outcome: 'completed'|'missed', notes: string (min 1) }` (assigned reviewer). `missed` also runs `transition('trial_missed')`.
  - `trial-join-token { trialId }` → `{ token, roomId }`. Only the assigned reviewer or the owning practitioner may call it, and only while `isWithinJoinWindow(scheduled_at, now)`. Otherwise it returns `forbidden` or `outside_join_window`.
  - `hms-webhook` checks header `x-3nayan-webhook-secret === HMS_WEBHOOK_SECRET`. It maps `peer.join.success` and `peer.leave.success` (room id → trial) to `call_events` (`call_kind 'trial'`, `user_id` from the peer's `user_id`).

- [ ] **Step 1:** Write failing tests:
  - `trial-propose rejects slot under 24h by server clock` (deps.now fixed; slot = now+23h → 400 `validation_failed`)
  - `propose valid → trial proposed + 3 notification rows`
  - `select slot not in proposal → 400 validation_failed`
  - `select valid → practitioner trial_scheduled, room created (fake roomId)`
  - `join token 11 min before → 400 outside_join_window; at 10 min before → token`
  - `seeker user B → 403`
  - `reschedule twice → second 400 invalid_transition`
  - `outcome missed → practitioner in_review`
  - `webhook with wrong secret → 401; valid join event → call_events row`
- [ ] **Step 2:** Run `pnpm --filter @3nayan/functions test`. Expected: FAIL.
- [ ] **Step 3:** Implement.
- [ ] **Step 4:** Run the tests. Expected: PASS.
- [ ] **Step 5:** Commit `feat(functions): trial call lifecycle and 100ms integration`.

### Task 17: Razorpay linked account, staff document URLs, deletion requests

**Files:**
- Create: `supabase/functions/_shared/providers/razorpay/{types.ts,real.ts,fake.ts}`, `_shared/linked-account.ts`
- Create: `supabase/functions/{razorpay-linked-account-retry,staff-document-url,account-deletion-request,account-deletion-process}/{index.ts,handler.ts}`
- Test: `supabase/functions/tests/razorpay.test.ts`, `tests/staff-document-url.test.ts`, `tests/deletion.test.ts`

**Interfaces:**
- Consumes: `reveal_bank_account` (Task 10), `audit` (Task 12).
- Produces:
  - `RazorpayProvider`:
    - `createLinkedAccount(input: { email: string; phone: string; legalName: string; pan: string; address: ResidentialAddress; referenceId: string }): Promise<{ accountId: string }>`
    - `addStakeholder(accountId, input)`
    - `requestRouteProduct(accountId): Promise<{ productId: string }>`
    - `configureSettlement(accountId, productId, { accountNumber, ifsc, beneficiaryName })`
    - `getAccountStatus(accountId): Promise<'created'|'activated'|'needs_clarification'|'suspended'|'under_review'>`
  - `real.ts` uses Razorpay `v2/accounts` APIs with basic auth (`RAZORPAY_KEY_ID`, `RAZORPAY_KEY_SECRET`). Business `type: 'route'`, `business_type: 'individual'`, and profile category and subcategory from env `RAZORPAY_PROFILE_CATEGORY` / `RAZORPAY_PROFILE_SUBCATEGORY`. `referenceId` is the practitioner id, so retries are idempotent: on a duplicate-reference error, look up and reuse the existing account.
  - `provisionLinkedAccount(deps, practitionerId): Promise<void>` runs the 4 provider calls. On success it stores `razorpay_account_id` and `razorpay_account_status`. It retries with exponential backoff (1 s, 2 s, 4 s, 8 s, 16 s; 5 attempts; delays use an injectable `sleep`). After the 5th failure it inserts `attention_items(kind 'linked_account_failed', target_id, error)`.
  - `syncLinkedAccounts(deps)` (used by Task 18) refreshes the status of every practitioner with an account whose status isn't `activated`.
  - `razorpay-linked-account-retry { practitionerId }` (finance or super_admin) reruns `provisionLinkedAccount` and resolves any open attention item on success.
  - `staff-document-url { path: string }` (any staff with aal2) → `{ url }`. Signed for `SIGNED_URL_TTL_SECONDS` from `practitioner-private`, and writes `audit(action 'document.view', metadata { path })`. The path must start with an existing practitioner id.
  - `account-deletion-request {}` → `{ requestId }`. Inserts `deletion_requests(status 'pending')` and an attention item of kind `deletion_requested`. Duplicate pending requests return the existing id.
  - `account-deletion-process { requestId }` (super_admin): sets `profiles.full_name = 'Deleted user'`, clears `photo_path`, deletes the avatar object and `device_tokens`, and redacts practitioner `bio`, `display_name`, `links`, `credentials_text` and the video object. It **keeps** `verification_checks`, `consents`, status history and audit rows (needed for legal and tax records). It then removes the phone from the auth user and bans them permanently (`auth.admin.updateUserById(id, { phone: null, ban_duration: '876000h' })`), marks the request `completed` and resolves the attention item. Repeating it is a no-op.

- [ ] **Step 1:** Write failing tests:
  - `approve → fake razorpay account stored with status 'created'`
  - `provider fails 5 times → attention item linked_account_failed, practitioner still approved`
  - `retry after fix resolves attention item`
  - `duplicate reference → reuses existing account id`
  - `staff-document-url returns url and writes audit row`
  - `non-staff → 403`
  - `path for unknown practitioner → 404`
  - `deletion request twice → same id`
  - `deletion process anonymises profile, keeps verification_checks, bans auth user; second call no-op`
- [ ] **Step 2:** Run `pnpm --filter @3nayan/functions test`. Expected: FAIL.
- [ ] **Step 3:** Implement.
- [ ] **Step 4:** Run the tests. Expected: PASS.
- [ ] **Step 5:** Commit `feat(functions): Razorpay linked accounts, document URLs, deletion requests`.

### Task 18: Scheduled jobs

**Files:**
- Create: `supabase/functions/jobs/{index.ts,handler.ts}`, `supabase/migrations/20261115000600_cron.sql`
- Test: `supabase/functions/tests/jobs.test.ts`

**Interfaces:**
- Consumes: `trialDueActions`, `joinWindow` (Task 7); `notify` (Task 13); `syncLinkedAccounts` (Task 17).
- Produces: `jobs { job: 'trial-reminders'|'razorpay-sync'|'notification-retry' }`. It is authorised by header `Authorization: Bearer <service role key>` only.
  - `trial-reminders`:
    - For `proposed` trials it applies `trialDueActions`: sends `trial_pick_reminder` once (sets `pick_reminder_sent`), and on `expire` sets the trial to `expired` and adds an attention item of kind `trial_expired` for the reviewer.
    - For `scheduled` trials starting in 55–65 minutes with `hour_reminder_sent = false`, it sends `trial_reminder` to the practitioner and sets the flag.
  - `razorpay-sync` → `syncLinkedAccounts`.
  - `notification-retry` re-sends `notifications` rows with `status 'failed'` created in the last 24 h, at most 3 retries each (add a `retries int default 0` column in this migration).
  - The cron migration schedules jobs with `cron.schedule` + `net.http_post` to `<project url>/functions/v1/jobs`, reading the URL and key from Vault secrets `project_url` and `service_role_key`: `trial-reminders` every 5 minutes, `razorpay-sync` every 6 hours (`0 */6 * * *`), `notification-retry` every 15 minutes.

- [ ] **Step 1:** Write failing tests:
  - `pick reminder sent once at 72h` (running the job twice → one notification batch)
  - `expired at 7d with attention item`
  - `hour reminder for trial starting in 60m, not for 2h`
  - `notification-retry stops after 3 retries`
  - `missing bearer → 401`
- [ ] **Step 2:** Run `pnpm --filter @3nayan/functions test`. Expected: FAIL.
- [ ] **Step 3:** Implement the function and the migration.
- [ ] **Step 4:** Run `pnpm db:reset && pnpm --filter @3nayan/functions test`. Expected: PASS.
- [ ] **Step 5:** Commit `feat(functions): scheduled reminders, account sync, notification retry`.

---

## Milestone 4 — Client data access

### Task 19: `packages/client`

**Files:**
- Create: `packages/client/{package.json,tsconfig.json,vitest.config.ts}`, `src/{index.ts,functions.ts,profile.ts,application.ts,uploads.ts,trials.ts,staff.ts}`
- Test: `packages/client/src/*.test.ts` (against the local stack)

**Interfaces:**
- Consumes: shared schemas and types; `Database` type from `@3nayan/db`.
- Produces (every function takes `sb: SupabaseClient<Database>` first):
  - `callFunction<T>(sb, name: string, body: unknown): Promise<T>` throws `AppError(code)` parsed from the runtime contract.
  - Profile: `getMyProfile`, `updateMyProfile({ fullName, photoPath? })`, `acceptConsents(docs: Array<{ document, version }>)`, `getLegalVersions()`, `requestAccountDeletion()`.
  - Application:
    - `getMyApplication(): Promise<{ practitioner: Row | null; snapshot: ApplicationSnapshot | null; completeness }>`
    - `startApplication(): Promise<Row>`
    - `saveStep(step: 1|2|3|4|5|6, data): Promise<void>` (validates with the step schema first, then writes columns and joins)
    - `listCategories(): Promise<CategoryTree>`
    - `verifyPan(pan)`, `verifyBank(accountNumber, ifsc)`, `startDigilocker(platform: 'web'|'mobile')`, `submitApplication()`, `reapply()`
  - Uploads:
    - `uploadAvatar(file: Blob, ext)`
    - `uploadPractitionerFile(practitionerId, kind: 'certificate'|'video', file: Blob, opts: { onProgress?(pct: number): void }): Promise<{ path: string }>`, using tus-js-client against `${SUPABASE_URL}/storage/v1/upload/resumable` with 6 MB chunks for video and standard upload otherwise. It checks `fileRuleFor(kind)` first and throws `validation_failed`.
  - Trials: `getMyTrial()`, `selectTrialSlot(trialId, slotStart)`, `requestTrialReschedule(trialId)`, `getTrialJoinToken(trialId)`.
  - Staff: `processDeletion(requestId)`, `listApplications(filters: { status?, categoryId?, city?, flaggedOnly?, olderThanDays? })`, `getApplicationDetail(id)`, `adminTransition(input)`, `proposeTrial(practitionerId, slots)`, `recordTrialOutcome(...)`, `addReviewNote(practitionerId, body)`, `getDocumentUrl(path)`, `listMyTrials()`, `searchPractitioners(q)`, `listAttention()`, `resolveAttention(id)`, `retryLinkedAccount(id)`, `listCategoriesAdmin`/`upsertCategory`/`setCategoryActive`/`reorderCategories`, `listStaff`/`inviteStaff`/`setStaffRole`/`setStaffActive`, `getSettings`/`updateSettings`, `listAudit(filters)`.

- [ ] **Step 1:** Write failing tests:
  - `saveStep(1) with 99-char bio throws validation_failed without network call`
  - `saveStep(1) valid persists and getMyApplication reflects completeness.steps[1] true`
  - `uploadPractitionerFile rejects 101MB video client-side`
  - `callFunction maps 409 to AppError code 'conflict'`
  - `listApplications(flaggedOnly) returns only apps with a flagged check`
- [ ] **Step 2:** Run `pnpm stack:up && pnpm --filter @3nayan/client test`. Expected: FAIL.
- [ ] **Step 3:** Implement. Add the root script `stack:up`, which runs `db:start`, `sync-shared` and serves functions in the background with the fake-provider env.
- [ ] **Step 4:** Run the tests. Expected: PASS.
- [ ] **Step 5:** Commit `feat(client): typed data-access package`.

---

## Milestone 5 — Web app (`apps/web`)

### Task 20: Web scaffold, auth, onboarding, seeker home, legal, settings

**Files:**
- Create: `apps/web` via `create-next-app` (TypeScript, App Router, Tailwind, ESLint, `src/`), then shadcn/ui init, `packages/ui-tokens/tokens.json` (colours, spacing, type scale) consumed by Tailwind config
- Create routes:
  - `src/app/(auth)/login/page.tsx` (phone entry → OTP entry)
  - `src/app/onboarding/page.tsx` (full name, optional photo, consent checkboxes linking to the legal pages)
  - `src/app/home/page.tsx` (welcome: "Booking opens soon", plus a "Become a practitioner" card)
  - `src/app/settings/page.tsx` (profile edit, "Become a practitioner", request account deletion with a confirm dialog naming the action)
  - `src/app/legal/[doc]/page.tsx` (renders `content/legal/<doc>.md` with a "DRAFT — not for production" banner when the version starts with `draft-`)
- Create: `src/middleware.ts` (Supabase SSR session refresh; redirects unauthenticated users to `/login`, signed-in users without a full name or consents to `/onboarding`, and staff accounts to `/login?error=staff`)
- Test: `apps/web/e2e/auth.spec.ts`, `apps/web/playwright.config.ts`

**Interfaces:**
- Consumes: `normaliseIndianPhone`, `USER_MESSAGES`, client profile functions.
- Produces: an authenticated layout with `useSession()` (from `src/lib/supabase.ts`: `createBrowserSupabase()` and `createServerSupabase()`).

- [ ] **Step 1:** Write failing Playwright tests (local stack; test OTP `123456`):
  - `invalid phone shows inline error and sends no OTP`
  - `sign up 9999900001 → onboarding → home shows 'Booking opens soon'`
  - `onboarding cannot continue without accepting terms and privacy`
  - `consents stored with current versions` (query via service client in the test)
  - `staff account login on web → error message`
- [ ] **Step 2:** Run `pnpm --filter @3nayan/web e2e`. Expected: FAIL.
- [ ] **Step 3:** Implement. Labels sit visibly above inputs, buttons start with a verb ("Send code", "Verify", "Continue"), and validation runs on blur, with errors cleared on input.
- [ ] **Step 4:** Run the tests. Expected: PASS.
- [ ] **Step 5:** Commit `feat(web): phone auth, onboarding, seeker home, legal pages`.

### Task 21: Web practitioner application, status page, trial call

**Files:**
- Create:
  - `src/app/practitioner/apply/[step]/page.tsx` and step components `src/components/apply/Step{1..6}.tsx`, `StepNav.tsx` (shows ✓ or incomplete for each step; free navigation while editable)
  - `src/app/practitioner/status/page.tsx` (status card per status, change-request reason, rejection reason with reapply date, trial slot picker, Join button)
  - `src/app/practitioner/trial/[id]/page.tsx` (`HMSPrebuilt` from `@100mslive/roomkit-react` with the token from `getTrialJoinToken`; a placeholder panel when `NEXT_PUBLIC_PROVIDERS=fake`)
- Test: `apps/web/e2e/apply.spec.ts`

**Interfaces:**
- Consumes: client application, upload and trial functions; `applicationCompleteness`; `formatIST`; Google Places Autocomplete (`NEXT_PUBLIC_GOOGLE_MAPS_KEY`; with the fake providers a plain address form is used).
- Each step autosaves on blur or change, debounced 800 ms, with a visible "Saved" indicator. Step 4 reads video duration through a hidden `<video>` element's `loadedmetadata` before upload, and shows upload progress. Step 5 shows each KYC check's state (`passed`, `flagged` shown as "We'll review this", `failed` with retry, attempts left) and never shows full numbers.

- [ ] **Step 1:** Write failing Playwright tests:
  - `complete all 6 steps with fake KYC and fixture files (e2e/fixtures/photo.png, cert.pdf, intro-45s.mp4) → submit → status 'Submitted'`
  - `resume: reload mid step 3 keeps step 1–2 data`
  - `video 20s fixture shows 'Video must be 30–120 seconds'`
  - `submit button disabled until all steps complete`
  - `changes_requested shows reason and allows edit + resubmit` (set state through the service client)
  - `trial_proposed shows 3 IST slots; selecting one shows scheduled time`
- [ ] **Step 2:** Run `pnpm --filter @3nayan/web e2e`. Expected: FAIL.
- [ ] **Step 3:** Implement.
- [ ] **Step 4:** Run the tests. Expected: PASS.
- [ ] **Step 5:** Commit `feat(web): practitioner application, status and trial call`.

---

## Milestone 6 — Admin app (`apps/admin`)

### Task 22: Admin scaffold, staff login with TOTP, bootstrap

**Files:**
- Create: `apps/admin` (same scaffold as web), `src/app/login/page.tsx` (email and password, then TOTP enrol with a QR code on first login, then TOTP verify), `src/middleware.ts` (requires a session at aal2 and a staff row, otherwise redirects to `/login`), `src/app/(staff)/layout.tsx` (sidebar showing only the screens the role can use, per spec §11, plus a badge count of `submitted` applications)
- Create: `scripts/bootstrap-admin.mjs` (`node scripts/bootstrap-admin.mjs --email <e>`: service-role invite plus a `staff(role 'super_admin')` insert; idempotent)
- Test: `apps/admin/e2e/login.spec.ts`

**Interfaces:**
- Consumes: Supabase MFA APIs (`mfa.enroll`, `mfa.challenge`, `mfa.verify`), `staff` table.
- Produces: `useStaff(): { role: StaffRole; userId }`, `RoleGate({ roles, children })`.

- [ ] **Step 1:** Write failing Playwright tests (the TOTP code is computed in the test with `otpauth` from the enrolment secret):
  - `first login enrols TOTP then lands on /applications`
  - `wrong TOTP shows error`
  - `phone (public) user cannot access admin`
  - `reviewer sidebar hides Staff, Settings, Audit`
  - `bootstrap-admin twice is idempotent` (Node test in `scripts/bootstrap-admin.test.mjs`)
- [ ] **Step 2:** Run `pnpm --filter @3nayan/admin e2e`. Expected: FAIL.
- [ ] **Step 3:** Implement.
- [ ] **Step 4:** Run the tests. Expected: PASS.
- [ ] **Step 5:** Commit `feat(admin): staff login with TOTP and role-aware shell`.

### Task 23: Applications queue and application detail

**Files:**
- Create: `src/app/(staff)/applications/page.tsx` (table: name, categories, city, submitted date, age badge shown when >3 days, flagged indicator, assigned reviewer; filters from spec §11; oldest first), `src/app/(staff)/applications/[id]/page.tsx`, components `ApplicationSections.tsx` (all 6 steps), `DocumentViewer.tsx` (fetches a signed URL on click; PDF and image inline; video player), `KycPanel.tsx` (each check with status and name-match score), `StatusTimeline.tsx`, `NotesPanel.tsx`, `ActionBar.tsx` (claim, request changes and reject with a required reason, propose trial with 3 date-time pickers in IST, record outcome, approve; buttons enabled according to `planTransition` for the current role and status; destructive actions confirm with the applicant's name)
- Test: `apps/admin/e2e/review.spec.ts`

**Interfaces:**
- Consumes: client staff functions; `planTransition`; `formatIST`.
- On a `conflict` error, show `USER_MESSAGES.conflict` and reload the detail.

- [ ] **Step 1:** Write failing Playwright tests (seed a submitted application through the service client):
  - `queue lists submitted app; flagged filter works`
  - `claim → request changes requires reason → applicant status changes_requested`
  - `propose trial with slot <24h shows validation error`
  - `propose → (select via service client) → record outcome completed → approve → status approved and Razorpay status shown 'created'`
  - `opening a document writes an audit_log row`
  - `stale action in second tab shows conflict message`
- [ ] **Step 2:** Run `pnpm --filter @3nayan/admin e2e`. Expected: FAIL.
- [ ] **Step 3:** Implement.
- [ ] **Step 4:** Run the tests. Expected: PASS.
- [ ] **Step 5:** Commit `feat(admin): applications queue and review workflow`.

### Task 24: Trials, practitioners and Needs attention screens

**Files:**
- Create: `src/app/(staff)/trials/page.tsx` (my upcoming and past trials with Join enabled inside the window), `src/app/(staff)/trials/[id]/call/page.tsx` (HMSPrebuilt, reviewer role), `src/app/(staff)/practitioners/page.tsx` (search by name or phone, status, Razorpay status, suspend with reason / reinstate), `src/app/(staff)/attention/page.tsx` (grouped by kind; Retry for `linked_account_failed`; "Process deletion" for `deletion_requested`, super_admin only, with a confirm dialog naming the user; Resolve for the rest)
- Test: `apps/admin/e2e/operations.spec.ts`

**Interfaces:**
- Consumes: client staff functions; `isWithinJoinWindow`.

- [ ] **Step 1:** Write failing Playwright tests:
  - `trial Join disabled 11 min before, enabled at 10` (clock control with `page.clock`)
  - `support suspends approved practitioner with reason; reinstate hidden for support, visible for super_admin`
  - `failed linked account appears in attention; Retry with fixed fake resolves it`
- [ ] **Step 2:** Run `pnpm --filter @3nayan/admin e2e`. Expected: FAIL.
- [ ] **Step 3:** Implement.
- [ ] **Step 4:** Run the tests. Expected: PASS.
- [ ] **Step 5:** Commit `feat(admin): trials, practitioners and attention queue`.

### Task 25: Categories, staff, settings and audit log screens

**Files:**
- Create: `src/app/(staff)/{categories,staff,settings,audit}/page.tsx`
- Create: `supabase/functions/staff-invite/{index.ts,handler.ts}` (`{ email, role }`, super_admin only: `auth.admin.inviteUserByEmail` plus a staff row; idempotent)
- Test: `apps/admin/e2e/admin-config.spec.ts`, `supabase/functions/tests/staff-invite.test.ts`

**Interfaces:**
- Consumes: client staff functions.
- Settings edits `commission_rate.bps` (integer 0–5000; shown as a percentage) and the legal document versions. Changing a legal version means users must re-accept on next login, because the web middleware compares against `consents`.

- [ ] **Step 1:** Write failing tests:
  - `staff-invite by reviewer → 403; by super_admin twice → one staff row`
  - `super_admin adds subcategory and deactivates it; anon category list excludes it`
  - `commission 5001 bps rejected`
  - `bump terms version → seeker redirected to onboarding consent on next visit`
  - `audit log filters by action 'document.view'`
- [ ] **Step 2:** Run `pnpm --filter @3nayan/functions test && pnpm --filter @3nayan/admin e2e`. Expected: FAIL.
- [ ] **Step 3:** Implement.
- [ ] **Step 4:** Run the tests. Expected: PASS.
- [ ] **Step 5:** Commit `feat(admin): categories, staff, settings and audit log`.

---

## Milestone 7 — Mobile app (`apps/mobile`)

Mobile end-to-end flows use Maestro on a local emulator or simulator against the local stack (`EXPO_PUBLIC_SUPABASE_URL=http://10.0.2.2:54321` on Android). CI runs lint, type-check and unit tests for mobile. Maestro runs are a local gate before merging mobile tasks, and a CI job is added once an EAS or Maestro Cloud account exists (runbook, Task 28).

### Task 26: Expo scaffold, auth, onboarding, home, account, push

**Files:**
- Create: `apps/mobile` via `create-expo-app` (TypeScript, Expo Router), `app.config.ts` (scheme `threenayan`, bundle id `in.threenayan.app`, plugins `expo-secure-store`, `expo-notifications`, `@100mslive/react-native-hms` config plugin), `eas.json` (profiles `development`, `staging`, `production`), NativeWind set up with the shared tokens
- Create routes: `app/(auth)/login.tsx`, `app/(auth)/verify.tsx`, `app/onboarding.tsx`, `app/(tabs)/home.tsx`, `app/(tabs)/account.tsx` (profile, Become a practitioner, legal links opening the web legal pages, request deletion)
- Create: `src/lib/supabase.ts` (sessions in SecureStore through a chunked storage adapter, because SecureStore values are limited to 2 KB), `src/lib/push.ts` (`registerPushToken()`, called after login, inserts into `device_tokens`)
- Test: `apps/mobile/src/lib/secure-storage.test.ts` (Jest via `jest-expo`), `apps/mobile/maestro/auth.yaml`

**Interfaces:**
- Consumes: client profile functions, `normaliseIndianPhone`.
- Produces: `useSession()`, `ChunkedSecureStore` with `getItem`/`setItem`/`removeItem` splitting values into ≤1,800-character chunks.

- [ ] **Step 1:** Write the failing unit test `ChunkedSecureStore round-trips a 5,000-char value and removes all chunks`, and the Maestro flow `auth.yaml`: enter `99999 00002`, OTP `123456`, onboarding, see "Booking opens soon".
- [ ] **Step 2:** Run `pnpm --filter @3nayan/mobile test`. Expected: FAIL.
- [ ] **Step 3:** Implement. Build the dev client with `eas build --profile development --local` (or `npx expo run:android`).
- [ ] **Step 4:** Run `pnpm --filter @3nayan/mobile test` (PASS) and `maestro test apps/mobile/maestro/auth.yaml` (PASS on emulator).
- [ ] **Step 5:** Commit `feat(mobile): Expo app with phone auth, onboarding and push registration`.

### Task 27: Mobile application, status, trial call

**Files:**
- Create: `app/apply/[step].tsx`, components `src/components/apply/Step{1..6}.tsx`, `app/practitioner/status.tsx`, `app/trial/[id].tsx` (`HMSPrebuilt` from `@100mslive/react-native-room-kit`), deep link handling for `threenayan://apply/5?kyc=done`
- Test: `apps/mobile/maestro/apply.yaml`, `apps/mobile/src/components/apply/video.test.ts`

**Interfaces:**
- Consumes: the same client functions as web Task 21. The photo uses `expo-image-picker` (square crop). Video uses `expo-image-picker` with `mediaTypes: ['videos']` and `videoMaxDuration: 120`, using the returned `duration` (ms) for validation. Certificates use `expo-document-picker`. Uploads read the file with `fetch(uri).blob()` and pass it to `uploadPractitionerFile`. DigiLocker opens with `expo-web-browser`'s `openAuthSessionAsync` and the deep link.
- Produces: `validatePickedVideo(asset: { duration: number | null; fileSize?: number; mimeType?: string }): { ok: true } | { ok: false; message: string }`.

- [ ] **Step 1:** Write failing tests:
  - `validatePickedVideo duration 29000 → message 'Video must be 30–120 seconds'`
  - `null duration → asks to re-record`
  - `110MB → size message`
  - Maestro `apply.yaml`: complete steps 1–6 using fixture media pushed to the emulator gallery and fake KYC → submit → status "Submitted"
- [ ] **Step 2:** Run `pnpm --filter @3nayan/mobile test`. Expected: FAIL.
- [ ] **Step 3:** Implement.
- [ ] **Step 4:** Run `pnpm --filter @3nayan/mobile test` (PASS) and `maestro test apps/mobile/maestro/apply.yaml` (PASS).
- [ ] **Step 5:** Commit `feat(mobile): practitioner application, status and trial call`.

---

## Milestone 8 — Staging

### Task 28: Staging deployment pipeline and runbook

**Files:**
- Create: `.github/workflows/deploy-staging.yml` (on push to `main`: `supabase link --project-ref $STAGING_REF`, `supabase db push`, `node scripts/sync-shared.mjs --check`, `supabase functions deploy`, then Vercel deploys for web and admin via `vercel deploy --prod` with the staging project tokens)
- Create: `docs/runbooks/staging.md`. It lists every secret by name, with no values:
  - Supabase function secrets: `PROVIDERS`, `SEND_SMS_HOOK_SECRET`, `MSG91_AUTH_KEY`, `MSG91_SENDER_ID`, `MSG91_TEMPLATE_*`, `MSG91_WHATSAPP_NUMBER`, `CASHFREE_CLIENT_ID`, `CASHFREE_CLIENT_SECRET`, `CASHFREE_BASE_URL`, `HMS_ACCESS_KEY`, `HMS_SECRET`, `HMS_TEMPLATE_ID`, `HMS_WEBHOOK_SECRET`, `RAZORPAY_KEY_ID`, `RAZORPAY_KEY_SECRET`, `RAZORPAY_PROFILE_CATEGORY`, `RAZORPAY_PROFILE_SUBCATEGORY`, `APP_URL`, `EXPO_ACCESS_TOKEN`
  - Vault secrets: `bank_account_key`, `project_url`, `service_role_key`
  - Vercel environment variables, EAS environment variables
  - 100ms template roles (`reviewer`, `applicant`) and webhook header setup, the auth hook URL, enabling Supabase phone auth with the hook, and creating the first super-admin with `bootstrap-admin`
  - The **smoke checklist**, one item per spec §1.1 success criterion (1–7)
- Test: `scripts/check-runbook.test.mjs`. It asserts that every env var read anywhere via `deps.env('X')` or `process.env.X` / `EXPO_PUBLIC_*` / `NEXT_PUBLIC_*` appears in `docs/runbooks/staging.md`.

**Interfaces:**
- Consumes: everything above.

- [ ] **Step 1:** Write the failing test `every referenced env var is documented in the runbook`.
- [ ] **Step 2:** Run `node --test scripts/check-runbook.test.mjs`. Expected: FAIL.
- [ ] **Step 3:** Write the workflow and the runbook.
- [ ] **Step 4:** Run `node --test scripts/check-runbook.test.mjs` (PASS) and `pnpm lint && pnpm typecheck && pnpm test` (PASS).
- [ ] **Step 5:** Commit `chore: staging deploy pipeline and runbook`.
- [ ] **Step 6 (blocked on founder accounts, spec §16):** Once the accounts exist, add the GitHub secrets, merge to `main`, and work through the smoke checklist on staging. Record the results in the runbook.
