'use client';

import { useState, type FormEvent } from 'react';
import { readVideoDuration, uploadPractitionerFile } from '@3nayan/client';
import { LIMITS, fileRuleFor } from '@3nayan/shared';
import { Card, Field } from '@/components/ui';
import { fieldErrors, messageFor } from '@/lib/errors';
import { supabase } from '@/lib/supabase';
import { StepActions } from './StepActions';
import type { StepProps } from './Wizard';

const DURATION_ERROR = `Video must be ${LIMITS.videoMinSeconds}–${LIMITS.videoMaxSeconds} seconds`;

/** Duration from the container header; falls back to the browser's player for other files. */
async function durationOf(file: File): Promise<number | null> {
  const fromHeader = await readVideoDuration(file);
  if (fromHeader !== null) return fromHeader;
  return new Promise((resolve) => {
    const v = document.createElement('video');
    v.preload = 'metadata';
    v.onloadedmetadata = () => (URL.revokeObjectURL(v.src), resolve(Number.isFinite(v.duration) ? v.duration : null));
    v.onerror = () => resolve(null);
    v.src = URL.createObjectURL(file);
  });
}

export function Step4({ ctx, onContinue }: StepProps) {
  const init = (ctx.app?.snapshot?.step4 ?? {}) as { videoPath?: string; videoDurationSeconds?: number; videoBytes?: number; videoMime?: string };
  const [video, setVideo] = useState(init.videoPath ? init : null);
  const [progress, setProgress] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function onFile(file?: File) {
    if (!file) return;
    setError(null);
    const rule = fileRuleFor('video');
    if (!rule.mimes.includes(file.type)) return setError('Upload an MP4 or MOV video');
    if (file.size > rule.maxBytes) return setError('Videos must be 100 MB or smaller');
    const seconds = await durationOf(file);
    if (seconds === null) return setError('We couldn’t read this video’s length. Please export it again as MP4 and retry.');
    if (seconds < LIMITS.videoMinSeconds || seconds > LIMITS.videoMaxSeconds) return setError(DURATION_ERROR);
    try {
      setProgress(0);
      const { path } = await uploadPractitionerFile(supabase(), ctx.app!.practitioner!.id, 'video', file, { onProgress: setProgress });
      const data = { videoPath: path, videoDurationSeconds: Math.round(seconds * 10) / 10, videoBytes: file.size, videoMime: file.type };
      setVideo(data);
      ctx.saveDraft(4, data);
    } catch (e) {
      setError(messageFor(e));
    } finally {
      setProgress(null);
    }
  }

  async function submit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await ctx.saveFull(4, video ?? {});
      onContinue();
    } catch (err) {
      setError(Object.keys(fieldErrors(err)).length ? 'Upload your introduction video to continue.' : messageFor(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <form onSubmit={submit} noValidate className="flex flex-col gap-5">
      <Card className="flex flex-col gap-4">
        <p className="text-sm text-muted">
          Record a short introduction: who you are, what you practise and how you help people. Our team watches every
          video; it isn’t public yet.
        </p>
        <Field label="Introduction video" hint={`MP4 or MOV, ${LIMITS.videoMinSeconds}–${LIMITS.videoMaxSeconds} seconds, up to 100 MB`}>
          {(id, d) => (
            <input id={id} aria-describedby={d} type="file" accept="video/mp4,video/quicktime" className="text-sm"
              disabled={progress !== null} onChange={(e) => onFile(e.target.files?.[0])} />
          )}
        </Field>
        {progress !== null && (
          <div>
            <div className="h-2 overflow-hidden rounded-full bg-canvas" role="progressbar" aria-valuenow={progress} aria-valuemin={0} aria-valuemax={100} aria-label="Upload progress">
              <div className="h-full bg-primary" style={{ width: `${progress}%` }} />
            </div>
            <p className="mt-1 text-xs text-muted">Uploading… {progress}%</p>
          </div>
        )}
        {video?.videoPath && progress === null && (
          <p className="text-sm text-success">Uploaded · {Math.round(video.videoDurationSeconds ?? 0)} seconds</p>
        )}
      </Card>
      <StepActions busy={busy} error={error} />
    </form>
  );
}
