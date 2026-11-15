import { paginationOptsValidator, paginationResultValidator } from "convex/server";
import { v } from "convex/values";

import type { Doc, Id } from "./_generated/dataModel";
import { mutation, query, type QueryCtx } from "./_generated/server";
import { destinationValidator, landmarkValidator, toDestination, toLandmark } from "./destinations";
import { requireUser } from "./lib/auth";
import { fail } from "./lib/errors";
import {
  getHeader,
  getRanking,
  getRankingAt,
  placeRanking,
  removeRanking,
  type ItemId,
  type List,
} from "./lib/lists";
import { scoreForRank } from "./lib/ranking";
import { areFriends } from "./lib/social";
import { ensureVisit, getVisit } from "./lib/visits";
import { rankedList } from "./schema";

const itemId = v.union(v.id("destinations"), v.id("landmarks"));
const answers = v.array(
  v.object({
    opponentId: itemId,
    outcome: v.union(v.literal("new"), v.literal("existing"), v.literal("tie")),
  }),
);
const placement = v.object({ rank: v.number(), size: v.number(), score: v.number() });

async function requireRankable(ctx: QueryCtx, userId: Id<"users">, list: List, id: ItemId) {
  if (list === "destinations") {
    const destination = await ctx.db.get("destinations", id as Id<"destinations">);
    if (destination === null) fail("NOT_FOUND", "That place doesn't exist.");
    return { destination, landmark: null };
  }
  const landmark = await ctx.db.get("landmarks", id as Id<"landmarks">);
  if (landmark === null) fail("NOT_FOUND", "That landmark doesn't exist.");
  const unlocked = await ctx.db
    .query("landmarkUnlocks")
    .withIndex("by_userId_and_landmarkId", (q) => q.eq("userId", userId).eq("landmarkId", landmark._id))
    .unique();
  if (unlocked === null) fail("FORBIDDEN", "Unlock a landmark before ranking it.");
  return { destination: null, landmark };
}

export const place = mutation({
  args: {
    list: rankedList,
    itemId,
    answers,
    version: v.number(),
    visit: v.optional(v.object({ year: v.optional(v.number()), month: v.optional(v.number()) })),
  },
  returns: placement,
  handler: async (ctx, args) => {
    const user = await requireUser(ctx);
    const { destination } = await requireRankable(ctx, user._id, args.list, args.itemId);
    if ((await getRanking(ctx, user._id, args.list, args.itemId)) !== null) {
      fail("CONFLICT", "That's already in your list. Rank it again to move it.");
    }
    if (destination !== null) {
      if (args.visit === undefined && (await getVisit(ctx, user._id, destination._id)) === null) {
        fail("INVALID", "Say when you visited before ranking a place.");
      }
      await ensureVisit(ctx, user._id, destination, args.visit);
    }
    const placed = await placeRanking(ctx, user._id, args.list, args.itemId, args.answers, args.version);
    return { rank: placed.rank, size: placed.size, score: scoreForRank(placed.rank, placed.size) };
  },
});

export const rerank = mutation({
  args: { list: rankedList, itemId, answers, version: v.number() },
  returns: placement,
  handler: async (ctx, args) => {
    const user = await requireUser(ctx);
    const header = await getHeader(ctx, user._id, args.list);
    if ((header?.version ?? 0) !== args.version) {
      fail("LIST_CHANGED", "Your list changed. Start the ranking again.");
    }
    if (!(await removeRanking(ctx, user._id, args.list, args.itemId))) {
      fail("NOT_FOUND", "That isn't in your list.");
    }
    const placed = await placeRanking(ctx, user._id, args.list, args.itemId, args.answers, args.version + 1);
    return { rank: placed.rank, size: placed.size, score: scoreForRank(placed.rank, placed.size) };
  },
});

export const remove = mutation({
  args: { list: rankedList, itemId },
  returns: v.null(),
  handler: async (ctx, args) => {
    const user = await requireUser(ctx);
    if (!(await removeRanking(ctx, user._id, args.list, args.itemId))) {
      fail("NOT_FOUND", "That isn't in your list.");
    }
    return null;
  },
});

export const session = query({
  args: { list: rankedList },
  returns: v.object({ size: v.number(), version: v.number() }),
  handler: async (ctx, args) => {
    const user = await requireUser(ctx);
    const header = await getHeader(ctx, user._id, args.list);
    return { size: header?.size ?? 0, version: header?.version ?? 0 };
  },
});

const rankedItem = v.object({
  itemId,
  rank: v.number(),
  score: v.number(),
  destination: v.union(destinationValidator, v.null()),
  landmark: v.union(landmarkValidator, v.null()),
});

async function toRankedItem(ctx: QueryCtx, row: Doc<"rankings">, size: number) {
  const base = { itemId: row.itemId, rank: row.rank, score: scoreForRank(row.rank, size) };
  if (row.list === "destinations") {
    const destination = await ctx.db.get("destinations", row.itemId as Id<"destinations">);
    return { ...base, destination: destination && toDestination(destination), landmark: null };
  }
  const landmark = await ctx.db.get("landmarks", row.itemId as Id<"landmarks">);
  const destination = landmark && (await ctx.db.get("destinations", landmark.destinationId));
  return {
    ...base,
    destination: destination && toDestination(destination),
    landmark: landmark && toLandmark(landmark),
  };
}

export const opponents = query({
  args: { list: rankedList, ranks: v.array(v.number()) },
  returns: v.array(rankedItem),
  handler: async (ctx, args) => {
    const user = await requireUser(ctx);
    if (args.ranks.length > 16) fail("INVALID", "Ask for at most 16 ranks at a time.");
    const size = (await getHeader(ctx, user._id, args.list))?.size ?? 0;
    const items = [];
    for (const rank of args.ranks) {
      const row = await getRankingAt(ctx, user._id, args.list, rank);
      if (row !== null) items.push(await toRankedItem(ctx, row, size));
    }
    return items;
  },
});

export const list = query({
  args: { list: rankedList, userId: v.optional(v.id("users")), paginationOpts: paginationOptsValidator },
  returns: paginationResultValidator(rankedItem),
  handler: async (ctx, args) => {
    const viewer = await requireUser(ctx);
    const ownerId = args.userId ?? viewer._id;
    if (ownerId !== viewer._id && !(await areFriends(ctx, viewer._id, ownerId))) {
      fail("FORBIDDEN", "Only friends can see this list.");
    }
    const size = (await getHeader(ctx, ownerId, args.list))?.size ?? 0;
    const result = await ctx.db
      .query("rankings")
      .withIndex("by_userId_and_list_and_rank", (q) => q.eq("userId", ownerId).eq("list", args.list))
      .paginate(args.paginationOpts);
    const page = [];
    for (const row of result.page) page.push(await toRankedItem(ctx, row, size));
    return { ...result, page };
  },
});
