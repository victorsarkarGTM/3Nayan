import { describe, expect, it } from 'vitest';
import {
  applicationCompleteness,
  fileRuleFor,
  step1Schema,
  step2Schema,
  step3Schema,
  step4Schema,
  step6Schema,
  type ApplicationSnapshot,
} from './application.ts';

const uuid = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
const validStep1 = {
  displayName: 'Rahul Sharma',
  photoPath: 'u1/avatar.png',
  bio: 'x'.repeat(100),
  yearsExperience: 5,
  subcategoryIds: [uuid(1)],
  languages: ['English', 'Hindi'],
};
const validStep2 = { offersOnline: true, offersInPerson: false };
const validStep3 = { certificateIds: [], links: [] };
const validStep4 = { videoPath: 'p/video/v.mp4', videoDurationSeconds: 45, videoBytes: 1000, videoMime: 'video/mp4' };
const validStep5 = {
  email: 'rahul@example.com',
  residentialAddress: { street1: '12 MG Road', city: 'Pune', state: 'Maharashtra', pincode: '411001' },
};
const validStep6 = { agreementVersion: 'draft-1', declarationAccepted: true };
const snapshot = (over: Partial<ApplicationSnapshot> = {}): ApplicationSnapshot => ({
  step1: validStep1,
  step2: validStep2,
  step3: validStep3,
  step4: validStep4,
  step5: validStep5,
  step6: validStep6,
  kyc: { pan: 'passed', aadhaar: 'passed', bank: 'passed' },
  ...over,
});

describe('step schemas', () => {
  it('bio of 99 chars fails, 100 passes, 1501 fails', () => {
    expect(step1Schema.safeParse({ ...validStep1, bio: 'x'.repeat(99) }).success).toBe(false);
    expect(step1Schema.safeParse({ ...validStep1, bio: 'x'.repeat(100) }).success).toBe(true);
    expect(step1Schema.safeParse({ ...validStep1, bio: 'x'.repeat(1501) }).success).toBe(false);
  });
  it('6 subcategories fails', () => {
    const ids = [1, 2, 3, 4, 5, 6].map(uuid);
    expect(step1Schema.safeParse({ ...validStep1, subcategoryIds: ids }).success).toBe(false);
  });
  it('offersInPerson without inPerson fails', () => {
    expect(step2Schema.safeParse({ offersOnline: false, offersInPerson: true }).success).toBe(false);
  });
  it('neither format fails', () => {
    expect(step2Schema.safeParse({ offersOnline: false, offersInPerson: false }).success).toBe(false);
  });
  it('video 29s fails, 121s fails, 30 and 120 pass', () => {
    for (const [s, ok] of [[29, false], [121, false], [30, true], [120, true]] as const)
      expect(step4Schema.safeParse({ ...validStep4, videoDurationSeconds: s }).success).toBe(ok);
  });
  it('ftp link fails', () => {
    expect(step3Schema.safeParse({ ...validStep3, links: ['ftp://example.com'] }).success).toBe(false);
  });
  it('declarationAccepted false fails', () => {
    expect(step6Schema.safeParse({ ...validStep6, declarationAccepted: false }).success).toBe(false);
  });
});

describe('applicationCompleteness', () => {
  it("step 5 incomplete when bank kyc is 'failed'", () => {
    const r = applicationCompleteness(snapshot({ kyc: { pan: 'passed', aadhaar: 'passed', bank: 'failed' } }));
    expect(r.steps[5]).toBe(false);
    expect(r.complete).toBe(false);
  });
  it('step 5 complete with pan passed, aadhaar flagged, bank passed', () => {
    const r = applicationCompleteness(snapshot({ kyc: { pan: 'passed', aadhaar: 'flagged', bank: 'passed' } }));
    expect(r.steps[5]).toBe(true);
    expect(r.complete).toBe(true);
  });
  it("missing lists 'step4.videoPath' for an empty step 4", () => {
    const r = applicationCompleteness(snapshot({ step4: {} }));
    expect(r.steps[4]).toBe(false);
    expect(r.missing).toContain('step4.videoPath');
  });
});

it("fileRuleFor('video').mimes equals ['video/mp4','video/quicktime']", () => {
  expect(fileRuleFor('video').mimes).toEqual(['video/mp4', 'video/quicktime']);
});
