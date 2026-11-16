import { v } from "convex/values";

import type { Doc, Id } from "./_generated/dataModel";
import { internalMutation, mutation, query } from "./_generated/server";
import { destinationValidator, toDestination } from "./destinations";
import { requireUser } from "./lib/auth";
import { scheduleRecompute, STALE_AFTER_MS } from "./lib/recommendations";
import { ALGORITHM_VERSION, diversify, scoreDestination, visitWeight, type CandidateSignals, type VisitSource } from "./lib/recommendationScoring";
import { getVisit } from "./lib/visits";
import { toSummary, userSummaryValidator } from "./users";

const KEEP = 30;
const MAX_PER_COUNTRY = 4;
const FRIENDS_CONSIDERED = 100;
const FRIEND_TOP = 5;
const FRIEND_SAVES = 10;
const SOURCES = 40;
const NEIGHBORS = 12;
const CANDIDATE_POOL = 240;

export const recompute = internalMutation({
  args: { userId: v.id("users") },
  returns: v.null(),
  handler: async (ctx, args) => {
    const userId = args.userId;
    const now = Date.now();
    const [visits, saves, friendships, topRanked, popularByTier] = await Promise.all([
      ctx.db.query("visits").withIndex("by_userId", (q) => q.eq("userId", userId)).order("desc").take(1000),
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
      Promise.all([1, 2, 3].map((tier) => ctx.db.query("destinations")
        .withIndex("by_status_and_tier_and_popularity", (q) => q.eq("status", "active").eq("tier", tier))
        .order("desc").take(tier === 1 ? 80 : 30))),
    ]);
    const excluded = new Set<Id<"destinations">>([
      ...visits.map((visit) => visit.destinationId),
      ...saves.map((save) => save.destinationId),
    ]);
    const ranks = new Map(topRanked.map((r) => [r.itemId, r.rank]));
    // Also retain favorites outside the recent-history read window.
    const knownVisits = new Set(visits.map((visit) => visit.destinationId));
    const favoriteVisits = await Promise.all(topRanked.filter((r) => !knownVisits.has(r.itemId as Id<"destinations">))
      .map((r) => getVisit(ctx, userId, r.itemId as Id<"destinations">)));
    const sourceVisits = [...visits, ...favoriteVisits.filter((visit): visit is Doc<"visits"> => visit !== null)]
      .map((visit) => ({ visit, weight: visitWeight(visit, ranks.get(visit.destinationId), now) }))
      .sort((a, b) => b.weight - a.weight || b.visit._creationTime - a.visit._creationTime)
      .slice(0, SOURCES);
    const sourceDestinations = await Promise.all(sourceVisits.map(({ visit }) => ctx.db.get("destinations", visit.destinationId)));
    const sources: VisitSource[] = sourceDestinations.flatMap((destination, index) =>
      destination?.status === "active" ? [{ destination, weight: sourceVisits[index].weight }] : []);

    const candidates = new Map<Id<"destinations">, CandidateSignals>();
    const candidate = (destinationId: Id<"destinations">) => {
      let entry = candidates.get(destinationId);
      if (!entry) {
        entry = { topFriends: [], wantCount: 0, matches: [] };
        candidates.set(destinationId, entry);
      }
      return entry;
    };
    // Type-specific retrieval also finds less famous parks/islands that would
    // disappear behind cities in a global popularity list, even without edges.
    const byKind = await Promise.all([...new Set(sources.map((s) => s.destination.kind))].map((kind) =>
      ctx.db.query("destinations").withIndex("by_status_and_kind_and_popularity", (q) =>
        q.eq("status", "active").eq("kind", kind)).order("desc").take(30)));
    const popular = [...new Map([...popularByTier.flat(), ...byKind.flat()].map((d) => [d._id, d])).values()];
    for (const destination of popular) candidate(destination._id);

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
    // Neighbor similarities already incorporate landmark categories and distance.
    // Combine evidence from several visits instead of keeping only one match.
    await Promise.all(sources.map(async ({ destination, weight }) => {
      const neighbors = await ctx.db.query("destinationNeighbors")
        .withIndex("by_destinationId_and_similarity", (q) => q.eq("destinationId", destination._id))
        .order("desc").take(NEIGHBORS);
      const seen = new Set<Id<"destinations">>();
      for (const neighbor of neighbors) {
        if (seen.has(neighbor.neighborId)) continue;
        seen.add(neighbor.neighborId);
        candidate(neighbor.neighborId).matches.push({
          weight: Math.max(0, Math.min(1, neighbor.similarity)) * weight / 2.1,
          sourceId: destination._id,
          basis: neighbor.basis,
        });
      }
    }));

    // Bound hydration even for large social graphs; retain popular candidates so
    // diversity can still supply other countries when the top matches cluster.
    const priority = (entry: CandidateSignals) => entry.matches.reduce((sum, m) => sum + m.weight, 0)
      + 0.1 * Math.min(entry.topFriends.length, 4) + 0.03 * Math.min(entry.wantCount, 5);
    const pool = new Set([
      ...[...candidates].filter(([id]) => !excluded.has(id))
        .sort((a, b) => priority(b[1]) - priority(a[1]) || a[0].localeCompare(b[0]))
        .slice(0, CANDIDATE_POOL).map(([id]) => id),
      ...popular.map((d) => d._id),
    ]);
    const scored = (await Promise.all([...pool].filter((id) => !excluded.has(id)).map(async (destinationId) => {
      const [destination, visit, saved] = await Promise.all([
        ctx.db.get("destinations", destinationId),
        getVisit(ctx, userId, destinationId),
        ctx.db.query("saves").withIndex("by_userId_and_destinationId", (q) =>
          q.eq("userId", userId).eq("destinationId", destinationId)).unique(),
      ]);
      // Exact checks cover histories/saved lists larger than the bounded reads.
      if (destination?.status !== "active" || visit !== null || saved !== null) return [];
      return [scoreDestination(destination, candidates.get(destinationId)!, sources)];
    }))).flat();
    scored.sort((a, b) => b.score - a.score || a.destination._id.localeCompare(b.destination._id));
    const kept = diversify(scored, KEEP, MAX_PER_COUNTRY);

    const existing = await ctx.db
      .query("recommendations")
      .withIndex("by_userId_and_score", (q) => q.eq("userId", userId))
      .take(200);
    for (const row of existing) await ctx.db.delete("recommendations", row._id);
    for (const { destination, ...row } of kept) {
      await ctx.db.insert("recommendations", { userId, destinationId: destination._id, ...row });
    }

    const state = await ctx.db
      .query("recommendationState")
      .withIndex("by_userId", (q) => q.eq("userId", userId))
      .unique();
    if (state === null) {
      await ctx.db.insert("recommendationState", { userId, computedAt: now, pending: false, algorithmVersion: ALGORITHM_VERSION });
    } else {
      await ctx.db.patch("recommendationState", state._id, { computedAt: now, pending: false, algorithmVersion: ALGORITHM_VERSION });
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
    const fresh = state?.algorithmVersion === ALGORITHM_VERSION
      && state.computedAt !== undefined && state.computedAt > Date.now() - STALE_AFTER_MS;
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
            kind: v.literal("visited_similar"),
            source: destinationValidator,
            sourceCount: v.number(),
            basis: v.union(v.literal("nearby"), v.literal("similar")),
          }),
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
    const [rows, state] = await Promise.all([
      ctx.db
        .query("recommendations")
        .withIndex("by_userId_and_score", (q) => q.eq("userId", user._id))
        .order("desc")
        .take(KEEP),
      ctx.db
        .query("recommendationState")
        .withIndex("by_userId", (q) => q.eq("userId", user._id))
        .unique(),
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
      } else if (reason.kind === "visited_similar") {
        const [source, sourceVisit] = await Promise.all([
          ctx.db.get("destinations", reason.sourceId),
          getVisit(ctx, user._id, reason.sourceId),
        ]);
        if (source?.status !== "active" || sourceVisit === null) continue;
        items.push({
          ...base,
          reason: { kind: reason.kind, source: toDestination(source), sourceCount: reason.sourceCount, basis: reason.basis },
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
    return { computedAt: state?.computedAt ?? null, basedOn: user.visitCount ?? 0, items };
  },
});
