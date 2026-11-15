import { AppError, fileRuleFor } from '@3nayan/shared';
import * as tus from 'tus-js-client';
import { check } from './functions.ts';
import type { Sb } from './types.ts';

const EXT: Record<string, string> = {
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'application/pdf': 'pdf',
  'video/mp4': 'mp4',
  'video/quicktime': 'mov',
};

function assertFile(kind: 'photo' | 'certificate' | 'video', file: Blob) {
  const rule = fileRuleFor(kind);
  if (!rule.mimes.includes(file.type)) {
    throw new AppError('validation_failed', [{ path: ['file'], message: 'This file type is not supported' }]);
  }
  if (file.size > rule.maxBytes) {
    const mb = Math.round(rule.maxBytes / 1_048_576);
    throw new AppError('validation_failed', [{ path: ['file'], message: `Files must be ${mb} MB or smaller` }]);
  }
}

/**
 * Upload options. `body` lets React Native pass the file's bytes (Supabase Storage uploads of RN Blobs
 * can arrive empty); `file` then only describes type and size. `tusSource` is the RN source for video.
 */
export type UploadOptions = { body?: ArrayBuffer; tusSource?: unknown };

/** Upload a profile photo to the public avatars bucket; returns its storage path. */
export async function uploadAvatar(sb: Sb, file: Blob, opts: UploadOptions = {}): Promise<{ path: string; publicUrl: string }> {
  assertFile('photo', file);
  const { data: u } = await sb.auth.getUser();
  if (!u.user) throw new AppError('unauthenticated');
  const path = `${u.user.id}/avatar-${crypto.randomUUID()}.${EXT[file.type]}`;
  check(await sb.storage.from('avatars').upload(path, opts.body ?? file, { contentType: file.type }));
  return { path, publicUrl: sb.storage.from('avatars').getPublicUrl(path).data.publicUrl };
}

export function avatarUrl(sb: Sb, path: string | null | undefined): string | null {
  return path ? sb.storage.from('avatars').getPublicUrl(path).data.publicUrl : null;
}

/**
 * A resumed TUS upload continues the object it was started with, so the stored path must be that
 * earlier object name (if it belongs to this practitioner and kind), not a freshly generated one.
 */
export function chooseUploadPath(
  previous: Array<{ metadata?: Record<string, string> }>,
  practitionerId: string,
  kind: 'certificate' | 'video',
  fresh: string,
): string {
  const earlier = previous[0]?.metadata?.objectName;
  return earlier && earlier.startsWith(`${practitionerId}/${kind}/`) ? earlier : fresh;
}

/**
 * Upload a certificate (standard upload + document row) or intro video (resumable TUS upload,
 * 6 MB chunks) to the private bucket. Validates type and size before any network call.
 */
export async function uploadPractitionerFile(
  sb: Sb,
  practitionerId: string,
  kind: 'certificate' | 'video',
  file: Blob,
  opts: UploadOptions & { fileName?: string; onProgress?: (pct: number) => void } = {},
): Promise<{ path: string; documentId?: string }> {
  assertFile(kind, file);
  let path = `${practitionerId}/${kind}/${crypto.randomUUID()}.${EXT[file.type]}`;
  if (kind === 'certificate') {
    check(await sb.storage.from('practitioner-private').upload(path, opts.body ?? file, { contentType: file.type }));
    const doc = check(
      await sb
        .from('practitioner_documents')
        .insert({
          practitioner_id: practitionerId,
          kind: 'certificate',
          storage_path: path,
          file_name: (opts.fileName ?? `certificate.${EXT[file.type]}`).slice(0, 255),
          mime_type: file.type,
          size_bytes: file.size,
        })
        .select('id')
        .single(),
    );
    opts.onProgress?.(100);
    return { path, documentId: doc.id };
  }
  const { data: s } = await sb.auth.getSession();
  const { supabaseUrl, supabaseKey } = sb as unknown as { supabaseUrl: string; supabaseKey: string };
  await new Promise<void>((resolve, reject) => {
    const upload = new tus.Upload((opts.tusSource as Blob | undefined) ?? file, {
      endpoint: `${supabaseUrl}/storage/v1/upload/resumable`,
      retryDelays: [0, 3000, 5000, 10000, 20000],
      headers: { authorization: `Bearer ${s.session?.access_token}`, apikey: supabaseKey, 'x-upsert': 'false' },
      uploadDataDuringCreation: true,
      removeFingerprintOnSuccess: true,
      chunkSize: 6 * 1024 * 1024,
      ...(opts.tusSource ? { uploadSize: file.size } : {}),
      metadata: { bucketName: 'practitioner-private', objectName: path, contentType: file.type, cacheControl: '3600' },
      onError: () => reject(new AppError('internal', undefined, 'The upload was interrupted. Please try again — it will resume where it stopped.')),
      onProgress: (sent, total) => opts.onProgress?.(Math.round((sent / total) * 100)),
      onSuccess: () => resolve(),
    });
    upload.findPreviousUploads().then((previous) => {
      const resumable = previous.filter((u) => chooseUploadPath([u], practitionerId, kind, '') !== '');
      if (resumable[0]) {
        path = chooseUploadPath(resumable, practitionerId, kind, path);
        upload.options.metadata = { ...upload.options.metadata, objectName: path };
        upload.resumeFromPreviousUpload(resumable[0]);
      }
      upload.start();
    });
  });
  return { path };
}
