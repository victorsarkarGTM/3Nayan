// GENERATED — edit packages/shared/src and run `node scripts/sync-shared.mjs`.
export const SESSION_LANGUAGES = [
  'English',
  'Hindi',
  'Bengali',
  'Tamil',
  'Telugu',
  'Marathi',
  'Gujarati',
  'Kannada',
  'Malayalam',
  'Punjabi',
  'Odia',
  'Urdu',
] as const;
export type SessionLanguage = (typeof SESSION_LANGUAGES)[number];

export const LIMITS = {
  photoMaxBytes: 5_242_880,
  bioMin: 100,
  bioMax: 1500,
  experienceMax: 60,
  subcategoriesMin: 1,
  subcategoriesMax: 5,
  certificatesMax: 10,
  certificateMaxBytes: 10_485_760,
  credentialsTextMax: 2000,
  linksMax: 5,
  videoMinSeconds: 30,
  videoMaxSeconds: 120,
  videoMaxBytes: 104_857_600,
} as const;

export const NAME_MATCH_THRESHOLD = 0.85;
export const KYC_MAX_ATTEMPTS_PER_24H = 3;
export const REAPPLY_WAIT_DAYS = 30;
export const SIGNED_URL_TTL_SECONDS = 60;
export const IST_TIMEZONE = 'Asia/Kolkata';

export const AGREEMENT_DECLARATION =
  'I will not diagnose medical conditions, prescribe medication, or promise guaranteed outcomes.';
