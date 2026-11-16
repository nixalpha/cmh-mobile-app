import type { Id } from '@/lib/backend';

export type LibraryPhoto = { id: string; uri: string; width: number; height: number; lat: number; lng: number; takenAt: number };
export type Near = { lat: number; lng: number; radiusKm: number };
export type PhotoPage = { checked: number; located: number; uris: string[] };
export const photoLibrarySupported = false;
export async function readLocatedPhotos(_options: { near?: Near; limit?: number; budgetMs?: number; onPage?: (page: PhotoPage) => void } = {}): Promise<LibraryPhoto[] | null> {
  return null;
}
export async function assetKey(_photo: { id: string }): Promise<string> {
  throw new Error('The photo library is available in the mobile app.');
}
export async function uploadLibraryPhoto(_photo: LibraryPhoto, _uploadUrl: string): Promise<{ storageId: Id<'_storage'>; width: number; height: number }> {
  throw new Error('The photo library is available in the mobile app.');
}
