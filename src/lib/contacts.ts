import { CryptoDigestAlgorithm, digestStringAsync } from 'expo-crypto';

/** The last 10 digits of a phone number, which ignores country-code and trunk-prefix differences. */
export function phoneDigits(raw: string) {
  const digits = raw.replace(/\D/g, '');
  return digits.length >= 7 ? digits.slice(-10) : null;
}

/** A hashed phone key. Raw numbers never leave the device. */
export async function phoneKey(raw: string) {
  const digits = phoneDigits(raw);
  return digits ? digestStringAsync(CryptoDigestAlgorithm.SHA256, `travi:${digits}`) : null;
}
