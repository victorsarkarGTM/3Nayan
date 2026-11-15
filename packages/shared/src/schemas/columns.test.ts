import { describe, expect, it } from 'vitest';
import { applicationCompleteness } from './application.ts';
import { snapshotFromRow, stepToColumns, type PractitionerRow } from './columns.ts';

const steps = {
  1: { displayName: 'Rahul Sharma', photoPath: 'u/a.png', bio: 'x'.repeat(120), yearsExperience: 7, subcategoryIds: ['00000000-0000-4000-8000-000000000001'], languages: ['Hindi'] },
  2: { offersOnline: true, offersInPerson: true, inPerson: { addressFull: '12 MG Road, Pune', city: 'Pune', pincode: '411001', lat: 18.52, lng: 73.85 } },
  3: { certificateIds: ['00000000-0000-4000-8000-000000000009'], credentialsText: 'Reiki master', links: ['https://example.com'] },
  4: { videoPath: 'p/video/v.mp4', videoDurationSeconds: 45, videoBytes: 1234, videoMime: 'video/mp4' },
  5: { email: 'r@example.com', residentialAddress: { street1: '12 MG Road', city: 'Pune', state: 'Maharashtra', pincode: '411001' } },
  6: { agreementVersion: 'draft-1', declarationAccepted: true },
} as const;

describe('column mapping', () => {
  it('round-trips every step through practitioner columns', () => {
    const row = Object.assign({}, ...[1, 2, 3, 4, 5, 6].map((n) => stepToColumns(n as 1, steps[n as 1]))) as PractitionerRow;
    const snap = snapshotFromRow(row, {
      subcategoryIds: [...steps[1].subcategoryIds],
      certificateIds: [...steps[3].certificateIds],
      kyc: { pan: 'passed', aadhaar: 'passed', bank: 'passed' },
    });
    expect(snap.step1).toEqual(steps[1]);
    expect(snap.step2).toEqual(steps[2]);
    expect(snap.step3).toEqual(steps[3]);
    expect(snap.step4).toEqual(steps[4]);
    expect(snap.step5).toEqual(steps[5]);
    expect(snap.step6).toEqual(steps[6]);
    expect(applicationCompleteness(snap).complete).toBe(true);
  });
  it('switching off in-person clears the address columns', () => {
    expect(stepToColumns(2, { offersOnline: true, offersInPerson: false })).toMatchObject({
      offers_in_person: false, address_full: null, city: null, pincode: null, lat: null, lng: null,
    });
  });
  it('join-table fields are not written as columns', () => {
    expect(stepToColumns(1, steps[1])).not.toHaveProperty('subcategoryIds');
    expect(stepToColumns(3, steps[3])).not.toHaveProperty('certificateIds');
  });
});

describe('step 5 GSTIN', () => {
  it('a payload without a gstin key leaves the column untouched', () =>
    expect(stepToColumns(5, { email: 'a@b.co', residentialAddress: {} })).not.toHaveProperty('gstin'));
  it('an explicitly cleared gstin writes null', () =>
    expect(stepToColumns(5, { email: 'a@b.co', residentialAddress: {}, gstin: undefined })).toMatchObject({ gstin: null }));
});
