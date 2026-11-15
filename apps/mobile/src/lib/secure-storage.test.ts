/// <reference types="jest" />
import { ChunkedSecureStore } from './secure-storage';

const mockMemory = new Map<string, string>();
jest.mock('expo-secure-store', () => ({
  getItemAsync: jest.fn(async (k: string) => mockMemory.get(k) ?? null),
  setItemAsync: jest.fn(async (k: string, v: string) => void mockMemory.set(k, v)),
  deleteItemAsync: jest.fn(async (k: string) => void mockMemory.delete(k)),
}));

describe('ChunkedSecureStore', () => {
  beforeEach(() => mockMemory.clear());

  it('round-trips a 5,000-char value using chunks of at most 1,800 chars', async () => {
    const value = 'x'.repeat(4999) + 'y';
    await ChunkedSecureStore.setItem('sb-session', value);
    expect([...mockMemory.values()].every((v) => v.length <= 1800)).toBe(true);
    expect(mockMemory.size).toBeGreaterThan(2);
    expect(await ChunkedSecureStore.getItem('sb-session')).toBe(value);
  });

  it('removes all chunks', async () => {
    await ChunkedSecureStore.setItem('sb-session', 'z'.repeat(5000));
    await ChunkedSecureStore.removeItem('sb-session');
    expect(mockMemory.size).toBe(0);
    expect(await ChunkedSecureStore.getItem('sb-session')).toBeNull();
  });

  it('a shorter value overwrites a longer one without leftover chunks', async () => {
    await ChunkedSecureStore.setItem('k', 'a'.repeat(5000));
    await ChunkedSecureStore.setItem('k', 'short');
    expect(await ChunkedSecureStore.getItem('k')).toBe('short');
    expect(mockMemory.size).toBe(2); // count + one chunk
  });

  it('keys are made safe for SecureStore (letters, digits, . - _ only)', async () => {
    await ChunkedSecureStore.setItem('sb-abc-auth-token:v1', 'v');
    expect([...mockMemory.keys()].every((k) => /^[\w.-]+$/.test(k))).toBe(true);
  });
});
