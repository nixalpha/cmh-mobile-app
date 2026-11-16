import type { ConvexReactClient } from 'convex/react';
import { type Id } from '@/lib/backend';

export const friendBackgroundSupported = false;
export async function backgroundSharingActive(_userId?: Id<'users'>): Promise<boolean> { return false; }
export async function startFriendBackground(_client: ConvexReactClient, _userId: Id<'users'>): Promise<void> {
  throw new Error('Background sharing is available in the installed mobile app.');
}
export async function stopFriendBackground(_client?: ConvexReactClient): Promise<void> {}
