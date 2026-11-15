import { SignJWT } from 'jose';
import { ProviderError } from '../errors.ts';
import type { HmsProvider, HmsRole } from './types.ts';

type Env = (k: string) => string | undefined;

/** 100ms: management token for the REST API, app token for joining a room. */
export class Hms100ms implements HmsProvider {
  constructor(private readonly env: Env) {}

  private async sign(claims: Record<string, unknown>, ttl: string): Promise<string> {
    const secret = new TextEncoder().encode(this.env('HMS_SECRET') ?? '');
    return await new SignJWT({ access_key: this.env('HMS_ACCESS_KEY'), version: 2, ...claims })
      .setProtectedHeader({ alg: 'HS256', typ: 'JWT' })
      .setIssuedAt()
      .setNotBefore('0s')
      .setJti(crypto.randomUUID())
      .setExpirationTime(ttl)
      .sign(secret);
  }

  async createRoom(name: string) {
    const token = await this.sign({ type: 'management' }, '10m');
    const res = await fetch('https://api.100ms.live/v2/rooms', {
      method: 'POST',
      headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json' },
      body: JSON.stringify({ name, template_id: this.env('HMS_TEMPLATE_ID') }),
      signal: AbortSignal.timeout(10_000),
    });
    const json = await res.json().catch(() => ({}));
    if (!res.ok || !json.id) throw new ProviderError(`100ms create room ${res.status}: ${json.message ?? ''}`);
    return { roomId: String(json.id) };
  }

  authToken(roomId: string, userId: string, role: HmsRole) {
    return this.sign({ type: 'app', room_id: roomId, user_id: userId, role }, '2h');
  }
}
