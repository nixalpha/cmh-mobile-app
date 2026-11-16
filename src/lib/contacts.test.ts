import { describe, expect, test, vi } from 'vitest';

vi.mock('expo-crypto', () => ({ CryptoDigestAlgorithm: { SHA256: 'SHA-256' }, digestStringAsync: vi.fn() }));
const { phoneDigits } = await import('./contacts');

describe('phoneDigits', () => {
  test('matches the same number written different ways', () => {
    for (const raw of ['+1 (415) 555-0134', '415.555.0134', '1-415-555-0134', '4155550134']) {
      expect(phoneDigits(raw)).toBe('4155550134');
    }
  });
  test('drops too-short values', () => {
    expect(phoneDigits('911')).toBeNull();
    expect(phoneDigits('')).toBeNull();
  });
});
