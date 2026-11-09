# 3Nayan — Platform Architecture Design

- **Date:** 2026-11-09
- **Status:** Draft for review
- **Scope:** Whole-platform design. Each build phase (see §9) gets its own detailed spec; this document is the shared foundation they all follow.

## 1. Product summary

3Nayan is a two-sided marketplace where **seekers** book **practitioners** (healers, astrologers and psychics) for help overcoming hurdles in life. It ships as a web app and a mobile app (iOS and Android).

| Decision | Choice |
|---|---|
| Launch goal | Full public launch: open sign-up for seekers and practitioners, built to scale |
| Market | India first: INR, UPI and Razorpay, IST scheduling |
| Session model | Booked, fixed-price slots paid upfront (no per-minute billing) |
| Session formats | Online inside 3Nayan (video, voice, chat), plus in-person at the practitioner's location |
| Revenue | Commission on every booking, plus paid boosts (featured placement) |
| Practitioner vetting | KYC and credentials, then manual review by staff, then a trial call, then approval |
| App language | English UI; practitioners tagged with the languages they offer sessions in; built for later translation |
| Build model | Claude writes the code; the founder directs, reviews and makes product calls |

### 1.1 Working assumptions (confirmed with founder)

1. Seekers and practitioners log in with a phone number and a one-time code (OTP).
2. iOS and Android both ship at launch.
3. Cancellation policy: if the seeker cancels more than 24 hours before the start, they get a full refund; less than 24 hours before, no refund. If the practitioner cancels or doesn't show up, the seeker always gets a full refund.
4. Practitioners set their own prices and session lengths. One platform-wide commission rate applies, configurable by admins.
5. Sessions carry disclaimers that they are not medical, legal or financial advice. The platform issues GST invoices, and payouts follow Indian rules for online marketplaces, including 1% tax deducted at source (TDS) under Section 194-O. **These tax and legal items must be confirmed by a chartered accountant and a lawyer before launch.**
6. An internal admin panel handles vetting, bookings, refunds, disputes, payouts and boosts.

## 2. Architecture

### 2.1 Approach

One TypeScript codebase across web, mobile and server, with a managed backend (Supabase). We chose this over Flutter with Firebase (web pages Google can't index well, and a database that's a poor fit for payments) and over a self-hosted NestJS backend (more to build before launch, plus servers to run).

### 2.2 Repo layout (pnpm workspaces + Turborepo)

```
apps/web         Next.js (App Router): public site, seeker web app, practitioner dashboard
apps/admin       Next.js: internal admin panel; separate deployment, staff-only login
apps/mobile      Expo (React Native, Expo Router): one app for seekers and practitioners
packages/shared  Zod schemas, shared types, core business rules (money, commission,
                 cancellation/refund policy, slot generation, status transitions)
packages/db      Supabase migrations, seed data, generated database types, database tests
supabase/        Supabase config and Edge Functions (server-side code)
```

Each app talks to Supabase directly for reads and writes that row-level security allows. Anything involving money, outside services or privileged state changes goes through Edge Functions.

### 2.3 Backend: Supabase, hosted in the Mumbai region (ap-south-1)

- **Postgres** with row-level security (RLS) on every table.
- **Auth:** phone OTP. SMS is delivered via MSG91 through Supabase's Send-SMS hook, because MSG91 is registered on India's DLT system, which Indian SMS rules require. Staff log in to the admin panel with email and password plus TOTP two-factor.
- **Storage:** private buckets for KYC and credential documents; a public bucket for profile photos.
- **Edge Functions:** payment webhooks, payouts, 100ms room and token creation, KYC provider calls, notifications, and any privileged status change.
- **Scheduled jobs (pg_cron):** reminders, expiring slot holds, releasing payouts, the nightly payment reconciliation.

### 2.4 Outside services

| Need | Service |
|---|---|
| Payments, commission split, payouts | Razorpay Checkout and Razorpay Route (linked accounts) |
| In-app video, voice, chat | 100ms |
| Identity and bank verification | Cashfree Secure ID (PAN, bank account check, Aadhaar via DigiLocker), behind a swappable interface |
| SMS and WhatsApp | MSG91 |
| Push notifications | Expo Push |
| Addresses and "near me" | Google Maps Platform (Places, Geocoding) |
| Error monitoring | Sentry |

### 2.5 Hosting and environments

- Web and admin run on Vercel; mobile builds go through Expo EAS (with over-the-air updates for JavaScript-only fixes).
- There are three environments: **local** (Supabase CLI), **staging** (test-mode keys for every outside service) and **production**.
- Secrets live in Vercel, EAS and Supabase secret stores, never in the repo.

### 2.6 Core principle

Money and access rules live on the server and in the database, never only in the apps. Prices, commission, refunds, payouts and session access are always computed server-side.

## 3. Data model

All tables have `id uuid`, `created_at` and `updated_at`. Money is stored as integer **paise**. Timestamps are stored in UTC (`timestamptz`) and displayed in IST.

**People**
- `profiles`: one per auth user (phone, full name, photo, acceptance of the current terms version). Every user can act as a seeker.
- `practitioners`: one per practitioner applicant (user id, display name, bio, years of experience, session languages, in-person location, Razorpay linked account id, status).
- `practitioner_categories`: links practitioners to categories (many-to-many).
- `practitioner_documents`: uploaded files with type and review status.
- `verification_checks`: results from the KYC provider (PAN, bank, DigiLocker).
- `staff`: admin users and their role (`reviewer`, `support`, `finance`, `super_admin`).

**Offerings**
- `categories`: a two-level tree. Top level is Healer, Astrologer or Psychic; below are subcategories such as Reiki, Vedic astrology or Tarot. Admins manage the list.
- `services`: what a practitioner offers: mode (`video`, `voice`, `chat`, `in_person`), duration, price, active flag.
- `availability_rules` (weekly hours) and `availability_exceptions` (holidays and blocked time).

**Bookings and money**
- `bookings`: seeker, practitioner, service, start and end times, mode, a snapshot of the price and commission rate at booking time, and a status:
  `pending_payment → confirmed → completed`, or `cancelled_by_seeker`, `cancelled_by_practitioner`, `no_show_practitioner`, `no_show_seeker`, `disputed`, `expired`.
- `payments`, `refunds`, `payouts`: each keyed by its Razorpay ID. Payouts record the practitioner's share, TDS, commission and transfer status.
- `boosts`: paid featured placements with a time window.

**Sessions and trust**
- `sessions`: the 100ms room per online booking, plus join and leave events; the check-in code for in-person sessions.
- `reviews`: at most one per completed booking.
- `reports`: flagged users or sessions.
- `notifications`: log of everything sent and its delivery status.
- `device_tokens`: Expo push tokens.
- `audit_log`: every staff action and privileged system action.

**Rules enforced by the database**
- A Postgres exclusion constraint on `(practitioner_id, tstzrange(start_at, end_at))` covering `confirmed` bookings and unexpired `pending_payment` bookings, so double-booking is impossible.
- Status changes run only through security-definer functions or Edge Functions that check the transition is allowed. Clients cannot write status columns directly.

## 4. Key user journeys

### 4.1 Practitioner onboarding
Sign up, then fill in the profile, then upload documents, then complete KYC (PAN, Aadhaar via DigiLocker, bank account check), then submit. Staff review and schedule a trial call in an in-app 100ms room, then approve or reject with a reason. After approval, the server creates the Razorpay linked account. The practitioner adds services and availability, and their profile goes live. *(Detailed in the Phase 1 spec.)*

### 4.2 Seeker books a session
Pick a service and slot. The server creates a `pending_payment` booking that holds the slot for 10 minutes, then creates a Razorpay order with the price computed server-side. The booking becomes `confirmed` **only on the verified Razorpay webhook**. Both sides get confirmations, then reminders 24 hours and 1 hour before.

### 4.3 The session
- **Online:** the Join button activates 10 minutes before the start. The server checks the person belongs to the booking and it's the right time, then issues a 100ms token. Join and leave events are recorded.
- **In-person:** the full address is shown only after confirmation. The seeker gets a 4-digit check-in code and tells it to the practitioner, who enters it to record attendance.
- **No-shows:** if the practitioner hasn't joined or checked in within 15 minutes of the start, the seeker can claim a no-show and gets an automatic full refund. If the seeker doesn't show, the practitioner is still paid.

### 4.4 Money after the session
The booking completes automatically (online sessions when both sides joined; in-person once the check-in code is entered). The practitioner's share (price minus commission minus TDS) is held for a **48-hour dispute window**, then released through Razorpay Route. The seeker gets a review prompt and a GST invoice. Cancellations and refunds follow §1.1 item 3 and are refunded automatically through Razorpay.

## 5. Error handling

- **Idempotent webhooks:** processing is keyed on the Razorpay event or payment ID, so retries never double-confirm or double-pay.
- **Nightly reconciliation** against Razorpay flags mismatches (e.g. charged but not confirmed) in an admin queue.
- **Late payment after the hold expires:** confirm the booking if the slot is still free; otherwise refund automatically and tell the seeker why.
- **Outside-service failures** (100ms, KYC, MSG91, payouts): retried with exponential backoff. Anything still failing goes to a "Needs attention" admin queue and is never silently dropped.
- **Dropped calls:** either side can rejoin until the booking's end time.
- **User-facing errors:** plain language, never blame the user, always say what to do next.

## 6. Security and privacy

- RLS on every table, with database tests proving that one user cannot read or write another user's data.
- KYC documents sit in private storage and are viewed only by staff through 60-second signed URLs; every view is written to `audit_log`.
- **Full Aadhaar numbers are never stored.** Identity comes from DigiLocker; we store only the verification result, name match and a masked reference.
- Seekers and practitioners never see each other's phone numbers. Phone numbers and payment links in chat are hidden and flagged.
- Staff use two-factor login; role checks gate approve, refund, suspend and payout actions.
- Rate limits on OTP requests, booking attempts and reports.
- Users can export or delete their data, as India's data protection law (the DPDP Act, 2023) requires; financial records are kept for the period tax law requires.

## 7. Testing

- **Unit tests (Vitest):** `packages/shared` business rules: money and commission math, TDS, refund policy, slot generation (IST/UTC, days off, edges), status transitions.
- **Database tests (pgTAP through the Supabase CLI):** RLS policies, the double-booking constraint, status-transition functions.
- **Integration tests:** Edge Functions against Razorpay and 100ms test modes and a fake KYC provider.
- **End-to-end tests:** Playwright for web and admin; Maestro for mobile.
- **CI:** GitHub Actions run lint, type-check, unit, database and integration tests on every pull request. Staging deploys from `main`; production deploys are promoted manually.

## 8. Out of scope for launch

Per-minute billing, wallet top-ups, live "available now" consults, UI translations, subscriptions for practitioners, markets outside India, multiple currencies.

## 9. Build phases

| # | Phase | Covers | Needed for launch |
|---|---|---|---|
| 1 | Foundation and practitioner onboarding | Monorepo, environments, CI, auth, profiles, application and KYC, trial call, admin review panel, notifications core | Yes |
| 2 | Discovery and profiles | Search and filters (category, language, price, mode, near me), public profile pages that Google can index | Yes |
| 3 | Booking and payments | Services, availability, slot holds, Razorpay Checkout, Route split and payouts, refunds, GST invoices, reconciliation | Yes |
| 4 | Sessions | In-app video, voice and chat; in-person check-in; no-show handling | Yes |
| 5 | Trust and engagement | Reviews, reports, reminders, SMS, WhatsApp and push journeys | Yes |
| 6 | Boosts | Paid featured placement | Soon after launch |

Each phase gets its own spec, then an implementation plan, then the build.
