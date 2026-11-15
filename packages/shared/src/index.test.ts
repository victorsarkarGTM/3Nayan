import { describe, expect, it } from 'vitest';
import { SHARED_VERSION } from './index.ts';

describe('shared package', () => {
  it('exports SHARED_VERSION', () => expect(SHARED_VERSION).toBe('1'));
});
