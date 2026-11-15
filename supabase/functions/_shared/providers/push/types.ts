export type PushResult = { token: string; ok: boolean; error?: string };

export interface PushProvider {
  send(tokens: string[], title: string, body: string): Promise<PushResult[]>;
}
