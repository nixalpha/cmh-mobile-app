import type { Id } from "../_generated/dataModel";
import type { MutationCtx, QueryCtx } from "../_generated/server";

export const MAX_FRIENDS = 1000;

type Ctx = QueryCtx | MutationCtx;

export async function getFriendship(
  ctx: Ctx,
  userId: Id<"users">,
  friendId: Id<"users">,
) {
  return await ctx.db
    .query("friendships")
    .withIndex("by_userId_and_friendId", (q) =>
      q.eq("userId", userId).eq("friendId", friendId),
    )
    .unique();
}

export async function areFriends(
  ctx: Ctx,
  userId: Id<"users">,
  friendId: Id<"users">,
) {
  return (await getFriendship(ctx, userId, friendId)) !== null;
}

export async function getBlock(
  ctx: Ctx,
  blockerId: Id<"users">,
  blockedId: Id<"users">,
) {
  return await ctx.db
    .query("blocks")
    .withIndex("by_blockerId_and_blockedId", (q) =>
      q.eq("blockerId", blockerId).eq("blockedId", blockedId),
    )
    .unique();
}

export async function isBlockedEitherWay(
  ctx: Ctx,
  a: Id<"users">,
  b: Id<"users">,
) {
  const [ab, ba] = await Promise.all([getBlock(ctx, a, b), getBlock(ctx, b, a)]);
  return ab !== null || ba !== null;
}

export async function getRequest(
  ctx: Ctx,
  fromId: Id<"users">,
  toId: Id<"users">,
) {
  return await ctx.db
    .query("friendRequests")
    .withIndex("by_fromId_and_toId", (q) =>
      q.eq("fromId", fromId).eq("toId", toId),
    )
    .unique();
}

export type Relationship = "self" | "friends" | "outgoing" | "incoming" | "none";

export async function getRelationship(
  ctx: Ctx,
  viewerId: Id<"users">,
  otherId: Id<"users">,
): Promise<Relationship> {
  if (viewerId === otherId) return "self";
  if (await areFriends(ctx, viewerId, otherId)) return "friends";
  if ((await getRequest(ctx, viewerId, otherId)) !== null) return "outgoing";
  if ((await getRequest(ctx, otherId, viewerId)) !== null) return "incoming";
  return "none";
}
