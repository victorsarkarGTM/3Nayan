import type { PushProvider, PushResult } from './types.ts';

export class FakePush implements PushProvider {
  readonly sent: Array<{ tokens: string[]; title: string; body: string }> = [];
  readonly unregistered = new Set<string>();
  async send(tokens: string[], title: string, body: string): Promise<PushResult[]> {
    this.sent.push({ tokens, title, body });
    return tokens.map((token) =>
      this.unregistered.has(token) ? { token, ok: false, error: 'DeviceNotRegistered' } : { token, ok: true },
    );
  }
}
