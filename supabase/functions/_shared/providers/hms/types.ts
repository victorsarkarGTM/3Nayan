export type HmsRole = 'reviewer' | 'applicant';

export interface HmsProvider {
  createRoom(name: string): Promise<{ roomId: string }>;
  authToken(roomId: string, userId: string, role: HmsRole): Promise<string>;
}
