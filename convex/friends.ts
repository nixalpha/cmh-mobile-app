import { paginationOptsValidator, paginationResultValidator } from "convex/server";
import { v } from "convex/values";

import { internal } from "./_generated/api";
import type { Doc, Id } from "./_generated/dataModel";
import { mutation, query, type MutationCtx } from "./_generated/server";
import { notify } from "./lib/activities";
import { requireUser } from "./lib/auth";
import { fail } from "./lib/errors";
import { clearLocationShares } from "./lib/friendLocations";
import { invalidateRecommendations } from "./lib/recommendations";
import {
  areFriends,
  getBlock,
  getFriendship,
  getRequest,
  isBlockedEitherWay,
  MAX_FRIENDS,
} from "./lib/social";
import { toSummary, userSummaryValidator } from "./users";

async function befriend(ctx: MutationCtx, a: Doc<"users">, b: Doc<"users">) {
  if (a.friendCount >= MAX_FRIENDS || b.friendCount >= MAX_FRIENDS) {
    fail("LIMIT_REACHED", `Friend lists are capped at ${MAX_FRIENDS}.`);
  }
  await ctx.db.insert("friendships", { userId: a._id, friendId: b._id });
  await ctx.db.insert("friendships", { userId: b._id, friendId: a._id });
  await ctx.db.patch("users", a._id, { friendCount: a.friendCount + 1 });
  await ctx.db.patch("users", b._id, { friendCount: b.friendCount + 1 });
  await invalidateRecommendations(ctx, a._id);
  await invalidateRecommendations(ctx, b._id);
  await ctx.scheduler.runAfter(0, internal.feed.backfill, { ownerId: a._id, actorId: b._id });
  await ctx.scheduler.runAfter(0, internal.feed.backfill, { ownerId: b._id, actorId: a._id });
}

async function unfriendPair(ctx: MutationCtx, a: Doc<"users">, bId: Id<"users">) {
  const [ab, ba] = await Promise.all([
    getFriendship(ctx, a._id, bId),
    getFriendship(ctx, bId, a._id),
  ]);
  await clearLocationShares(ctx, a._id, bId);
  if (ab === null || ba === null) return false;
  const b = await ctx.db.get("users", bId);
  await ctx.db.delete("friendships", ab._id);
  await ctx.db.delete("friendships", ba._id);
  await invalidateRecommendations(ctx, a._id);
  await invalidateRecommendations(ctx, bId);
  await ctx.db.patch("users", a._id, { friendCount: Math.max(0, a.friendCount - 1) });
  if (b !== null) {
    await ctx.db.patch("users", bId, { friendCount: Math.max(0, b.friendCount - 1) });
  }
  await ctx.scheduler.runAfter(0, internal.feed.unlink, { ownerId: a._id, actorId: bId });
  await ctx.scheduler.runAfter(0, internal.feed.unlink, { ownerId: bId, actorId: a._id });
  return true;
}

async function deleteRequestsBetween(ctx: MutationCtx, a: Id<"users">, b: Id<"users">) {
  const [ab, ba] = await Promise.all([getRequest(ctx, a, b), getRequest(ctx, b, a)]);
  if (ab !== null) await ctx.db.delete("friendRequests", ab._id);
  if (ba !== null) await ctx.db.delete("friendRequests", ba._id);
}

export const sendRequest = mutation({
  args: { userId: v.id("users") },
  returns: v.union(v.literal("requested"), v.literal("accepted")),
  handler: async (ctx, args) => {
    const viewer = await requireUser(ctx);
    if (args.userId === viewer._id) fail("INVALID", "You can't friend yourself.");
    const other = await ctx.db.get("users", args.userId);
    if (other === null || (await isBlockedEitherWay(ctx, viewer._id, other._id))) {
      fail("NOT_FOUND", "That person isn't available.");
    }
    if (await areFriends(ctx, viewer._id, other._id)) {
      fail("CONFLICT", "You're already friends.");
    }
    const incoming = await getRequest(ctx, other._id, viewer._id);
    if (incoming !== null) {
      await ctx.db.delete("friendRequests", incoming._id);
      await befriend(ctx, viewer, other);
      await notify(ctx, { userId: other._id, actorId: viewer._id, type: "friend_accepted" });
      return "accepted";
    }
    if ((await getRequest(ctx, viewer._id, other._id)) !== null) {
      fail("CONFLICT", "You've already sent a request.");
    }
    await ctx.db.insert("friendRequests", { fromId: viewer._id, toId: other._id });
    await notify(ctx, { userId: other._id, actorId: viewer._id, type: "friend_request" });
    return "requested";
  },
});

export const respondToRequest = mutation({
  args: { requestId: v.id("friendRequests"), accept: v.boolean() },
  returns: v.null(),
  handler: async (ctx, args) => {
    const viewer = await requireUser(ctx);
    const request = await ctx.db.get("friendRequests", args.requestId);
    if (request === null || request.toId !== viewer._id) {
      fail("NOT_FOUND", "That request doesn't exist.");
    }
    await ctx.db.delete("friendRequests", request._id);
    if (!args.accept) return null;
    const sender = await ctx.db.get("users", request.fromId);
    if (sender === null) fail("NOT_FOUND", "That person isn't available.");
    await befriend(ctx, viewer, sender);
    await notify(ctx, { userId: sender._id, actorId: viewer._id, type: "friend_accepted" });
    return null;
  },
});

export const cancelRequest = mutation({
  args: { requestId: v.id("friendRequests") },
  returns: v.null(),
  handler: async (ctx, args) => {
    const viewer = await requireUser(ctx);
    const request = await ctx.db.get("friendRequests", args.requestId);
    if (request === null || request.fromId !== viewer._id) {
      fail("NOT_FOUND", "That request doesn't exist.");
    }
    await ctx.db.delete("friendRequests", request._id);
    return null;
  },
});

export const unfriend = mutation({
  args: { userId: v.id("users") },
  returns: v.null(),
  handler: async (ctx, args) => {
    const viewer = await requireUser(ctx);
    if (!(await unfriendPair(ctx, viewer, args.userId))) {
      fail("NOT_FOUND", "You aren't friends.");
    }
    return null;
  },
});

export const block = mutation({
  args: { userId: v.id("users") },
  returns: v.null(),
  handler: async (ctx, args) => {
    const viewer = await requireUser(ctx);
    if (args.userId === viewer._id) fail("INVALID", "You can't block yourself.");
    if ((await ctx.db.get("users", args.userId)) === null) {
      fail("NOT_FOUND", "That person isn't available.");
    }
    if ((await getBlock(ctx, viewer._id, args.userId)) !== null) return null;
    await ctx.db.insert("blocks", { blockerId: viewer._id, blockedId: args.userId });
    await unfriendPair(ctx, viewer, args.userId);
    await deleteRequestsBetween(ctx, viewer._id, args.userId);
    return null;
  },
});

export const unblock = mutation({
  args: { userId: v.id("users") },
  returns: v.null(),
  handler: async (ctx, args) => {
    const viewer = await requireUser(ctx);
    const existing = await getBlock(ctx, viewer._id, args.userId);
    if (existing !== null) await ctx.db.delete("blocks", existing._id);
    return null;
  },
});

export const list = query({
  args: { userId: v.optional(v.id("users")), paginationOpts: paginationOptsValidator },
  returns: paginationResultValidator(userSummaryValidator),
  handler: async (ctx, args) => {
    const viewer = await requireUser(ctx);
    const ownerId = args.userId ?? viewer._id;
    if (ownerId !== viewer._id && !(await areFriends(ctx, viewer._id, ownerId))) {
      fail("FORBIDDEN", "Only friends can see this list.");
    }
    const result = await ctx.db
      .query("friendships")
      .withIndex("by_userId_and_friendId", (q) => q.eq("userId", ownerId))
      .paginate(args.paginationOpts);
    const page = [];
    for (const row of result.page) {
      const friend = await ctx.db.get("users", row.friendId);
      if (friend !== null) page.push(toSummary(friend));
    }
    return { ...result, page };
  },
});

const requestValidator = v.object({
  _id: v.id("friendRequests"),
  _creationTime: v.number(),
  user: userSummaryValidator,
});

export const incomingRequests = query({
  args: { paginationOpts: paginationOptsValidator },
  returns: paginationResultValidator(requestValidator),
  handler: async (ctx, args) => {
    const viewer = await requireUser(ctx);
    const result = await ctx.db
      .query("friendRequests")
      .withIndex("by_toId", (q) => q.eq("toId", viewer._id))
      .order("desc")
      .paginate(args.paginationOpts);
    const page = [];
    for (const row of result.page) {
      const sender = await ctx.db.get("users", row.fromId);
      if (sender === null) continue;
      page.push({ _id: row._id, _creationTime: row._creationTime, user: toSummary(sender) });
    }
    return { ...result, page };
  },
});

export const outgoingRequests = query({
  args: { paginationOpts: paginationOptsValidator },
  returns: paginationResultValidator(requestValidator),
  handler: async (ctx, args) => {
    const viewer = await requireUser(ctx);
    const result = await ctx.db
      .query("friendRequests")
      .withIndex("by_fromId_and_toId", (q) => q.eq("fromId", viewer._id))
      .order("desc")
      .paginate(args.paginationOpts);
    const page = [];
    for (const row of result.page) {
      const recipient = await ctx.db.get("users", row.toId);
      if (recipient === null) continue;
      page.push({ _id: row._id, _creationTime: row._creationTime, user: toSummary(recipient) });
    }
    return { ...result, page };
  },
});
