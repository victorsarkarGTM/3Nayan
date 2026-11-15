import { describe, expect, it } from 'vitest';
import { AppError } from '@3nayan/shared';
import {
  callFunction,
  getMyApplication,
  listApplications,
  searchPractitioners,
  uploadAvatar,
  removeCertificate,
  chooseUploadPath,
  listCategories,
  saveStep,
  startApplication,
  uploadPractitionerFile,
} from '../src/index.ts';
import { admin, anon, signedInStaff, signedInUser } from './helpers.ts';

const validStep1 = (subcategoryId: string) => ({
  displayName: 'Rahul Sharma',
  photoPath: 'x/avatar.png',
  bio: 'I help people find calm through Reiki and guided breathwork. '.repeat(2),
  yearsExperience: 6,
  subcategoryIds: [subcategoryId],
  languages: ['English', 'Hindi'],
});

describe('@3nayan/client', () => {
  it('saveStep(1) with 99-char bio throws validation_failed without network call', async () => {
    let called = false;
    const sb = anon(async () => {
      called = true;
      throw new Error('network should not be used');
    });
    await expect(saveStep(sb, 1, { ...validStep1('00000000-0000-4000-8000-000000000001'), bio: 'x'.repeat(99) })).rejects.toMatchObject({
      code: 'validation_failed',
    });
    expect(called).toBe(false);
  });

  it('saveStep(1) valid persists and getMyApplication reflects completeness.steps[1] true', async () => {
    const { sb } = await signedInUser();
    await startApplication(sb);
    const tree = await listCategories(sb);
    const sub = tree[0]!.children[0]!.id;
    await saveStep(sb, 1, validStep1(sub));
    const app = await getMyApplication(sb);
    expect(app.completeness?.steps[1]).toBe(true);
    expect(app.completeness?.steps[2]).toBe(false);
    expect(app.snapshot?.step1).toMatchObject({ displayName: 'Rahul Sharma', subcategoryIds: [sub] });
  });

  it('draft saves persist incomplete data without validation', async () => {
    const { sb } = await signedInUser();
    await startApplication(sb);
    await saveStep(sb, 1, { displayName: 'Ra' }, { draft: true });
    const app = await getMyApplication(sb);
    expect(app.practitioner?.display_name).toBe('Ra');
    expect(app.completeness?.steps[1]).toBe(false);
  });

  it('uploadPractitionerFile rejects 101MB video client-side', async () => {
    const big = { size: 101 * 1024 * 1024, type: 'video/mp4' } as Blob;
    await expect(uploadPractitionerFile(anon(), '00000000-0000-4000-8000-000000000001', 'video', big)).rejects.toMatchObject({
      code: 'validation_failed',
    });
  });

  it("callFunction maps 409 to AppError code 'conflict'", async () => {
    const sb = anon(async () => new Response(JSON.stringify({ ok: false, error: { code: 'conflict', message: 'm' } }), { status: 409 }));
    const err = (await callFunction(sb, 'admin-transition', {}).catch((e: unknown) => e)) as AppError;
    expect(err).toBeInstanceOf(AppError);
    expect(err.code).toBe('conflict');
  });

  it('listApplications(flaggedOnly) returns only apps with a flagged check', async () => {
    const db = admin();
    const make = async (flag: boolean) => {
      const { userId } = await signedInUser();
      const { data: p } = await db.from('practitioners').insert({ user_id: userId, display_name: flag ? 'Flagged' : 'Clean', status: 'submitted', submitted_at: new Date().toISOString() }).select('id').single();
      await db.from('verification_checks').insert({ practitioner_id: p!.id, kind: 'bank', status: flag ? 'flagged' : 'passed' });
      return p!.id;
    };
    const flagged = await make(true);
    const clean = await make(false);
    const { sb } = await signedInStaff('reviewer');
    const ids = (await listApplications(sb, { status: 'submitted', flaggedOnly: true })).map((a) => a.id);
    expect(ids).toContain(flagged);
    expect(ids).not.toContain(clean);
  });
});

describe('searchPractitioners', () => {
  it('treats names containing digits as a name search, not a phone search', async () => {
    const { userId } = await signedInUser();
    const name = `Applicant 4${Date.now().toString().slice(-5)}x`;
    await admin().from('practitioners').insert({ user_id: userId, display_name: name, status: 'submitted' });
    const { sb } = await signedInStaff('support');
    const rows = await searchPractitioners(sb, name);
    expect(rows.map((r) => r.display_name)).toContain(name);
  });
});

describe('uploads with raw bytes (React Native)', () => {
  it('uploadAvatar stores the provided ArrayBuffer body', async () => {
    const { sb, userId } = await signedInUser();
    const bytes = new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10, 1, 2, 3, 4]).buffer;
    const meta = { type: 'image/png', size: bytes.byteLength } as Blob;
    const { path } = await uploadAvatar(sb, meta, { body: bytes });
    expect(path.startsWith(`${userId}/`)).toBe(true);
    const { data } = await admin().storage.from('avatars').download(path);
    expect(data!.size).toBe(12);
  });
});

describe('application drafts (review fixes)', () => {
  it('a step-3 draft never deletes certificates the screen does not list', async () => {
    const { sb } = await signedInUser();
    const p = await startApplication(sb);
    const { data: doc } = await admin().from('practitioner_documents').insert({
      practitioner_id: p.id, kind: 'certificate', storage_path: `${p.id}/certificate/a.pdf`, file_name: 'a.pdf', mime_type: 'application/pdf', size_bytes: 1,
    }).select('id').single();
    await saveStep(sb, 3, { certificateIds: [], credentialsText: 'Typing…', links: [] }, { draft: true });
    const { data } = await admin().from('practitioner_documents').select('id').eq('id', doc!.id);
    expect(data).toHaveLength(1);
  });

  it('removeCertificate deletes exactly that certificate', async () => {
    const { sb } = await signedInUser();
    const p = await startApplication(sb);
    const { data: doc } = await admin().from('practitioner_documents').insert({
      practitioner_id: p.id, kind: 'certificate', storage_path: `${p.id}/certificate/b.pdf`, file_name: 'b.pdf', mime_type: 'application/pdf', size_bytes: 1,
    }).select('id').single();
    await removeCertificate(sb, doc!.id);
    expect((await admin().from('practitioner_documents').select('id').eq('id', doc!.id)).data).toHaveLength(0);
  });

  it('a draft with a not-yet-valid link still saves the other fields', async () => {
    const { sb } = await signedInUser();
    await startApplication(sb);
    await saveStep(sb, 3, { certificateIds: [], credentialsText: 'Reiki level 2', links: ['www.mysite.com'] }, { draft: true });
    const app = await getMyApplication(sb);
    expect(app.practitioner?.credentials_text).toBe('Reiki level 2');
  });

  it('a draft with 99 years of experience still saves the display name', async () => {
    const { sb } = await signedInUser();
    await startApplication(sb);
    await saveStep(sb, 1, { displayName: 'Asha', yearsExperience: 99 }, { draft: true });
    expect((await getMyApplication(sb)).practitioner?.display_name).toBe('Asha');
  });
});

describe('resumable upload path', () => {
  it('a resumed upload keeps the path it was started with', () => {
    const pid = '00000000-0000-4000-8000-000000000001';
    expect(chooseUploadPath([{ metadata: { objectName: `${pid}/video/old.mp4` } }], pid, 'video', `${pid}/video/new.mp4`)).toBe(`${pid}/video/old.mp4`);
    expect(chooseUploadPath([], pid, 'video', `${pid}/video/new.mp4`)).toBe(`${pid}/video/new.mp4`);
    expect(chooseUploadPath([{ metadata: { objectName: `other/video/x.mp4` } }], pid, 'video', `${pid}/video/new.mp4`)).toBe(`${pid}/video/new.mp4`);
  });
});
