// GENERATED — edit packages/shared/src and run `node scripts/sync-shared.mjs`.
import type { ApplicationSnapshot, KycStatus, ResidentialAddress, StepNumber } from './application.ts';

/** The practitioner columns that hold application answers (workflow columns excluded). */
export type PractitionerRow = {
  display_name: string | null;
  photo_path: string | null;
  bio: string | null;
  years_experience: number | null;
  languages: string[];
  offers_online: boolean;
  offers_in_person: boolean;
  address_full: string | null;
  city: string | null;
  pincode: string | null;
  lat: number | null;
  lng: number | null;
  credentials_text: string | null;
  links: string[];
  video_path: string | null;
  video_duration_seconds: number | null;
  video_bytes: number | null;
  video_mime: string | null;
  email: string | null;
  residential_address: ResidentialAddress | null;
  gstin: string | null;
  agreement_version: string | null;
  declaration_accepted: boolean;
};

const u = <T>(v: T | null | undefined): T | undefined => (v === null ? undefined : v);
const num = (v: number | string | null | undefined) => (v === null || v === undefined ? undefined : Number(v));

/** Columns to write for one step. Join-table fields (subcategoryIds, certificateIds) are handled separately. */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function stepToColumns(step: StepNumber, d: any): Partial<PractitionerRow> {
  switch (step) {
    case 1:
      return {
        display_name: d.displayName,
        photo_path: d.photoPath,
        bio: d.bio,
        years_experience: d.yearsExperience,
        languages: d.languages,
      };
    case 2: {
      const p = d.offersInPerson ? d.inPerson : undefined;
      return {
        offers_online: d.offersOnline,
        offers_in_person: d.offersInPerson,
        address_full: p?.addressFull ?? null,
        city: p?.city ?? null,
        pincode: p?.pincode ?? null,
        lat: p?.lat ?? null,
        lng: p?.lng ?? null,
      };
    }
    case 3:
      return { credentials_text: d.credentialsText ?? null, links: d.links };
    case 4:
      return {
        video_path: d.videoPath,
        video_duration_seconds: d.videoDurationSeconds,
        video_bytes: d.videoBytes,
        video_mime: d.videoMime,
      };
    case 5:
      // GSTIN is written only when the screen sends it (another device may not show the field).
      return { email: d.email, residential_address: d.residentialAddress, ...('gstin' in d ? { gstin: d.gstin ?? null } : {}) };
    case 6:
      return { agreement_version: d.agreementVersion, declaration_accepted: d.declarationAccepted };
  }
}

export function snapshotFromRow(
  row: PractitionerRow,
  extras: { subcategoryIds: string[]; certificateIds: string[]; kyc: ApplicationSnapshot['kyc'] },
): ApplicationSnapshot {
  const address = row.residential_address ? { ...row.residential_address } : undefined;
  if (address && address.street2 == null) delete address.street2;
  return {
    step1: {
      displayName: u(row.display_name),
      photoPath: u(row.photo_path),
      bio: u(row.bio),
      yearsExperience: u(row.years_experience),
      subcategoryIds: extras.subcategoryIds,
      languages: row.languages ?? [],
    },
    step2: {
      offersOnline: row.offers_online,
      offersInPerson: row.offers_in_person,
      ...(row.offers_in_person
        ? {
            inPerson: {
              addressFull: u(row.address_full),
              city: u(row.city),
              pincode: u(row.pincode),
              lat: num(row.lat),
              lng: num(row.lng),
            },
          }
        : {}),
    },
    step3: {
      certificateIds: extras.certificateIds,
      ...(row.credentials_text ? { credentialsText: row.credentials_text } : {}),
      links: row.links ?? [],
    },
    step4: {
      videoPath: u(row.video_path),
      videoDurationSeconds: num(row.video_duration_seconds),
      videoBytes: num(row.video_bytes),
      videoMime: u(row.video_mime),
    },
    step5: { email: u(row.email), residentialAddress: address, ...(row.gstin ? { gstin: row.gstin } : {}) },
    step6: { agreementVersion: u(row.agreement_version), declarationAccepted: row.declaration_accepted },
    kyc: extras.kyc,
  };
}

export const KYC_KINDS = ['pan', 'aadhaar', 'bank'] as const;
export function kycStatuses(rows: Array<{ kind: string; status: string }>): ApplicationSnapshot['kyc'] {
  const get = (k: string) => (rows.find((r) => r.kind === k)?.status as KycStatus | undefined) ?? 'none';
  return { pan: get('pan'), aadhaar: get('aadhaar'), bank: get('bank') };
}
