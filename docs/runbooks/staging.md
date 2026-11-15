# 3Nayan staging runbook

How to stand up and verify the **staging** environment for Phase 1. Production repeats these steps with production keys.
Never paste secret values into this file, the repo or chat: they go into the secret stores named below.

## 1. Accounts you need

| Service | What for | Notes |
|---|---|---|
| Supabase | Database, auth, storage, server functions | Create a **staging** project in **Mumbai (ap-south-1)** |
| Vercel | Hosting the web app and admin panel | Two projects: `3nayan-web`, `3nayan-admin` |
| Expo (EAS) | Mobile builds and updates | Create the project; note its project ID |
| Apple Developer / Google Play | Publishing the mobile apps | Needed before store submission, not for staging |
| Razorpay | Payout (Route) accounts | Business KYC complete; ask Razorpay to enable **Route** |
| Cashfree Secure ID | PAN, DigiLocker (Aadhaar), bank checks | Use the **sandbox** credentials for staging |
| MSG91 | OTP SMS, transactional SMS, WhatsApp | DLT entity + sender ID; register templates (section 6) |
| 100ms | In-app video for trial calls | Create a template with roles `reviewer` and `applicant` |
| Google Maps Platform | Address autocomplete (optional in Phase 1) | Restrict the key to your domains |
| Sentry | Error monitoring | Optional for staging |

## 2. GitHub secrets (for `.github/workflows/deploy-staging.yml`)

Repository → Settings → Secrets and variables → Actions:

| Secret | Value |
|---|---|
| `SUPABASE_ACCESS_TOKEN` | Supabase personal access token |
| `STAGING_PROJECT_REF` | Staging project ref (from the project URL) |
| `STAGING_DB_PASSWORD` | Staging database password |
| `VERCEL_TOKEN` | Vercel token |
| `VERCEL_ORG_ID` | Vercel team/org ID |
| `VERCEL_WEB_PROJECT_ID` | Project ID of `3nayan-web` |
| `VERCEL_ADMIN_PROJECT_ID` | Project ID of `3nayan-admin` |

The workflow runs on every push to `main`: database migrations, Edge Functions, then both Vercel deploys. It skips cleanly until these secrets exist.

## 3. Supabase staging project

1. **Migrations**: pushed by the workflow (`supabase db push`). The migration creates the Vault secret `bank_account_key` automatically. **Back it up** (Dashboard → Vault): if it's lost, stored bank and PAN numbers can't be decrypted and practitioners must re-verify.
2. **Vault secrets for scheduled jobs** (Dashboard → Vault → New secret):
   - `project_url` = `https://<project-ref>.supabase.co`
   - `service_role_key` = the project's service-role key
   Until both exist, the cron jobs log "skipping" and do nothing.
3. **Auth → Providers → Phone**: enable phone sign-in.
4. **Auth → Hooks → Send SMS hook**: HTTPS, URL `https://<project-ref>.supabase.co/functions/v1/auth-send-sms`. Generate the secret there and store the same value as the function secret `SEND_SMS_HOOK_SECRET`.
5. **Auth → Multi-factor**: enable TOTP (staff sign-in requires it).
6. **Auth → Rate limits**: SMS per hour sized for real traffic (the hook also limits 5 codes per number per hour).
7. **Auth → URL configuration**: site URL = web staging URL; add the admin URL to redirect URLs (staff invitations).
8. **Settings → Platform settings**: set the commission and legal document versions in the admin panel once a super-admin exists. Seed data sets 20% and `draft-1` versions locally only.

## 4. Edge Function secrets

Dashboard → Edge Functions → Secrets (or `supabase secrets set --project-ref …`):

| Name | Value / source |
|---|---|
| `PROVIDERS` | `real` (use `fake` only for demo environments) |
| `APP_URL` | Web app URL, e.g. `https://staging.3nayan.in` (DigiLocker returns here) |
| `ADMIN_URL` | Admin URL, e.g. `https://admin-staging.3nayan.in` (staff invite links) |
| `SUPABASE_FUNCTIONS_URL` | `https://<project-ref>.supabase.co/functions/v1` (DigiLocker callback base) |
| `SEND_SMS_HOOK_SECRET` | Same value as the Auth hook secret (`v1,whsec_…`) |
| `MSG91_AUTH_KEY` | MSG91 auth key |
| `MSG91_TEMPLATE_OTP` | DLT template id for the OTP message |
| `MSG91_TEMPLATE_*` | One per notification: `MSG91_TEMPLATE_APPLICATION_CHANGES_REQUESTED`, `…_TRIAL_PROPOSED`, `…_TRIAL_REMINDER`, `…_APPLICATION_APPROVED`, `…_APPLICATION_REJECTED`, `…_ACCOUNT_SUSPENDED` |
| `MSG91_WHATSAPP_NUMBER` | Your MSG91-integrated WhatsApp number |
| `EXPO_ACCESS_TOKEN` | Expo access token (push notifications) |
| `CASHFREE_BASE_URL` | `https://sandbox.cashfree.com/verification` (production: `https://api.cashfree.com/verification`) |
| `CASHFREE_CLIENT_ID` | Cashfree Secure ID client id |
| `CASHFREE_CLIENT_SECRET` | Cashfree Secure ID client secret |
| `HMS_ACCESS_KEY` | 100ms app access key |
| `HMS_SECRET` | 100ms app secret |
| `HMS_TEMPLATE_ID` | 100ms template id (roles `reviewer`, `applicant`) |
| `HMS_WEBHOOK_SECRET` | A long random string; also set as a header in 100ms (section 7) |
| `RAZORPAY_KEY_ID` | Razorpay key id (test mode for staging) |
| `RAZORPAY_KEY_SECRET` | Razorpay key secret |
| `RAZORPAY_PROFILE_CATEGORY` | Business category agreed with Razorpay for practitioner accounts |
| `RAZORPAY_PROFILE_SUBCATEGORY` | Business subcategory agreed with Razorpay |

## 5. Vercel environment variables

Both projects (`apps/web` root for `3nayan-web`, `apps/admin` root for `3nayan-admin`):

| Name | Value |
|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | `https://<project-ref>.supabase.co` |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Project anon/publishable key |
| `NEXT_PUBLIC_FUNCTIONS_URL` | Leave **unset** in staging/production (defaults to the project's functions URL) |
| `NEXT_PUBLIC_PROVIDERS` | Unset (or `fake` only for demo deployments without video) |

## 6. MSG91 templates

- **DLT SMS templates** (one per row above, variables in the same order as `supabase/functions/_shared/notifications/templates.ts`).
- **WhatsApp templates** named exactly after the template keys: `application_submitted`, `application_changes_requested`, `trial_proposed`, `trial_pick_reminder`, `trial_reminder`, `application_approved`, `application_rejected`, `account_suspended`.

## 7. 100ms

1. Template with roles `reviewer` and `applicant` (both publish audio + video). Put its id in `HMS_TEMPLATE_ID`.
2. Webhook: URL `https://<project-ref>.supabase.co/functions/v1/hms-webhook`, custom header `x-3nayan-webhook-secret: <HMS_WEBHOOK_SECRET>`, events `peer.join.success` and `peer.leave.success`.

## 8. Mobile (EAS)

| Name | Where | Value |
|---|---|---|
| `EAS_PROJECT_ID` | EAS environment variables | Expo project id (enables push tokens) |
| `EXPO_PUBLIC_SUPABASE_URL` | EAS environment variables | `https://<project-ref>.supabase.co` |
| `EXPO_PUBLIC_SUPABASE_ANON_KEY` | EAS environment variables | Project anon/publishable key |
| `EXPO_PUBLIC_WEB_URL` | EAS environment variables | Web app URL (legal pages) |
| `EXPO_PUBLIC_FUNCTIONS_URL` | EAS environment variables | Leave unset outside local development |
| `EXPO_PUBLIC_PROVIDERS` | EAS environment variables | Unset (or `fake` for demo builds) |

Build: `npx eas-cli@latest build --profile staging --platform all`.

## 9. First super-admin

```bash
SUPABASE_URL=https://<project-ref>.supabase.co SUPABASE_SERVICE_ROLE_KEY=<service-role-key> \
  node scripts/bootstrap-admin.mjs --email founder@example.com
```

They get an invitation email, set a password, then enrol two-factor sign-in on first admin login. Invite other staff from **Admin → Staff**.

## 10. Smoke checklist (spec §1.1)

Record date, tester and result for each.

| # | Check | Result |
|---|---|---|
| 1 | New user signs up with phone OTP on web, iOS and Android and lands on Home ("Booking opens soon") | |
| 2 | Practitioner completes the application on web or mobile; saves on one device and resumes on another | |
| 3 | PAN, DigiLocker and bank checks run against Cashfree sandbox; a name mismatch shows as "flagged", not blocked | |
| 4 | Reviewer takes an application from submission to approval/rejection, including an in-app video trial call (admin web ↔ practitioner web or mobile) | |
| 5 | On approval a Razorpay Route linked account is created (test mode), or the failure appears in Needs attention | |
| 6 | Each status change sends the right SMS, WhatsApp and push | |
| 7 | CI is green on `main` and staging deployed from it | |

## 11. Verify on staging (cannot be tested in the build sandbox)

- 100ms video: web uses `@100mslive/roomkit-react` (declares React 18 as a peer; app uses React 19); mobile uses a minimal room on `@100mslive/react-native-hms`. Test a real call web↔web and web↔mobile.
- Mobile on devices: run `maestro test apps/mobile/maestro/auth.yaml apps/mobile/maestro/apply.yaml` against a dev build (photo/video pickers, resumable video upload, DigiLocker deep link `threenayan://apply/5`).
- Cashfree Secure ID and Razorpay Accounts API request/response shapes against sandbox/test mode (adapters: `supabase/functions/_shared/providers/`).
- MSG91 Flow and WhatsApp payloads with your approved templates.
