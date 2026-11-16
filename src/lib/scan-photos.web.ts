import type { ScanResult } from './scan-photos';

export type { ScannedSpot, ScanResult } from './scan-photos';
export const photoScanSupported = false;
export async function scanPhotos(): Promise<ScanResult> {
  return { status: 'denied' };
}
