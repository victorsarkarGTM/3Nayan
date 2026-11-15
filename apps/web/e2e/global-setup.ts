import { mkdirSync, writeFileSync } from 'node:fs';
import { makeTestMp4 } from '@3nayan/client';
import { TEST_PHONES, deleteUserByPhone } from './helpers';

const FIX = new URL('./.fixtures/', import.meta.url);
// 1x1 PNG
const PNG = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==', 'base64');

/** Fresh test-number accounts and generated fixture files for every run. */
export default async function globalSetup() {
  mkdirSync(FIX, { recursive: true });
  writeFileSync(new URL('photo.png', FIX), PNG);
  writeFileSync(new URL('cert.pdf', FIX), '%PDF-1.4\n1 0 obj<<>>endobj\ntrailer<<>>\n%%EOF\n');
  writeFileSync(new URL('intro-45s.mp4', FIX), makeTestMp4(45));
  writeFileSync(new URL('intro-20s.mp4', FIX), makeTestMp4(20));
  for (const phone of TEST_PHONES) await deleteUserByPhone(phone);
}
