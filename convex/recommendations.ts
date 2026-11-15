import { v } from "convex/values";

import type { Doc, Id } from "./_generated/dataModel";
import { internalMutation, mutation, query } from "./_generated/server";
import { destinationValidator, toDestination } from "./destinations";
import { requireUser } from "./lib/auth";
import { getHeader } from "./lib/lists";
import { scheduleRecompute, STALE_AFTER_MS } from "./lib/recommendations";
import { getVisit } from "./lib/visits";
import { toSummary, userSummaryValidator } from "./users";

const KEEP = 30;
const MIN_RESULTS = 12;
const MAX_PER_COUNTRY = 4;
const FRIENDS_CONSIDERED = 500;
const FRIEND_TOP = 5;
const FRIEND_SAVES = 10;
const SOURCES = 10;
const NEIGHBORS = 12;

type Reason = Doc<"recommendations">["reason"];
type Candidate = {
  topFriends: Id<"users">[];
  wantCount: number;
  similar: { weight: number; sourceId: Id<"destinations">; sourceRank: number; basis: "nearby" | "similar" } | null;
};

function scoreCandidate(candidate: Candidate): { score: number; reason: Reason } | null {
  const parts: { value: number; reason: Reason }[] = [];
  if (candidate.topFriends.length > 0) {
    parts.push({
      value: 0.5 + 0.25 * Math.min(candidate.topFriends.length, 4),
      reason: {
        kind: "friends_top",
        count: candidate.topFriends.length,
        friendIds: candidate.topFriends.slice(0, 3),
      },
    });
  }
  if (candidate.wantCount > 0) {
    parts.push({
      value: 0.2 + 0.1 * Math.min(candidate.wantCount, 5),
      reason: { kind: "friends_want", count: candidate.wantCount },
    });
  }
  if (candidate.similar) {
    const { weight, ...source } = candidate.similar;
    parts.push({ value: weight, reason: { kind: "similar_to", ...source } });
  }
  if (parts.length === 0) return null;
  parts.sort((a, b) => b.value - a.value);
  return { score: parts.reduce((sum, part) => sum + part.value, 0), reason: parts[0].reason };
}

export const recompute = internalMutation({
  args: { userId: v.id("users") },
  returns: v.null(),
  handler: async (ctx, args) => {
    const userId = args.userId;
    const [visits, saves, friendships, topRanked] = await Promise.all([
      ctx.db.query("visits").withIndex("by_userId_and_destinationId", (q) => q.eq("userId", userId)).take(1000),
      ctx.db.query("saves").withIndex("by_userId_and_destinationId", (q) => q.eq("userId", userId)).take(1000),
      ctx.db
        .query("friendships")
        .withIndex("by_userId_and_friendId", (q) => q.eq("userId", userId))
        .order("desc")
        .take(FRIENDS_CONSIDERED),
      ctx.db
        .query("rankings")
        .withIndex("by_userId_and_list_and_rank", (q) => q.eq("userId", userId).eq("list", "destinations"))
        .take(SOURCES),
    ]);
    const excluded = new Set<Id<"destinations">>([
      ...visits.map((visit) => visit.destinationId),
      ...saves.map((save) => save.destinationId),
    ]);

    const candidates = new Map<Id<"destinations">, Candidate>();
    const candidate = (destinationId: Id<"destinations">) => {
      let entry = candidates.get(destinationId);
      if (!entry) {
        entry = { topFriends: [], wantCount: 0, similar: null };
        candidates.set(destinationId, entry);
      }
      return entry;
    };

    await Promise.all(
      friendships.map(async ({ friendId }) => {
        const [top, wants] = await Promise.all([
          ctx.db
            .query("rankings")
            .withIndex("by_userId_and_list_and_rank", (q) => q.eq("userId", friendId).eq("list", "destinations"))
            .take(FRIEND_TOP),
          ctx.db
            .query("saves")
            .withIndex("by_userId_and_destinationId", (q) => q.eq("userId", friendId))
            .order("desc")
            .take(FRIEND_SAVES),
        ]);
        for (const row of top) candidate(row.itemId as Id<"destinations">).topFriends.push(friendId);
        for (const save of wants) candidate(save.destinationId).wantCount++;
      }),
    );

    for (const source of topRanked) {
      const sourceId = source.itemId as Id<"destinations">;
      const neighbors = await ctx.db
        .query("destinationNeighbors")
        .withIndex("by_destinationId_and_similarity", (q) => q.eq("destinationId", sourceId))
        .order("desc")
        .take(NEIGHBORS);
      for (const neighbor of neighbors) {
        const weight = neighbor.similarity / (1 + 0.15 * (source.rank - 1));
        const entry = candidate(neighbor.neighborId);
        if (entry.similar === null || weight > entry.similar.weight) {
          entry.similar = { weight, sourceId, sourceRank: source.rank, basis: neighbor.basis };
        }
      }
    }

    const scored = [...candidates]
      .filter(([destinationId]) => !excluded.has(destinationId))
      .map(([destinationId, entry]) => ({ destinationId, ...scoreCandidate(entry)! }))
      .sort((a, b) => b.score - a.score);

    const kept: { destinationId: Id<"destinations">; score: number; reason: Reason }[] = [];
    const perCountry = new Map<string, number>();
    const consider = async (row: (typeof kept)[number]) => {
      const destination = await ctx.db.get("destinations", row.destinationId);
      if (destination === null || destination.status !== "active") return;
      const used = perCountry.get(destination.countryCode) ?? 0;
      if (used >= MAX_PER_COUNTRY) return;
      perCountry.set(destination.countryCode, used + 1);
      kept.push(row);
    };
    for (const row of scored) {
      if (kept.length >= KEEP) break;
      await consider(row);
    }
    if (kept.length < MIN_RESULTS) {
      const popular = await ctx.db
        .query("destinations")
        .withIndex("by_status_and_tier_and_popularity", (q) => q.eq("status", "active").eq("tier", 1))
        .order("desc")
        .take(100);
      const taken = new Set(kept.map((row) => row.destinationId));
      for (const destination of popular) {
        if (kept.length >= MIN_RESULTS) break;
        if (excluded.has(destination._id) || taken.has(destination._id)) continue;
        await consider({
          destinationId: destination._id,
          score: destination.popularity * 0.1,
          reason: { kind: "popular" },
        });
      }
    }

    const existing = await ctx.db
      .query("recommendations")
      .withIndex("by_userId_and_score", (q) => q.eq("userId", userId))
      .take(200);
    for (const row of existing) await ctx.db.delete("recommendations", row._id);
    for (const row of kept) await ctx.db.insert("recommendations", { userId, ...row });

    const state = await ctx.db
      .query("recommendationState")
      .withIndex("by_userId", (q) => q.eq("userId", userId))
      .unique();
    if (state === null) {
      await ctx.db.insert("recommendationState", { userId, computedAt: Date.now(), pending: false });
    } else {
      await ctx.db.patch("recommendationState", state._id, { computedAt: Date.now(), pending: false });
    }
    return null;
  },
});

export const refresh = mutation({
  args: {},
  returns: v.boolean(),
  handler: async (ctx) => {
    const user = await requireUser(ctx);
    const state = await ctx.db
      .query("recommendationState")
      .withIndex("by_userId", (q) => q.eq("userId", user._id))
      .unique();
    const fresh = state?.computedAt !== undefined && state.computedAt > Date.now() - STALE_AFTER_MS;
    if (fresh) return false;
    return await scheduleRecompute(ctx, user._id, 0);
  },
});

export const forYou = query({
  args: {},
  returns: v.object({
    computedAt: v.union(v.number(), v.null()),
    basedOn: v.number(),
    items: v.array(
      v.object({
        destination: destinationValidator,
        score: v.number(),
        reason: v.union(
          v.object({
            kind: v.literal("friends_top"),
            count: v.number(),
            friends: v.array(userSummaryValidator),
          }),
          v.object({ kind: v.literal("friends_want"), count: v.number() }),
          v.object({
            kind: v.literal("similar_to"),
            source: destinationValidator,
            sourceRank: v.number(),
            basis: v.union(v.literal("nearby"), v.literal("similar")),
          }),
          v.object({ kind: v.literal("popular") }),
        ),
      }),
    ),
  }),
  handler: async (ctx) => {
    const user = await requireUser(ctx);
    const [rows, state, header] = await Promise.all([
      ctx.db
        .query("recommendations")
        .withIndex("by_userId_and_score", (q) => q.eq("userId", user._id))
        .order("desc")
        .take(KEEP),
      ctx.db
        .query("recommendationState")
        .withIndex("by_userId", (q) => q.eq("userId", user._id))
        .unique(),
      getHeader(ctx, user._id, "destinations"),
    ]);
    const items = [];
    for (const row of rows) {
      const [destination, visit, saved] = await Promise.all([
        ctx.db.get("destinations", row.destinationId),
        getVisit(ctx, user._id, row.destinationId),
        ctx.db
          .query("saves")
          .withIndex("by_userId_and_destinationId", (q) =>
            q.eq("userId", user._id).eq("destinationId", row.destinationId),
          )
          .unique(),
      ]);
      if (destination === null || destination.status !== "active" || visit !== null || saved !== null) continue;
      const base = { destination: toDestination(destination), score: row.score };
      const reason = row.reason;
      if (reason.kind === "friends_top") {
        const friends = await Promise.all(reason.friendIds.map((id) => ctx.db.get("users", id)));
        items.push({
          ...base,
          reason: {
            kind: reason.kind,
            count: reason.count,
            friends: friends.filter((f): f is Doc<"users"> => f !== null).map(toSummary),
          },
        });
      } else if (reason.kind === "similar_to") {
        const source = await ctx.db.get("destinations", reason.sourceId);
        if (source === null) continue;
        items.push({
          ...base,
          reason: {
            kind: reason.kind,
            source: toDestination(source),
            sourceRank: reason.sourceRank,
            basis: reason.basis,
          },
        });
      } else {
        items.push({ ...base, reason });
      }
    }
    return { computedAt: state?.computedAt ?? null, basedOn: header?.size ?? 0, items };
  },
});
