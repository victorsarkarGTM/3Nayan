# 3Nayan — Phase 1: Foundation & Practitioner Onboarding

- **Date:** 2026-11-09
- **Status:** Draft for review
- **Parent:** [Platform Architecture Design](./2026-11-09-platform-architecture-design.md). Everything here follows that document's architecture, data rules, security and testing approach.

## 1. Goal

Stand up the 3Nayan platform foundation and a complete, production-quality practitioner onboarding pipeline. By the end of Phase 1, a practitioner can apply on web or mobile, pass identity and bank checks, be reviewed by 3Nayan staff, take a trial call, and be approved with a payout account ready. Seekers can sign up, but there is nothing to browse or book until Phases 2–3.

### 1.1 Success criteria

1. A new user can sign up with phone OTP on web, iOS and Android, and lands on a seeker home screen.
2. A practitioner can complete the application on web or mobile, save it and resume it on another device.
3. PAN, Aadhaar (via DigiLocker) and bank checks run against Cashfree Secure ID (sandbox in staging). Name mismatches are flagged for the reviewer rather than blocking the applicant.
4. A reviewer can take an application from submission to approval or rejection in the admin panel, including an in-app video trial call (admin web ↔ practitioner web or mobile).
5. On approval, the practitioner's Razorpay Route linked account is created (test mode in staging), or the failure appears in the "Needs attention" queue.
6. Every status change sends the right SMS, WhatsApp and push notification.
7. All RLS and business-rule tests pass in CI, and staging is deployed from `main`.

## 2. Scope

**In scope:** monorepo, tooling, CI and environments; phone OTP auth; seeker and practitioner profiles; the practitioner application (6 steps); KYC; the application status machine; the admin panel (staff auth, roles, review queue, application detail, trial calls, practitioners list, categories, staff, audit log, Needs attention queue); trial calls on 100ms; Razorpay linked account creation; the core notification service; legal consent capture; account deletion requests.

**Out of scope (later phases):** search and public profiles (Phase 2); services, availability, booking and payments (Phase 3); seeker–practitioner sessions (Phase 4); reviews, reports and reminder journeys (Phase 5); boosts (Phase 6).

## 3. Foundation

### 3.1 Repo and tooling
- pnpm workspaces and Turborepo, using the layout in Architecture §2.2.
- TypeScript in strict mode throughout; ESLint and Prettier; shared `tsconfig` base.
- **Web and admin:** Next.js App Router, Tailwind CSS, shadcn/ui components.
- **Mobile:** Expo SDK (latest stable), Expo Router, NativeWind (Tailwind classes, so design tokens are shared with web). It uses an **Expo dev build**, not Expo Go, because 100ms needs native modules.
- **Shared:** `packages/shared` holds the Zod schemas for every form and Edge Function payload, so the same validation runs in the apps and on the server.
- **Database:** `packages/db` holds SQL migrations through the Supabase CLI, seed data (categories, a super-admin bootstrap) and generated types.
- **Design tokens:** one token set (colours, spacing, type scale) shared between Tailwind and NativeWind configs. The visual design itself gets a separate design pass before Phase 2; Phase 1 uses clean, neutral components built on those tokens.

### 3.2 Environments and CI
- `local` (Supabase CLI and Docker), `staging` and `production`, each with its own Supabase project (Mumbai), Vercel projects (web, admin), EAS build profiles and service keys (test or sandbox keys in staging).
- GitHub Actions on every pull request run lint, type-check, Vitest, pgTAP (database tests) and Edge Function integration tests. Merging to `main` runs migrations and deploys to staging. Production is promoted manually.

## 4. Auth and profiles

- **Seekers and practitioners:** phone number plus 6-digit OTP through Supabase Auth. Supabase's Send-SMS hook calls an Edge Function that sends through MSG91 on a DLT-registered template. OTP is rate-limited to 5 requests per number per hour and 20 per IP per hour.
- **Sessions:** web stores sessions in secure cookies (Supabase SSR helpers); mobile stores them in Expo SecureStore.
- **First login:** the user gives their full name (required) and photo (optional) and accepts the current Terms of Use and Privacy Policy. The accepted versions and time are stored in `consents`.
- **Seeker home (Phase 1):** a welcome screen saying booking opens soon, with a "Become a practitioner" entry point. The same entry point sits in account settings on web and mobile.
- **Staff:** separate email-and-password accounts with mandatory TOTP two-factor (Supabase MFA). Super-admins invite staff by email. Staff accounts cannot log in to the public apps, and public accounts cannot log in to admin.

## 5. Practitioner application

The application is a 6-step form, identical on web and mobile. Every step saves to the server as the user goes, so the application can be resumed on any device. Each step shows complete or incomplete, and the user can move between steps freely while the status is `draft` or `changes_requested`.

| Step | Fields | Rules |
|---|---|---|
| 1. About you | Display name; profile photo; bio; years of experience; subcategories; session languages | Photo required (JPG or PNG, ≤5 MB, cropped square); bio 100–1,500 characters; experience 0–60 years; 1–5 subcategories; at least 1 language from a fixed list (English, Hindi, Bengali, Tamil, Telugu, Marathi, Gujarati, Kannada, Malayalam, Punjabi, Odia, Urdu) |
| 2. Session formats | Online and/or in-person; for in-person, the address via Google Places autocomplete | At least one format. In-person stores the full address, city, PIN code and coordinates. The full address stays private until Phase 3 shows it to confirmed seekers |
| 3. Credentials | Certificates; training and lineage description; links | 0–10 files (PDF, JPG, PNG, ≤10 MB each); description ≤2,000 characters, optional; up to 5 links (website or social), optional |
| 4. Video intro | One video introducing themselves | Required; 30–120 seconds; ≤100 MB; MP4 or MOV. Mobile can record in-app or pick from the gallery. Stored privately in Phase 1 |
| 5. Identity and bank | PAN; Aadhaar via DigiLocker; bank account number and IFSC; optional GSTIN | See §6. All three checks must have run (passed or flagged) before submitting |
| 6. Agreement | Practitioner Agreement acceptance; declarations | Must accept the current agreement version and confirm: "I will not diagnose medical conditions, prescribe medication, or promise guaranteed outcomes." Stored in `consents` |

Submitting checks that all steps are complete, then moves the status to `submitted` and notifies the applicant.

## 6. Identity and bank verification (KYC)

- **Provider:** Cashfree Secure ID, reached through a `VerificationProvider` interface in an Edge Function (`verifyPan`, `startDigilocker`, `completeDigilocker`, `verifyBank`). A fake provider implements the same interface for local development and tests.
- **PAN:** the provider returns the registered name and status. A valid PAN is required.
- **Aadhaar:** done only through DigiLocker consent. We store the verified name, year of birth, the last 4 Aadhaar digits and the provider reference. **The full Aadhaar number and the Aadhaar document are never stored.**
- **Bank:** account number and IFSC are checked by a ₹1 test deposit (penny drop), which returns the account holder's name. The account number is encrypted with Supabase Vault; only the last 4 digits are shown in the apps.
- **Name matching:** the PAN, Aadhaar and bank names are compared with a normalised fuzzy match. A score of 0.85 or more passes. Below that, the check is marked `flagged` with the scores, and the application can still be submitted; the reviewer decides.
- **Retries:** each check can be retried up to 3 times per 24 hours, so the paid provider can't be spammed. Provider errors show "We couldn't verify this right now — please try again in a few minutes" and are logged.

## 7. Application status machine

```
draft ──submit──▶ submitted ──claim──▶ in_review
                     ▲                   │  ├─request changes─▶ changes_requested ──resubmit──▶ submitted
                     │                   │  ├─reject─▶ rejected
                     │                   │  └─trial booked─▶ trial_scheduled
                     │                                         ├─approve─▶ approved ──suspend──▶ suspended ──reinstate──▶ approved
                     │                                         ├─reject─▶ rejected
                     └──────────────resubmit───────────────────└─request changes─▶ changes_requested
```

- Transitions run only through the `admin-transition` and `practitioner-submit` Edge Functions, which check the current status, the actor's role and required fields: rejecting, requesting changes and suspending need a reason; approving needs the trial call marked completed. Each transition writes `practitioner_status_history` and `audit_log`.
- `rejected` sets `reapply_after` to 30 days later. After that date, the practitioner can start again, and their previous data is copied into a fresh `draft` for them to edit.
- A reviewer **claims** an application (`in_review`) so two reviewers don't work on the same one. Super-admins can reassign.
- `approved` doesn't yet make the practitioner visible to seekers. Listing requires Phase 2–3 work (services, availability, an active Razorpay linked account).

## 8. Trial calls

- From `in_review`, the reviewer proposes **3 time slots** of 30 minutes each, at least 24 hours ahead, in IST. The practitioner is notified and picks one in the app (web or mobile). Status becomes `trial_scheduled`.
- If no slot is picked within 72 hours, a reminder goes out; at 7 days, the proposal expires and the application returns to the reviewer.
- The practitioner can reschedule **once** by asking for new slots. The reviewer can always re-propose.
- **The call:** a 100ms room is created for the trial. Both sides see a Join button from 10 minutes before the start until 30 minutes after. The `trial-join-token` Edge Function issues a 100ms token only to the assigned reviewer and that practitioner, within that window. Join and leave events are stored.
- **Afterwards:** the reviewer marks the trial `completed` or `missed` and adds notes (required). Then they approve, reject or request changes. A missed trial can be re-proposed once; a second miss can be rejected.

## 9. Razorpay linked account

- On `approved`, the `razorpay-linked-account-create` Edge Function creates a Razorpay Route linked account using the verified legal name, PAN, bank account and business type `individual`. It stores `razorpay_account_id` and `razorpay_account_status`.
- Razorpay activation status is polled every 6 hours until active (or updated by Razorpay's account webhook, if available on the plan).
- Failures retry with exponential backoff, 5 attempts. After that the item goes to the **Needs attention** queue with the error so finance can fix the data and retry from the admin panel.

## 10. Notifications core

- A `notify(user_id, template_key, data)` Edge Function picks channels per template, sends through MSG91 (SMS on DLT templates, WhatsApp on Meta-approved templates) and Expo Push, and writes each send to `notifications` with its delivery status. A failed channel doesn't block the others.
- Mobile registers its Expo push token on login (`device_tokens`), and stale tokens are removed when Expo reports them invalid.
- **Phase 1 templates (all transactional):**

| Template | SMS | WhatsApp | Push |
|---|---|---|---|
| `application_submitted` | | ✓ | ✓ |
| `application_changes_requested` | ✓ | ✓ | ✓ |
| `trial_proposed` | ✓ | ✓ | ✓ |
| `trial_pick_reminder` (72 h) | | ✓ | ✓ |
| `trial_reminder` (1 h before) | ✓ | ✓ | ✓ |
| `application_approved` | ✓ | ✓ | ✓ |
| `application_rejected` | ✓ | ✓ | ✓ |
| `account_suspended` | ✓ | ✓ | ✓ |

- Staff get an in-admin badge count for new submissions; no staff SMS in Phase 1.

## 11. Admin panel (`apps/admin`)

| Screen | Purpose | Roles |
|---|---|---|
| Login | Email, password and TOTP | all staff |
| Applications queue | Filters by status, category, city, flagged checks, age; sorted oldest first; marked when waiting more than 3 days | reviewer, super_admin |
| Application detail | Every field from all 6 steps; documents and video in a viewer using 60-second signed URLs; KYC results with name-match scores; status history; internal notes; action bar (claim, request changes, propose trial, record trial outcome, approve, reject) | reviewer, super_admin (others read-only) |
| My trial calls | Upcoming and past trials, with a Join button | reviewer, super_admin |
| Practitioners | Search by name or phone; status; Razorpay account status; suspend or reinstate | support, finance (read), super_admin |
| Needs attention | Failed linked-account creations, stuck KYC, failed notifications; retry and resolve actions | finance, support, super_admin |
| Categories | Add, rename, reorder and deactivate categories and subcategories | super_admin |
| Staff | Invite, change role, deactivate | super_admin |
| Settings | Platform commission rate (used from Phase 3); current versions of the legal documents | super_admin |
| Audit log | Searchable log of staff and system actions | super_admin |

Every document or video view, every status change and every settings change is written to `audit_log` with the staff id, action, target and time.

## 12. Data model (Phase 1 tables)

| Table | Key columns |
|---|---|
| `profiles` | `id` (= auth user id), `phone`, `full_name`, `photo_path`, `deleted_at` |
| `consents` | `user_id`, `document` (`terms`, `privacy`, `practitioner_agreement`), `version`, `accepted_at` |
| `staff` | `user_id`, `email`, `role`, `active` |
| `categories` | `id`, `parent_id` (null = top level), `name`, `slug`, `sort_order`, `active` |
| `practitioners` | `id`, `user_id` (unique), `display_name`, `photo_path`, `bio`, `years_experience`, `languages text[]`, `offers_online`, `offers_in_person`, `address_full`, `city`, `pincode`, `location geography(point)`, `credentials_text`, `links text[]`, `video_path`, `gstin`, `status`, `assigned_reviewer_id`, `reapply_after`, `razorpay_account_id`, `razorpay_account_status`, `submitted_at`, `approved_at` |
| `practitioner_categories` | `practitioner_id`, `category_id` |
| `practitioner_documents` | `id`, `practitioner_id`, `kind` (`certificate`), `storage_path`, `file_name`, `mime_type`, `size_bytes` |
| `verification_checks` | `id`, `practitioner_id`, `kind` (`pan`, `aadhaar`, `bank`), `status` (`pending`, `passed`, `flagged`, `failed`), `verified_name`, `name_match_score`, `masked_ref`, `provider_ref`, `bank_account_encrypted`, `ifsc`, `attempts`, `last_error`, `checked_at` |
| `practitioner_status_history` | `practitioner_id`, `from_status`, `to_status`, `actor_id`, `reason`, `created_at` |
| `review_notes` | `practitioner_id`, `staff_id`, `body` |
| `trial_calls` | `id`, `practitioner_id`, `reviewer_id`, `proposed_slots tstzrange[]`, `scheduled_at`, `status` (`proposed`, `scheduled`, `completed`, `missed`, `expired`, `cancelled`), `hms_room_id`, `reschedule_used`, `notes` |
| `call_events` | `call_kind` (`trial`; `session` from Phase 4), `call_id`, `user_id`, `event` (`join`, `leave`), `at` |
| `device_tokens` | `user_id`, `expo_token`, `platform`, `last_seen_at` |
| `notifications` | `user_id`, `template_key`, `channel`, `status`, `provider_ref`, `error`, `created_at` |
| `attention_items` | `kind`, `target_id`, `error`, `status` (`open`, `resolved`), `resolved_by` |
| `platform_settings` | `key`, `value jsonb` (commission rate, legal document versions) |
| `audit_log` | `actor_id`, `actor_kind` (`staff`, `system`, `user`), `action`, `target_table`, `target_id`, `metadata jsonb`, `created_at` |
| `deletion_requests` | `user_id`, `requested_at`, `status`, `completed_at` |

**Storage buckets:** `avatars` (public, ≤5 MB images), `practitioner-private` (private: certificates, video intros), with path conventions `{practitioner_id}/{kind}/{uuid}.{ext}`.

**RLS summary**
- Users read and update their own `profiles` row and their own `practitioners` row (only while it's `draft` or `changes_requested`, and only the non-status columns).
- Users read their own `verification_checks` (masked fields only, through a view) and their own `trial_calls`.
- Users never read `review_notes`, `audit_log`, `attention_items` or other users' rows.
- Staff access goes through role-checked policies using an `is_staff(role[])` helper.
- Storage: practitioners upload to their own folder in `practitioner-private`; nobody reads from it directly, and access is only through the signed-URL Edge Function for staff.

## 13. Edge Functions (Phase 1)

| Function | Purpose |
|---|---|
| `auth-send-sms` | Supabase Send-SMS hook that sends the OTP through MSG91 |
| `kyc-pan-verify`, `kyc-digilocker-start`, `kyc-digilocker-callback`, `kyc-bank-verify` | Verification steps (§6) |
| `practitioner-submit` | Validates completeness and runs `draft`/`changes_requested` → `submitted` |
| `admin-transition` | Claim, request changes, reject, approve, suspend, reinstate (§7) |
| `trial-propose`, `trial-select`, `trial-reschedule-request`, `trial-outcome` | Trial call lifecycle (§8) |
| `trial-join-token` | Issues a 100ms token to authorised participants in the time window |
| `hms-webhook` | Records 100ms join and leave events |
| `razorpay-linked-account-create`, `razorpay-account-sync` | Linked account creation and status sync (§9) |
| `notify` | Notification fan-out (§10) |
| `staff-document-url` | 60-second signed URLs for staff, with audit logging |
| `account-deletion-request` | Records the request; a staff-reviewed job anonymises profile data and keeps records the law requires |

Scheduled jobs (pg_cron): trial pick reminders and expiry, trial 1-hour reminders, Razorpay account status sync, notification retry.

## 14. Error handling

- All Edge Functions validate input with the shared Zod schemas and return typed errors `{ code, message }`. The apps map codes to plain-language messages that suggest a next step.
- Uploads use resumable uploads (TUS) for the video; failed uploads can be retried without losing other form data.
- Outside calls (Cashfree, MSG91, 100ms, Razorpay) have timeouts and retry with exponential backoff; persistent failures create an `attention_items` row.
- Transition functions are idempotent: repeating the same transition is a no-op, and a stale transition (status changed meanwhile) returns `conflict` and the UI refreshes.

## 15. Testing

- **Unit (Vitest):** Zod schemas (every rule in §5), the status machine (every allowed and forbidden transition by role), name-match scoring, trial slot rules (24 h minimum, IST display).
- **Database (pgTAP):** RLS for every Phase 1 table, covering own vs other user, practitioner vs seeker, each staff role, and storage access; status columns can't be written by clients.
- **Integration:** each Edge Function against the fake KYC provider, Razorpay test mode, the 100ms sandbox and a stubbed MSG91.
- **End-to-end:** Playwright covers web sign-up, the full application, admin review, trial proposal and approval. Maestro covers mobile sign-up, the application including video upload, and picking a trial slot.

## 16. Inputs needed from the founder (outside dependencies)

These are accounts and documents only the founder can obtain. Work proceeds against sandboxes and the fake provider until they arrive.

1. **Accounts:** Supabase, Vercel, Expo (EAS), Apple Developer Program, Google Play Console, Razorpay (business KYC complete, Route enabled), 100ms, Cashfree Secure ID, MSG91 (DLT entity and sender ID registration, SMS and WhatsApp template approval), Google Maps Platform, Sentry, and the 3nayan domain.
2. **Legal texts** from a lawyer: Terms of Use, Privacy Policy, Practitioner Agreement. Staging ships clearly marked drafts; production requires the final versions.
3. **Tax confirmation** from a chartered accountant on GST and TDS handling before Phase 3.
4. **Product defaults to confirm or change:** the 30-day reapply wait, the 0.85 name-match threshold, the field limits in §5, and the 3-slot, 72-hour trial scheduling rules.
