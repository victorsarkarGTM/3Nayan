/// <reference types="jest" />
import { validatePickedVideo } from './video';

describe('validatePickedVideo', () => {
  const ok = { duration: 45_000, fileSize: 10_000_000, mimeType: 'video/mp4' };
  it('accepts a 45 s MP4 under 100 MB', () => expect(validatePickedVideo(ok)).toEqual({ ok: true, seconds: 45 }));
  it("duration 29000 → 'Video must be 30–120 seconds'", () =>
    expect(validatePickedVideo({ ...ok, duration: 29_000 })).toEqual({ ok: false, message: 'Video must be 30–120 seconds' }));
  it('121 s is too long', () => expect(validatePickedVideo({ ...ok, duration: 121_000 }).ok).toBe(false));
  it('null duration asks to re-record', () =>
    expect(validatePickedVideo({ ...ok, duration: null })).toEqual({ ok: false, message: 'We couldn’t read this video’s length. Please record it again.' }));
  it('110 MB → size message', () =>
    expect(validatePickedVideo({ ...ok, fileSize: 110 * 1024 * 1024 })).toEqual({ ok: false, message: 'Videos must be 100 MB or smaller' }));
  it('QuickTime is accepted; other types are not', () => {
    expect(validatePickedVideo({ ...ok, mimeType: 'video/quicktime' }).ok).toBe(true);
    expect(validatePickedVideo({ ...ok, mimeType: 'video/webm' })).toEqual({ ok: false, message: 'Upload an MP4 or MOV video' });
  });
});
