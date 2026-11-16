import type { ScanProgress, ScanResult } from './scan-photos';

export type { ScannedSpot, ScanProgress, ScanResult } from './scan-photos';
export const photoScanSupported = false;
export async function scanPhotos(_onProgress?: (progress: ScanProgress) => void, _onRead?: () => void): Promise<ScanResult> {
  return { status: 'denied' };
}
