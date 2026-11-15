import { v } from "convex/values";

import type { Doc } from "./_generated/dataModel";
import { query } from "./_generated/server";
import { requireUser } from "./lib/auth";
import { fold } from "./lib/text";
import { destinationKind } from "./schema";

const MAX_RESULTS = 20;
const TIERS = [1, 2, 3];

export const destinationValidator = v.object({
  _id: v.id("destinations"),
  name: v.string(),
  kind: destinationKind,
  countryCode: v.string(),
  countryName: v.string(),
  admin1: v.union(v.string(), v.null()),
  lat: v.number(),
  lng: v.number(),
  tier: v.number(),
  landmarkCount: v.number(),
});

export const landmarkValidator = v.object({
  _id: v.id("landmarks"),
  destinationId: v.id("destinations"),
  name: v.string(),
  category: v.string(),
  lat: v.number(),
  lng: v.number(),
  order: v.number(),
});

export function toDestination(doc: Doc<"destinations">) {
  return {
    _id: doc._id,
    name: doc.name,
    kind: doc.kind,
    countryCode: doc.countryCode,
    countryName: doc.countryName,
    admin1: doc.admin1 ?? null,
    lat: doc.lat,
    lng: doc.lng,
    tier: doc.tier,
    landmarkCount: doc.landmarkCount,
  };
}

export function toLandmark(doc: Doc<"landmarks">) {
  return {
    _id: doc._id,
    destinationId: doc.destinationId,
    name: doc.name,
    category: doc.category,
    lat: doc.lat,
    lng: doc.lng,
    order: doc.order,
  };
}

export const search = query({
  args: { query: v.string(), limit: v.optional(v.number()) },
  returns: v.array(destinationValidator),
  handler: async (ctx, args) => {
    await requireUser(ctx);
    const text = fold(args.query);
    if (text.length === 0) return [];
    const limit = Math.max(1, Math.min(args.limit ?? 10, MAX_RESULTS));
    const results: Doc<"destinations">[] = [];
    for (const tier of TIERS) {
      if (results.length >= limit) break;
      const matches = await ctx.db
        .query("destinations")
        .withSearchIndex("search_searchText", (q) =>
          q.search("searchText", text).eq("status", "active").eq("tier", tier),
        )
        .take(MAX_RESULTS);
      const startsWith = (doc: Doc<"destinations">) => (fold(doc.name).startsWith(text) ? 0 : 1);
      matches.sort((a, b) => startsWith(a) - startsWith(b) || b.popularity - a.popularity);
      results.push(...matches);
    }
    return results.slice(0, limit).map(toDestination);
  },
});

export const popular = query({
  args: { limit: v.optional(v.number()) },
  returns: v.array(destinationValidator),
  handler: async (ctx, args) => {
    await requireUser(ctx);
    const docs = await ctx.db
      .query("destinations")
      .withIndex("by_status_and_tier_and_popularity", (q) => q.eq("status", "active").eq("tier", 1))
      .order("desc")
      .take(Math.max(1, Math.min(args.limit ?? 20, 50)));
    return docs.map(toDestination);
  },
});

export const get = query({
  args: { destinationId: v.id("destinations") },
  returns: v.union(
    v.object({ destination: destinationValidator, landmarks: v.array(landmarkValidator) }),
    v.null(),
  ),
  handler: async (ctx, args) => {
    await requireUser(ctx);
    const destination = await ctx.db.get("destinations", args.destinationId);
    if (destination === null) return null;
    const landmarks = await ctx.db
      .query("landmarks")
      .withIndex("by_destinationId_and_status_and_order", (q) =>
        q.eq("destinationId", destination._id).eq("status", "active"),
      )
      .take(50);
    return { destination: toDestination(destination), landmarks: landmarks.map(toLandmark) };
  },
});
