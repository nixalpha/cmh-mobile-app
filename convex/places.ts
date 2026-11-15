import { paginationOptsValidator, paginationResultValidator } from "convex/server";
import { v } from "convex/values";

import type { Doc, Id } from "./_generated/dataModel";
import { mutation, query, type QueryCtx } from "./_generated/server";
import { destinationValidator, landmarkValidator, toDestination, toLandmark } from "./destinations";
import { requireUser } from "./lib/auth";
import { fail } from "./lib/errors";
import { getHeader, getRanking } from "./lib/lists";
import { MIN_LIST_FOR_AVERAGES, scoreForRank } from "./lib/ranking";
import { areFriends, MAX_FRIENDS } from "./lib/social";
import { bumpUser, deleteUnlock, deleteVisit, ensureVisit, getVisit } from "./lib/visits";
import { verification } from "./schema";
import { toSummary, userSummaryValidator } from "./users";

async function friendIds(ctx: QueryCtx, userId: Id<"users">) {
  const rows = await ctx.db
    .query("friendships")
    .withIndex("by_userId_and_friendId", (q) => q.eq("userId", userId))
    .take(MAX_FRIENDS);
  return rows.map((row) => row.friendId);
}

async function requireDestination(ctx: QueryCtx, destinationId: Id<"destinations">) {
  const destination = await ctx.db.get("destinations", destinationId);
  if (destination === null) fail("NOT_FOUND", "That place doesn't exist.");
  return destination;
}

export const addVisit = mutation({
  args: {
    destinationId: v.id("destinations"),
    year: v.optional(v.number()),
    month: v.optional(v.number()),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const user = await requireUser(ctx);
    const destination = await requireDestination(ctx, args.destinationId);
    await ensureVisit(ctx, user._id, destination, { year: args.year, month: args.month });
    return null;
  },
});

export const removeVisit = mutation({
  args: { destinationId: v.id("destinations") },
  returns: v.null(),
  handler: async (ctx, args) => {
    const user = await requireUser(ctx);
    const visit = await getVisit(ctx, user._id, args.destinationId);
    if (visit === null) fail("NOT_FOUND", "You haven't added that place.");
    await deleteVisit(ctx, visit);
    return null;
  },
});

const visitValidator = v.object({
  destination: destinationValidator,
  year: v.union(v.number(), v.null()),
  month: v.union(v.number(), v.null()),
  source: verification,
  unlockCount: v.number(),
  rank: v.union(v.number(), v.null()),
  score: v.union(v.number(), v.null()),
});

export const visits = query({
  args: { userId: v.optional(v.id("users")), paginationOpts: paginationOptsValidator },
  returns: paginationResultValidator(visitValidator),
  handler: async (ctx, args) => {
    const viewer = await requireUser(ctx);
    const ownerId = args.userId ?? viewer._id;
    if (ownerId !== viewer._id && !(await areFriends(ctx, viewer._id, ownerId))) {
      fail("FORBIDDEN", "Only friends can see these places.");
    }
    const size = (await getHeader(ctx, ownerId, "destinations"))?.size ?? 0;
    const result = await ctx.db
      .query("visits")
      .withIndex("by_userId_and_destinationId", (q) => q.eq("userId", ownerId))
      .order("desc")
      .paginate(args.paginationOpts);
    const page = [];
    for (const visit of result.page) {
      const destination = await ctx.db.get("destinations", visit.destinationId);
      if (destination === null) continue;
      const ranking = await getRanking(ctx, ownerId, "destinations", visit.destinationId);
      page.push({
        destination: toDestination(destination),
        year: visit.year ?? null,
        month: visit.month ?? null,
        source: visit.source,
        unlockCount: visit.unlockCount,
        rank: ranking?.rank ?? null,
        score: ranking ? scoreForRank(ranking.rank, size) : null,
      });
    }
    return { ...result, page };
  },
});

export const save = mutation({
  args: { destinationId: v.id("destinations") },
  returns: v.null(),
  handler: async (ctx, args) => {
    const user = await requireUser(ctx);
    await requireDestination(ctx, args.destinationId);
    const existing = await ctx.db
      .query("saves")
      .withIndex("by_userId_and_destinationId", (q) =>
        q.eq("userId", user._id).eq("destinationId", args.destinationId),
      )
      .unique();
    if (existing === null) {
      await ctx.db.insert("saves", { userId: user._id, destinationId: args.destinationId });
    }
    return null;
  },
});

export const unsave = mutation({
  args: { destinationId: v.id("destinations") },
  returns: v.null(),
  handler: async (ctx, args) => {
    const user = await requireUser(ctx);
    const existing = await ctx.db
      .query("saves")
      .withIndex("by_userId_and_destinationId", (q) =>
        q.eq("userId", user._id).eq("destinationId", args.destinationId),
      )
      .unique();
    if (existing !== null) await ctx.db.delete("saves", existing._id);
    return null;
  },
});

export const saved = query({
  args: { paginationOpts: paginationOptsValidator },
  returns: paginationResultValidator(destinationValidator),
  handler: async (ctx, args) => {
    const user = await requireUser(ctx);
    const result = await ctx.db
      .query("saves")
      .withIndex("by_userId_and_destinationId", (q) => q.eq("userId", user._id))
      .order("desc")
      .paginate(args.paginationOpts);
    const page = [];
    for (const row of result.page) {
      const destination = await ctx.db.get("destinations", row.destinationId);
      if (destination !== null) page.push(toDestination(destination));
    }
    return { ...result, page };
  },
});

async function getUnlock(ctx: QueryCtx, userId: Id<"users">, landmarkId: Id<"landmarks">) {
  return await ctx.db
    .query("landmarkUnlocks")
    .withIndex("by_userId_and_landmarkId", (q) => q.eq("userId", userId).eq("landmarkId", landmarkId))
    .unique();
}

export const unlockLandmark = mutation({
  args: { landmarkId: v.id("landmarks") },
  returns: v.null(),
  handler: async (ctx, args) => {
    const user = await requireUser(ctx);
    const landmark = await ctx.db.get("landmarks", args.landmarkId);
    if (landmark === null) fail("NOT_FOUND", "That landmark doesn't exist.");
    const visit = await getVisit(ctx, user._id, landmark.destinationId);
    if (visit === null) fail("INVALID", "Add the place to your visits before unlocking its landmarks.");
    if ((await getUnlock(ctx, user._id, landmark._id)) !== null) return null;
    await ctx.db.insert("landmarkUnlocks", {
      userId: user._id,
      landmarkId: landmark._id,
      destinationId: landmark.destinationId,
      verification: "self_reported",
    });
    await ctx.db.patch("visits", visit._id, { unlockCount: visit.unlockCount + 1 });
    await bumpUser(ctx, user._id, "unlockCount", 1);
    return null;
  },
});

export const lockLandmark = mutation({
  args: { landmarkId: v.id("landmarks") },
  returns: v.null(),
  handler: async (ctx, args) => {
    const user = await requireUser(ctx);
    const unlock = await getUnlock(ctx, user._id, args.landmarkId);
    if (unlock === null) fail("NOT_FOUND", "You haven't unlocked that landmark.");
    await deleteUnlock(ctx, unlock);
    return null;
  },
});

export const destination = query({
  args: { destinationId: v.id("destinations") },
  returns: v.object({
    destination: destinationValidator,
    viewer: v.object({
      visit: v.union(
        v.object({
          year: v.union(v.number(), v.null()),
          month: v.union(v.number(), v.null()),
          source: verification,
          unlockCount: v.number(),
        }),
        v.null(),
      ),
      rank: v.union(v.number(), v.null()),
      listSize: v.number(),
      score: v.union(v.number(), v.null()),
      saved: v.boolean(),
    }),
    friends: v.object({
      visitedCount: v.number(),
      rankedCount: v.number(),
      averageScore: v.union(v.number(), v.null()),
      best: v.union(v.object({ user: userSummaryValidator, rank: v.number() }), v.null()),
      sample: v.array(userSummaryValidator),
    }),
  }),
  handler: async (ctx, args) => {
    const viewer = await requireUser(ctx);
    const place = await requireDestination(ctx, args.destinationId);
    const [visit, ranking, header, savedRow, friends] = await Promise.all([
      getVisit(ctx, viewer._id, place._id),
      getRanking(ctx, viewer._id, "destinations", place._id),
      getHeader(ctx, viewer._id, "destinations"),
      ctx.db
        .query("saves")
        .withIndex("by_userId_and_destinationId", (q) =>
          q.eq("userId", viewer._id).eq("destinationId", place._id),
        )
        .unique(),
      friendIds(ctx, viewer._id),
    ]);
    const listSize = header?.size ?? 0;

    const visited = (
      await Promise.all(
        friends.map(async (friendId) => ((await getVisit(ctx, friendId, place._id)) ? friendId : null)),
      )
    ).filter((id) => id !== null);
    const ranked = (
      await Promise.all(
        visited.map(async (friendId) => {
          const row = await getRanking(ctx, friendId, "destinations", place._id);
          if (row === null) return null;
          const size = (await getHeader(ctx, friendId, "destinations"))?.size ?? 0;
          return { friendId, rank: row.rank, size };
        }),
      )
    ).filter((row) => row !== null);
    const scored = ranked.filter((row) => row.size >= MIN_LIST_FOR_AVERAGES);
    const best = ranked.reduce<(typeof ranked)[number] | null>(
      (top, row) => (top === null || row.rank < top.rank ? row : top),
      null,
    );
    const summaries = async (ids: Id<"users">[]) => {
      const users = await Promise.all(ids.map((id) => ctx.db.get("users", id)));
      return users.filter((user): user is Doc<"users"> => user !== null).map(toSummary);
    };
    const [bestUser] = best ? await summaries([best.friendId]) : [];

    return {
      destination: toDestination(place),
      viewer: {
        visit: visit && {
          year: visit.year ?? null,
          month: visit.month ?? null,
          source: visit.source,
          unlockCount: visit.unlockCount,
        },
        rank: ranking?.rank ?? null,
        listSize,
        score: ranking ? scoreForRank(ranking.rank, listSize) : null,
        saved: savedRow !== null,
      },
      friends: {
        visitedCount: visited.length,
        rankedCount: ranked.length,
        averageScore:
          scored.length === 0
            ? null
            : Math.round(
                (scored.reduce((sum, row) => sum + scoreForRank(row.rank, row.size), 0) / scored.length) * 10,
              ) / 10,
        best: best && bestUser ? { user: bestUser, rank: best.rank } : null,
        sample: await summaries(visited.slice(0, 4)),
      },
    };
  },
});

export const landmarkProgress = query({
  args: { destinationId: v.id("destinations") },
  returns: v.array(
    v.object({
      landmark: landmarkValidator,
      unlocked: v.boolean(),
      verification: v.union(verification, v.null()),
      friendsUnlocked: v.number(),
    }),
  ),
  handler: async (ctx, args) => {
    const viewer = await requireUser(ctx);
    const place = await requireDestination(ctx, args.destinationId);
    const unlocksOf = async (userId: Id<"users">) =>
      await ctx.db
        .query("landmarkUnlocks")
        .withIndex("by_userId_and_destinationId", (q) =>
          q.eq("userId", userId).eq("destinationId", place._id),
        )
        .take(200);
    const [landmarks, mine, friends] = await Promise.all([
      ctx.db
        .query("landmarks")
        .withIndex("by_destinationId_and_status_and_order", (q) =>
          q.eq("destinationId", place._id).eq("status", "active"),
        )
        .take(50),
      unlocksOf(viewer._id),
      friendIds(ctx, viewer._id),
    ]);
    const friendCounts = new Map<Id<"landmarks">, number>();
    for (const unlocks of await Promise.all(friends.map(unlocksOf))) {
      for (const unlock of unlocks) {
        friendCounts.set(unlock.landmarkId, (friendCounts.get(unlock.landmarkId) ?? 0) + 1);
      }
    }
    const mineById = new Map(mine.map((unlock) => [unlock.landmarkId, unlock]));
    return landmarks.map((landmark) => ({
      landmark: toLandmark(landmark),
      unlocked: mineById.has(landmark._id),
      verification: mineById.get(landmark._id)?.verification ?? null,
      friendsUnlocked: friendCounts.get(landmark._id) ?? 0,
    }));
  },
});
