import { paginationOptsValidator, paginationResultValidator } from "convex/server";
import { v } from "convex/values";

import { internal } from "./_generated/api";
import type { Doc, Id } from "./_generated/dataModel";
import {
  internalMutation,
  mutation,
  query,
  type MutationCtx,
  type QueryCtx,
} from "./_generated/server";
import { destinationValidator, landmarkValidator, toDestination, toLandmark } from "./destinations";
import { notify } from "./lib/activities";
import { requireUser } from "./lib/auth";
import { fail } from "./lib/errors";
import { areFriends } from "./lib/social";
import { photoUrls, unlockPhotos } from "./lib/visits";
import { rankedList } from "./schema";
import { toSummary, userSummaryValidator } from "./users";

const BATCH = 200;
const BACKFILL = 20;
const MAX_COMMENT = 500;
const visibility = v.union(v.literal("friends"), v.literal("private"));

const postValidator = v.object({
  _id: v.id("activities"),
  postedAt: v.number(),
  type: v.union(v.literal("ranked"), v.literal("unlocked"), v.literal("saved")),
  actor: userSummaryValidator,
  destination: destinationValidator,
  landmark: v.union(landmarkValidator, v.null()),
  visibility,
  ranking: v.union(
    v.object({
      list: rankedList,
      rank: v.number(),
      listSize: v.number(),
      score: v.number(),
      beatName: v.union(v.string(), v.null()),
      note: v.union(v.string(), v.null()),
      showPair: v.boolean(),
    }),
    v.null(),
  ),
  unlock: v.union(v.object({ unlockedCount: v.number(), landmarkTotal: v.number() }), v.null()),
  visit: v.union(
    v.object({
      visitedOn: v.union(v.string(), v.null()),
      note: v.union(v.string(), v.null()),
      companions: v.array(userSummaryValidator),
      photos: v.array(v.object({ url: v.string(), width: v.number(), height: v.number() })),
      photoCount: v.number(),
    }),
    v.null(),
  ),
  likeCount: v.number(),
  commentCount: v.number(),
  likedByViewer: v.boolean(),
});

async function itemName(ctx: QueryCtx, list: Doc<"rankings">["list"], id: Doc<"rankings">["itemId"]) {
  const doc =
    list === "destinations"
      ? await ctx.db.get("destinations", id as Id<"destinations">)
      : await ctx.db.get("landmarks", id as Id<"landmarks">);
  return doc?.name ?? null;
}

const FEED_PHOTOS = 4;

async function visitDetails(ctx: QueryCtx, actorId: Id<"users">, landmarkId: Id<"landmarks">) {
  const unlock = await ctx.db
    .query("landmarkUnlocks")
    .withIndex("by_userId_and_landmarkId", (q) => q.eq("userId", actorId).eq("landmarkId", landmarkId))
    .unique();
  if (unlock === null) return null;
  const [all, companions] = await Promise.all([
    unlockPhotos(ctx, unlock._id),
    Promise.all((unlock.companionIds ?? []).map((id) => ctx.db.get("users", id))),
  ]);
  const shown = await photoUrls(ctx, unlock._id, FEED_PHOTOS);
  if (!unlock.note && !unlock.visitedOn && companions.length === 0 && all.length === 0) return null;
  return {
    visitedOn: unlock.visitedOn ?? null,
    note: unlock.note ?? null,
    companions: companions.filter((user): user is Doc<"users"> => user !== null).map(toSummary),
    photos: shown.map(({ url, width, height }) => ({ url, width, height })),
    photoCount: all.length,
  };
}

async function toPost(ctx: QueryCtx, viewerId: Id<"users">, activity: Doc<"activities">) {
  const [actor, destination, like] = await Promise.all([
    ctx.db.get("users", activity.actorId),
    ctx.db.get("destinations", activity.destinationId),
    ctx.db
      .query("likes")
      .withIndex("by_activityId_and_userId", (q) => q.eq("activityId", activity._id).eq("userId", viewerId))
      .unique(),
  ]);
  if (actor === null || destination === null) return null;
  const landmarkId =
    activity.type === "unlocked"
      ? activity.landmarkId
      : activity.type === "ranked" && activity.list === "landmarks"
        ? (activity.itemId as Id<"landmarks">)
        : null;
  const landmark = landmarkId && (await ctx.db.get("landmarks", landmarkId));
  return {
    _id: activity._id,
    postedAt: activity._creationTime,
    type: activity.type,
    actor: toSummary(actor),
    destination: toDestination(destination),
    landmark: landmark ? toLandmark(landmark) : null,
    visibility: activity.visibility,
    ranking:
      activity.type === "ranked"
        ? {
            list: activity.list,
            rank: activity.rank,
            listSize: activity.listSize,
            score: activity.score,
            beatName: activity.beatId ? await itemName(ctx, activity.list, activity.beatId) : null,
            note: activity.note ?? null,
            showPair: activity.showPair,
          }
        : null,
    unlock:
      activity.type === "unlocked"
        ? { unlockedCount: activity.unlockedCount, landmarkTotal: activity.landmarkTotal }
        : null,
    visit: activity.type === "unlocked" ? await visitDetails(ctx, activity.actorId, activity.landmarkId) : null,
    likeCount: activity.likeCount,
    commentCount: activity.commentCount,
    likedByViewer: like !== null,
  };
}

async function requireVisibleActivity(ctx: QueryCtx, viewerId: Id<"users">, activityId: Id<"activities">) {
  const activity = await ctx.db.get("activities", activityId);
  const visible =
    activity !== null &&
    (activity.actorId === viewerId ||
      (activity.visibility === "friends" && (await areFriends(ctx, viewerId, activity.actorId))));
  if (!visible) fail("NOT_FOUND", "That post isn't available.");
  return activity;
}

export const friends = query({
  args: { actorId: v.optional(v.id("users")), paginationOpts: paginationOptsValidator },
  returns: paginationResultValidator(postValidator),
  handler: async (ctx, args) => {
    const viewer = await requireUser(ctx);
    const actorId = args.actorId;
    const result = await (actorId
      ? ctx.db
          .query("feedItems")
          .withIndex("by_ownerId_and_actorId", (q) => q.eq("ownerId", viewer._id).eq("actorId", actorId))
      : ctx.db.query("feedItems").withIndex("by_ownerId_and_postedAt", (q) => q.eq("ownerId", viewer._id))
    )
      .order("desc")
      .paginate(args.paginationOpts);
    const page = [];
    for (const item of result.page) {
      const activity = await ctx.db.get("activities", item.activityId);
      if (activity === null || activity.visibility !== "friends") continue;
      if (!(await areFriends(ctx, viewer._id, activity.actorId))) continue;
      const post = await toPost(ctx, viewer._id, activity);
      if (post !== null) page.push(post);
    }
    return { ...result, page };
  },
});

export const byUser = query({
  args: { userId: v.optional(v.id("users")), paginationOpts: paginationOptsValidator },
  returns: paginationResultValidator(postValidator),
  handler: async (ctx, args) => {
    const viewer = await requireUser(ctx);
    const ownerId = args.userId ?? viewer._id;
    if (ownerId !== viewer._id && !(await areFriends(ctx, viewer._id, ownerId))) {
      fail("FORBIDDEN", "Only friends can see these posts.");
    }
    const result = await ctx.db
      .query("activities")
      .withIndex("by_actorId", (q) => q.eq("actorId", ownerId))
      .order("desc")
      .paginate(args.paginationOpts);
    const page = [];
    for (const activity of result.page) {
      if (ownerId !== viewer._id && activity.visibility !== "friends") continue;
      const post = await toPost(ctx, viewer._id, activity);
      if (post !== null) page.push(post);
    }
    return { ...result, page };
  },
});

export const setVisibility = mutation({
  args: { activityId: v.id("activities"), visibility },
  returns: v.null(),
  handler: async (ctx, args) => {
    const viewer = await requireUser(ctx);
    const activity = await ctx.db.get("activities", args.activityId);
    if (activity === null || activity.actorId !== viewer._id) {
      fail("NOT_FOUND", "That post isn't available.");
    }
    await ctx.db.patch("activities", activity._id, { visibility: args.visibility });
    return null;
  },
});

export const like = mutation({
  args: { activityId: v.id("activities") },
  returns: v.null(),
  handler: async (ctx, args) => {
    const viewer = await requireUser(ctx);
    const activity = await requireVisibleActivity(ctx, viewer._id, args.activityId);
    const existing = await ctx.db
      .query("likes")
      .withIndex("by_activityId_and_userId", (q) => q.eq("activityId", activity._id).eq("userId", viewer._id))
      .unique();
    if (existing !== null) return null;
    await ctx.db.insert("likes", { activityId: activity._id, userId: viewer._id });
    await ctx.db.patch("activities", activity._id, { likeCount: activity.likeCount + 1 });
    const notified = await ctx.db
      .query("notifications")
      .withIndex("by_activityId_and_actorId", (q) => q.eq("activityId", activity._id).eq("actorId", viewer._id))
      .take(10);
    if (!notified.some((n) => n.type === "like")) {
      await notify(ctx, { userId: activity.actorId, actorId: viewer._id, type: "like", activityId: activity._id });
    }
    return null;
  },
});

export const unlike = mutation({
  args: { activityId: v.id("activities") },
  returns: v.null(),
  handler: async (ctx, args) => {
    const viewer = await requireUser(ctx);
    const activity = await requireVisibleActivity(ctx, viewer._id, args.activityId);
    const existing = await ctx.db
      .query("likes")
      .withIndex("by_activityId_and_userId", (q) => q.eq("activityId", activity._id).eq("userId", viewer._id))
      .unique();
    if (existing === null) return null;
    await ctx.db.delete("likes", existing._id);
    await ctx.db.patch("activities", activity._id, { likeCount: Math.max(0, activity.likeCount - 1) });
    return null;
  },
});

export const comment = mutation({
  args: { activityId: v.id("activities"), body: v.string() },
  returns: v.id("comments"),
  handler: async (ctx, args) => {
    const viewer = await requireUser(ctx);
    const activity = await requireVisibleActivity(ctx, viewer._id, args.activityId);
    const body = args.body.trim();
    if (body.length === 0 || body.length > MAX_COMMENT) {
      fail("INVALID", `Comments are 1 to ${MAX_COMMENT} characters.`);
    }
    const commentId = await ctx.db.insert("comments", { activityId: activity._id, authorId: viewer._id, body });
    await ctx.db.patch("activities", activity._id, { commentCount: activity.commentCount + 1 });
    await notify(ctx, { userId: activity.actorId, actorId: viewer._id, type: "comment", activityId: activity._id });
    return commentId;
  },
});

export const deleteComment = mutation({
  args: { commentId: v.id("comments") },
  returns: v.null(),
  handler: async (ctx, args) => {
    const viewer = await requireUser(ctx);
    const existing = await ctx.db.get("comments", args.commentId);
    const activity = existing && (await ctx.db.get("activities", existing.activityId));
    if (existing === null || (existing.authorId !== viewer._id && activity?.actorId !== viewer._id)) {
      fail("NOT_FOUND", "That comment isn't available.");
    }
    await ctx.db.delete("comments", existing._id);
    if (activity) {
      await ctx.db.patch("activities", activity._id, { commentCount: Math.max(0, activity.commentCount - 1) });
    }
    return null;
  },
});

export const comments = query({
  args: { activityId: v.id("activities"), paginationOpts: paginationOptsValidator },
  returns: paginationResultValidator(
    v.object({
      _id: v.id("comments"),
      _creationTime: v.number(),
      author: userSummaryValidator,
      body: v.string(),
    }),
  ),
  handler: async (ctx, args) => {
    const viewer = await requireUser(ctx);
    const activity = await requireVisibleActivity(ctx, viewer._id, args.activityId);
    const result = await ctx.db
      .query("comments")
      .withIndex("by_activityId", (q) => q.eq("activityId", activity._id))
      .paginate(args.paginationOpts);
    const page = [];
    for (const row of result.page) {
      const author = await ctx.db.get("users", row.authorId);
      if (author === null) continue;
      page.push({ _id: row._id, _creationTime: row._creationTime, author: toSummary(author), body: row.body });
    }
    return { ...result, page };
  },
});

export const fanOut = internalMutation({
  args: { activityId: v.id("activities"), cursor: v.union(v.string(), v.null()) },
  returns: v.null(),
  handler: async (ctx, args) => {
    const activity = await ctx.db.get("activities", args.activityId);
    if (activity === null) return null;
    const result = await ctx.db
      .query("friendships")
      .withIndex("by_userId_and_friendId", (q) => q.eq("userId", activity.actorId))
      .paginate({ cursor: args.cursor, numItems: BATCH });
    for (const row of result.page) {
      const existing = await ctx.db
        .query("feedItems")
        .withIndex("by_activityId_and_ownerId", (q) =>
          q.eq("activityId", activity._id).eq("ownerId", row.friendId),
        )
        .unique();
      if (existing !== null) continue;
      await ctx.db.insert("feedItems", {
        ownerId: row.friendId,
        actorId: activity.actorId,
        activityId: activity._id,
        postedAt: activity._creationTime,
      });
    }
    if (!result.isDone) {
      await ctx.scheduler.runAfter(0, internal.feed.fanOut, {
        activityId: args.activityId,
        cursor: result.continueCursor,
      });
    }
    return null;
  },
});

async function clearPointers(ctx: MutationCtx, ownerId: Id<"users">, actorId: Id<"users">) {
  const items = await ctx.db
    .query("feedItems")
    .withIndex("by_ownerId_and_actorId", (q) => q.eq("ownerId", ownerId).eq("actorId", actorId))
    .take(BATCH);
  for (const item of items) await ctx.db.delete("feedItems", item._id);
  return items.length;
}

export const backfill = internalMutation({
  args: { ownerId: v.id("users"), actorId: v.id("users") },
  returns: v.null(),
  handler: async (ctx, args) => {
    if (!(await areFriends(ctx, args.ownerId, args.actorId))) return null;
    await clearPointers(ctx, args.ownerId, args.actorId);
    const recent = await ctx.db
      .query("activities")
      .withIndex("by_actorId", (q) => q.eq("actorId", args.actorId))
      .order("desc")
      .take(BACKFILL * 2);
    for (const activity of recent.filter((a) => a.visibility === "friends").slice(0, BACKFILL)) {
      await ctx.db.insert("feedItems", {
        ownerId: args.ownerId,
        actorId: args.actorId,
        activityId: activity._id,
        postedAt: activity._creationTime,
      });
    }
    return null;
  },
});

export const unlink = internalMutation({
  args: { ownerId: v.id("users"), actorId: v.id("users") },
  returns: v.null(),
  handler: async (ctx, args) => {
    if (await areFriends(ctx, args.ownerId, args.actorId)) return null;
    if ((await clearPointers(ctx, args.ownerId, args.actorId)) === BATCH) {
      await ctx.scheduler.runAfter(0, internal.feed.unlink, args);
    }
    return null;
  },
});

export const cleanUpActivity = internalMutation({
  args: { activityId: v.id("activities") },
  returns: v.null(),
  handler: async (ctx, args) => {
    const [items, likes, replies, notifications] = await Promise.all([
      ctx.db
        .query("feedItems")
        .withIndex("by_activityId_and_ownerId", (q) => q.eq("activityId", args.activityId))
        .take(BATCH),
      ctx.db.query("likes").withIndex("by_activityId_and_userId", (q) => q.eq("activityId", args.activityId)).take(BATCH),
      ctx.db.query("comments").withIndex("by_activityId", (q) => q.eq("activityId", args.activityId)).take(BATCH),
      ctx.db
        .query("notifications")
        .withIndex("by_activityId_and_actorId", (q) => q.eq("activityId", args.activityId))
        .take(BATCH),
    ]);
    for (const doc of items) await ctx.db.delete("feedItems", doc._id);
    for (const doc of likes) await ctx.db.delete("likes", doc._id);
    for (const doc of replies) await ctx.db.delete("comments", doc._id);
    for (const doc of notifications) await ctx.db.delete("notifications", doc._id);
    if ([items, likes, replies, notifications].some((docs) => docs.length === BATCH)) {
      await ctx.scheduler.runAfter(0, internal.feed.cleanUpActivity, args);
    }
    return null;
  },
});
