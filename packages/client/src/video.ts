/**
 * Read a video's duration from its MP4/QuickTime container header (the `mvhd` box), without decoding
 * any frames, so it works for every codec and in browsers that can't play the file. Returns seconds,
 * or null when the file isn't an MP4/MOV container.
 */
export async function readVideoDuration(file: Blob): Promise<number | null> {
  const read = async (start: number, length: number) =>
    new DataView(await file.slice(start, Math.min(start + length, file.size)).arrayBuffer());
  let offset = 0;
  while (offset + 8 <= file.size) {
    const header = await read(offset, 16);
    let size = header.getUint32(0);
    const type = String.fromCharCode(header.getUint8(4), header.getUint8(5), header.getUint8(6), header.getUint8(7));
    let headerLen = 8;
    if (size === 1) {
      if (header.byteLength < 16) return null;
      size = Number(header.getBigUint64(8));
      headerLen = 16;
    } else if (size === 0) {
      size = file.size - offset;
    }
    if (size < headerLen || !/^[\x20-\x7e]{4}$/.test(type)) return null;
    if (type === 'moov') return durationFromMoov(await read(offset + headerLen, size - headerLen));
    offset += size;
  }
  return null;
}

function durationFromMoov(moov: DataView): number | null {
  let p = 0;
  while (p + 8 <= moov.byteLength) {
    const size = moov.getUint32(p);
    const type = String.fromCharCode(moov.getUint8(p + 4), moov.getUint8(p + 5), moov.getUint8(p + 6), moov.getUint8(p + 7));
    if (size < 8) return null;
    if (type === 'mvhd') {
      const version = moov.getUint8(p + 8);
      if (version === 1) {
        const timescale = moov.getUint32(p + 28);
        const duration = Number(moov.getBigUint64(p + 32));
        return timescale ? duration / timescale : null;
      }
      const timescale = moov.getUint32(p + 20);
      const duration = moov.getUint32(p + 24);
      return timescale ? duration / timescale : null;
    }
    p += size;
  }
  return null;
}

/** A minimal, valid-container MP4 of the given duration (no media samples). For tests and fixtures. */
export function makeTestMp4(seconds: number, opts: { moovLast?: boolean } = {}): Uint8Array {
  const box = (type: string, body: Uint8Array) => {
    const out = new Uint8Array(8 + body.length);
    const v = new DataView(out.buffer);
    v.setUint32(0, out.length);
    for (let i = 0; i < 4; i++) out[4 + i] = type.charCodeAt(i);
    out.set(body, 8);
    return out;
  };
  const ftyp = box('ftyp', new TextEncoder().encode('isom\0\0\x02\0isomiso2mp41'));
  const mvhdBody = new Uint8Array(100);
  const mv = new DataView(mvhdBody.buffer);
  mv.setUint32(12, 1000); // timescale
  mv.setUint32(16, Math.round(seconds * 1000)); // duration
  const moov = box('moov', box('mvhd', mvhdBody));
  const mdat = box('mdat', new Uint8Array(64));
  const parts = opts.moovLast ? [ftyp, mdat, moov] : [ftyp, moov, mdat];
  const out = new Uint8Array(parts.reduce((n, p) => n + p.length, 0));
  let o = 0;
  for (const p of parts) {
    out.set(p, o);
    o += p.length;
  }
  return out;
}
