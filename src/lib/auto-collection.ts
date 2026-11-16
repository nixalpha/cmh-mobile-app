import type { ConvexReactClient } from 'convex/react';
import type { Id } from '@/lib/backend';

export type AutoCollectionStatus = { enabled: boolean; message: string };
export const autoCollectionSupported = false;
export async function autoCollectionStatus(): Promise<AutoCollectionStatus> {
  return { enabled: false, message: 'Automatic visits and photo uploads are available in the iOS app.' };
}
export async function enableAutoCollection(_client: ConvexReactClient, _userId: Id<'users'>): Promise<void> {}
export async function disableAutoCollection(_client?: ConvexReactClient): Promise<void> {}
export async function syncAutoCollection(_userId: Id<'users'>): Promise<void> {}
export function onAutoPhotoChange(_listener: () => void) { return { remove() {} }; }
