import { v } from "convex/values";

import type { Id } from "./_generated/dataModel";
import { internalMutation } from "./_generated/server";
import { destinationImage, destinationKind } from "./schema";

const RETIRE_BATCH = 500;

export const upsertDestinations = internalMutation({
  args: {
    importedAt: v.number(),
    rows: v.array(
      v.object({
        wikidataId: v.string(),
        geonamesId: v.optional(v.number()),
        kind: destinationKind,
        name: v.string(),
        searchText: v.string(),
        countryCode: v.string(),
        countryName: v.string(),
        admin1: v.optional(v.string()),
        lat: v.number(),
        lng: v.number(),
        population: v.optional(v.number()),
        popularity: v.number(),
        tier: v.number(),
        landmarkCount: v.number(),
        image: v.optional(destinationImage),
      }),
    ),
  },
  returns: v.object({ inserted: v.number(), updated: v.number() }),
  handler: async (ctx, args) => {
    let inserted = 0;
    let updated = 0;
    for (const row of args.rows) {
      const doc = { ...row, status: "active" as const, importedAt: args.importedAt };
      const existing = await ctx.db
        .query("destinations")
        .withIndex("by_wikidataId", (q) => q.eq("wikidataId", row.wikidataId))
        .unique();
      if (existing === null) {
        await ctx.db.insert("destinations", doc);
        inserted++;
      } else {
        await ctx.db.replace("destinations", existing._id, doc);
        updated++;
      }
    }
    return { inserted, updated };
  },
});

export const upsertLandmarks = internalMutation({
  args: {
    importedAt: v.number(),
    rows: v.array(
      v.object({
        wikidataId: v.string(),
        destinationWikidataId: v.string(),
        name: v.string(),
        searchText: v.string(),
        category: v.string(),
        lat: v.number(),
        lng: v.number(),
        notability: v.number(),
        order: v.number(),
      }),
    ),
  },
  returns: v.object({ inserted: v.number(), updated: v.number(), skipped: v.number() }),
  handler: async (ctx, args) => {
    let inserted = 0;
    let updated = 0;
    let skipped = 0;
    const destinationIds = new Map<string, Id<"destinations"> | null>();
    for (const { destinationWikidataId, ...row } of args.rows) {
      if (!destinationIds.has(destinationWikidataId)) {
        const destination = await ctx.db
          .query("destinations")
          .withIndex("by_wikidataId", (q) => q.eq("wikidataId", destinationWikidataId))
          .unique();
        destinationIds.set(destinationWikidataId, destination?._id ?? null);
      }
      const destinationId = destinationIds.get(destinationWikidataId);
      if (!destinationId) {
        skipped++;
        continue;
      }
      const doc = { ...row, destinationId, status: "active" as const, importedAt: args.importedAt };
      const existing = await ctx.db
        .query("landmarks")
        .withIndex("by_wikidataId", (q) => q.eq("wikidataId", row.wikidataId))
        .unique();
      if (existing === null) {
        await ctx.db.insert("landmarks", doc);
        inserted++;
      } else {
        await ctx.db.replace("landmarks", existing._id, doc);
        updated++;
      }
    }
    return { inserted, updated, skipped };
  },
});

export const replaceNeighbors = internalMutation({
  args: {
    rows: v.array(
      v.object({
        destinationWikidataId: v.string(),
        neighbors: v.array(
          v.object({
            wikidataId: v.string(),
            similarity: v.number(),
            basis: v.union(v.literal("nearby"), v.literal("similar")),
          }),
        ),
      }),
    ),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const lookup = async (wikidataId: string) =>
      await ctx.db
        .query("destinations")
        .withIndex("by_wikidataId", (q) => q.eq("wikidataId", wikidataId))
        .unique();
    for (const row of args.rows) {
      const destination = await lookup(row.destinationWikidataId);
      if (destination === null) continue;
      const existing = await ctx.db
        .query("destinationNeighbors")
        .withIndex("by_destinationId_and_similarity", (q) => q.eq("destinationId", destination._id))
        .take(100);
      for (const doc of existing) await ctx.db.delete("destinationNeighbors", doc._id);
      for (const neighbor of row.neighbors) {
        const target = await lookup(neighbor.wikidataId);
        if (target === null) continue;
        await ctx.db.insert("destinationNeighbors", {
          destinationId: destination._id,
          neighborId: target._id,
          similarity: neighbor.similarity,
          basis: neighbor.basis,
        });
      }
    }
    return null;
  },
});

export const retireStale = internalMutation({
  args: {
    table: v.union(v.literal("destinations"), v.literal("landmarks")),
    importedBefore: v.number(),
  },
  returns: v.object({ retired: v.number(), done: v.boolean() }),
  handler: async (ctx, args) => {
    const stale = await ctx.db
      .query(args.table)
      .withIndex("by_status_and_importedAt", (q) =>
        q.eq("status", "active").lt("importedAt", args.importedBefore),
      )
      .take(RETIRE_BATCH);
    for (const doc of stale) {
      await ctx.db.patch(args.table, doc._id, { status: "retired" });
    }
    return { retired: stale.length, done: stale.length < RETIRE_BATCH };
  },
});
