import { describe, expect, it } from 'vitest';
import { AppError, USER_MESSAGES } from '../_shared/core/index.ts';
import { withHandler } from '../_shared/http.ts';
import { testDeps } from './helpers.ts';

const post = (body: unknown = {}) =>
  new Request('http://local/fn', { method: 'POST', body: JSON.stringify(body), headers: { 'content-type': 'application/json' } });
const deps = () => testDeps();

describe('withHandler', () => {
  it("maps AppError('conflict') to 409", async () => {
    const res = await withHandler(async () => {
      throw new AppError('conflict');
    }, deps)(post());
    expect(res.status).toBe(409);
    expect(await res.json()).toEqual({ ok: false, error: { code: 'conflict', message: USER_MESSAGES.conflict } });
  });
  it('maps thrown TypeError to 500 internal', async () => {
    const res = await withHandler(async () => {
      throw new TypeError('boom');
    }, deps)(post());
    expect(res.status).toBe(500);
    expect((await res.json()).error.code).toBe('internal');
  });
  it('GET → 400 validation_failed', async () => {
    const res = await withHandler(async () => ({}), deps)(new Request('http://local/fn'));
    expect(res.status).toBe(400);
    expect((await res.json()).error.code).toBe('validation_failed');
  });
  it('wraps success as { ok: true, data }', async () => {
    const res = await withHandler(async () => ({ a: 1 }), deps)(post());
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true, data: { a: 1 } });
  });
  it('answers CORS preflight', async () => {
    const res = await withHandler(async () => ({}), deps)(new Request('http://local/fn', { method: 'OPTIONS' }));
    expect(res.status).toBe(200);
    expect(res.headers.get('access-control-allow-origin')).toBe('*');
  });
});
