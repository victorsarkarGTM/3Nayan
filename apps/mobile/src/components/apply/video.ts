import { LIMITS, fileRuleFor } from '@3nayan/shared';

/** Validate an expo-image-picker video asset (duration is in milliseconds). */
export function validatePickedVideo(asset: {
  duration: number | null | undefined;
  fileSize?: number;
  mimeType?: string;
}): { ok: true; seconds: number } | { ok: false; message: string } {
  const rule = fileRuleFor('video');
  if (asset.mimeType && !rule.mimes.includes(asset.mimeType)) return { ok: false, message: 'Upload an MP4 or MOV video' };
  if (asset.fileSize && asset.fileSize > rule.maxBytes) return { ok: false, message: 'Videos must be 100 MB or smaller' };
  if (asset.duration == null || !Number.isFinite(asset.duration))
    return { ok: false, message: 'We couldn’t read this video’s length. Please record it again.' };
  const seconds = Math.round(asset.duration / 100) / 10;
  if (seconds < LIMITS.videoMinSeconds || seconds > LIMITS.videoMaxSeconds)
    return { ok: false, message: `Video must be ${LIMITS.videoMinSeconds}–${LIMITS.videoMaxSeconds} seconds` };
  return { ok: true, seconds };
}
