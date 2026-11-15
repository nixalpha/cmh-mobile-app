import { ImageManipulator, SaveFormat } from 'expo-image-manipulator';
import type { ImagePickerAsset } from 'expo-image-picker';

import type { Id } from '@/lib/backend';
import { photoLocation, photoTakenAt, type TakenAt } from '@/lib/exif';

const MAX_EDGE = 2048;
const QUALITY = 0.8;

export type PreparedPhoto = {
  uri: string;
  width: number;
  height: number;
  takenAt: TakenAt | null;
  location: { lat: number; lng: number } | null;
};

/**
 * Reads the metadata the visit needs, then re-encodes the image as a resized JPEG.
 * Re-encoding drops every EXIF tag, so the uploaded file never carries GPS or device data.
 */
export async function preparePhoto(asset: ImagePickerAsset): Promise<PreparedPhoto> {
  const takenAt = photoTakenAt(asset.exif);
  const location = photoLocation(asset.exif);
  const context = ImageManipulator.manipulate(asset.uri);
  const longest = Math.max(asset.width, asset.height);
  if (longest > MAX_EDGE) {
    context.resize(asset.width >= asset.height ? { width: MAX_EDGE } : { height: MAX_EDGE });
  }
  const image = await context.renderAsync();
  const saved = await image.saveAsync({ format: SaveFormat.JPEG, compress: QUALITY });
  return { uri: saved.uri, width: saved.width, height: saved.height, takenAt, location };
}

export async function uploadPhoto(uploadUrl: string, uri: string): Promise<Id<'_storage'>> {
  const file = await (await fetch(uri)).blob();
  const response = await fetch(uploadUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'image/jpeg' },
    body: file,
  });
  if (!response.ok) throw new Error(`Upload failed (${response.status})`);
  const { storageId } = (await response.json()) as { storageId: Id<'_storage'> };
  return storageId;
}
