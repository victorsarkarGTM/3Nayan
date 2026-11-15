import { ProviderError } from '../errors.ts';
import type { PushProvider, PushResult } from './types.ts';

type Env = (k: string) => string | undefined;

/** Expo Push API. */
export class ExpoPush implements PushProvider {
  constructor(private readonly env: Env) {}
  async send(tokens: string[], title: string, body: string): Promise<PushResult[]> {
    if (!tokens.length) return [];
    const token = this.env('EXPO_ACCESS_TOKEN');
    const res = await fetch('https://exp.host/--/api/v2/push/send', {
      method: 'POST',
      headers: { 'content-type': 'application/json', ...(token ? { authorization: `Bearer ${token}` } : {}) },
      body: JSON.stringify(tokens.map((to) => ({ to, title, body, sound: 'default' }))),
      signal: AbortSignal.timeout(10_000),
    });
    if (!res.ok) throw new ProviderError(`expo push ${res.status}`);
    const json = (await res.json()) as { data: Array<{ status: string; details?: { error?: string }; message?: string }> };
    return tokens.map((t, i) => {
      const ticket = json.data[i];
      return ticket?.status === 'ok'
        ? { token: t, ok: true }
        : { token: t, ok: false, error: ticket?.details?.error ?? ticket?.message ?? 'unknown' };
    });
  }
}
