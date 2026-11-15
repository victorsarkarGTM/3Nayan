import type { HmsProvider, HmsRole } from './types.ts';

export class FakeHms implements HmsProvider {
  readonly rooms: string[] = [];
  async createRoom(name: string) {
    const roomId = `fake-room-${this.rooms.length + 1}-${name}`;
    this.rooms.push(roomId);
    return { roomId };
  }
  async authToken(roomId: string, userId: string, role: HmsRole) {
    return `fake-token.${roomId}.${userId}.${role}`;
  }
}
