// GENERATED — edit packages/shared/src and run `node scripts/sync-shared.mjs`.
import { z } from 'zod';
import { LIMITS, SESSION_LANGUAGES } from '../constants.ts';

const pincode = z.string().regex(/^[1-9]\d{5}$/, 'Enter a valid 6-digit PIN code');
const httpUrl = z
  .string()
  .url()
  .refine((u) => /^https?:\/\//i.test(u), 'Links must start with http:// or https://');

export const step1Schema = z.object({
  displayName: z.string().trim().min(2).max(60),
  photoPath: z.string().min(1),
  bio: z.string().trim().min(LIMITS.bioMin).max(LIMITS.bioMax),
  yearsExperience: z.number().int().min(0).max(LIMITS.experienceMax),
  subcategoryIds: z.array(z.string().uuid()).min(LIMITS.subcategoriesMin).max(LIMITS.subcategoriesMax),
  languages: z.array(z.enum(SESSION_LANGUAGES)).min(1),
});

export const inPersonSchema = z.object({
  addressFull: z.string().trim().min(5).max(300),
  city: z.string().trim().min(2).max(80),
  pincode,
  lat: z.number().min(-90).max(90),
  lng: z.number().min(-180).max(180),
});

export const step2Schema = z
  .object({ offersOnline: z.boolean(), offersInPerson: z.boolean(), inPerson: inPersonSchema.optional() })
  .refine((v) => v.offersOnline || v.offersInPerson, {
    message: 'Choose at least one session format',
    path: ['offersOnline'],
  })
  .refine((v) => !v.offersInPerson || v.inPerson !== undefined, {
    message: 'Add the address for in-person sessions',
    path: ['inPerson'],
  });

export const step3Schema = z.object({
  certificateIds: z.array(z.string().uuid()).max(LIMITS.certificatesMax),
  credentialsText: z.string().max(LIMITS.credentialsTextMax).optional(),
  links: z.array(httpUrl).max(LIMITS.linksMax),
});

export const step4Schema = z.object({
  videoPath: z.string().min(1),
  videoDurationSeconds: z.number().min(LIMITS.videoMinSeconds).max(LIMITS.videoMaxSeconds),
  videoBytes: z.number().int().positive().max(LIMITS.videoMaxBytes),
  videoMime: z.enum(['video/mp4', 'video/quicktime']),
});

export const residentialAddressSchema = z.object({
  street1: z.string().trim().min(3).max(120),
  street2: z.string().trim().max(120).optional(),
  city: z.string().trim().min(2).max(80),
  state: z.string().trim().min(2).max(80),
  pincode,
});
export type ResidentialAddress = z.infer<typeof residentialAddressSchema>;

export const step5Schema = z.object({
  email: z.string().trim().email(),
  residentialAddress: residentialAddressSchema,
  gstin: z
    .string()
    .regex(/^\d{2}[A-Z]{5}\d{4}[A-Z][1-9A-Z]Z[0-9A-Z]$/, 'Enter a valid GSTIN')
    .optional(),
});

export const step6Schema = z.object({
  agreementVersion: z.string().min(1),
  declarationAccepted: z.literal(true),
});

export const STEP_SCHEMAS = {
  1: step1Schema,
  2: step2Schema,
  3: step3Schema,
  4: step4Schema,
  5: step5Schema,
  6: step6Schema,
} as const;
export type StepNumber = keyof typeof STEP_SCHEMAS;
export const STEP_NUMBERS: StepNumber[] = [1, 2, 3, 4, 5, 6];

export type FileKind = 'photo' | 'certificate' | 'video';
export function fileRuleFor(kind: FileKind): { maxBytes: number; mimes: string[] } {
  switch (kind) {
    case 'photo':
      return { maxBytes: LIMITS.photoMaxBytes, mimes: ['image/jpeg', 'image/png'] };
    case 'certificate':
      return { maxBytes: LIMITS.certificateMaxBytes, mimes: ['application/pdf', 'image/jpeg', 'image/png'] };
    case 'video':
      return { maxBytes: LIMITS.videoMaxBytes, mimes: ['video/mp4', 'video/quicktime'] };
  }
}

export type KycStatus = 'none' | 'pending' | 'passed' | 'flagged' | 'failed';
export type ApplicationSnapshot = {
  step1: unknown;
  step2: unknown;
  step3: unknown;
  step4: unknown;
  step5: unknown;
  step6: unknown;
  kyc: { pan: KycStatus; aadhaar: KycStatus; bank: KycStatus };
};

export type Completeness = { steps: Record<StepNumber, boolean>; complete: boolean; missing: string[] };

const kycDone = (s: KycStatus) => s === 'passed' || s === 'flagged';

export function applicationCompleteness(s: ApplicationSnapshot): Completeness {
  const steps = {} as Record<StepNumber, boolean>;
  const missing: string[] = [];
  for (const n of STEP_NUMBERS) {
    const result = STEP_SCHEMAS[n].safeParse(s[`step${n}`]);
    let ok = result.success;
    if (!result.success) {
      const first = result.error.issues[0];
      missing.push(['step' + n, ...(first?.path ?? [])].join('.'));
    }
    if (n === 5) {
      for (const kind of ['pan', 'aadhaar', 'bank'] as const) {
        if (!kycDone(s.kyc[kind])) {
          ok = false;
          missing.push(`step5.kyc.${kind}`);
        }
      }
    }
    steps[n] = ok;
  }
  return { steps, complete: STEP_NUMBERS.every((n) => steps[n]), missing };
}
