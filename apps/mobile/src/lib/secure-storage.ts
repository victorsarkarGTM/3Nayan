import * as SecureStore from 'expo-secure-store';

/** SecureStore values are limited (~2 KB) and keys must be [A-Za-z0-9._-]; sessions are larger. */
const CHUNK = 1800;
const safe = (key: string) => key.replace(/[^\w.-]/g, '_');
const countKey = (key: string) => `${safe(key)}.n`;
const chunkKey = (key: string, i: number) => `${safe(key)}.${i}`;

async function clear(key: string) {
  const n = Number(await SecureStore.getItemAsync(countKey(key))) || 0;
  for (let i = 0; i < n; i++) await SecureStore.deleteItemAsync(chunkKey(key, i));
  await SecureStore.deleteItemAsync(countKey(key));
}

/** Storage adapter for supabase-js that splits values across SecureStore entries. */
export const ChunkedSecureStore = {
  async getItem(key: string): Promise<string | null> {
    const n = Number(await SecureStore.getItemAsync(countKey(key)));
    if (!n) return null;
    const parts: string[] = [];
    for (let i = 0; i < n; i++) {
      const part = await SecureStore.getItemAsync(chunkKey(key, i));
      if (part === null) return null;
      parts.push(part);
    }
    return parts.join('');
  },
  async setItem(key: string, value: string): Promise<void> {
    await clear(key);
    const n = Math.max(1, Math.ceil(value.length / CHUNK));
    for (let i = 0; i < n; i++) await SecureStore.setItemAsync(chunkKey(key, i), value.slice(i * CHUNK, (i + 1) * CHUNK));
    await SecureStore.setItemAsync(countKey(key), String(n));
  },
  async removeItem(key: string): Promise<void> {
    await clear(key);
  },
};
