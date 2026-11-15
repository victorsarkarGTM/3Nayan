import { describe, expect, it } from 'vitest';
import { makeTestMp4, readVideoDuration } from '../src/video.ts';

describe('readVideoDuration', () => {
  it('reads a 45 s MP4 header', async () => {
    expect(await readVideoDuration(new Blob([makeTestMp4(45)], { type: 'video/mp4' }))).toBe(45);
  });
  it('reads a header where moov comes after mdat', async () => {
    expect(await readVideoDuration(new Blob([makeTestMp4(90.5, { moovLast: true })], { type: 'video/mp4' }))).toBe(90.5);
  });
  it('returns null for a file that is not MP4/MOV', async () => {
    expect(await readVideoDuration(new Blob([new Uint8Array([1, 2, 3, 4, 5, 6, 7, 8, 9])]))).toBeNull();
  });
});
