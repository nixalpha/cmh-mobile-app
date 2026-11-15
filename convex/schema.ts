import { defineSchema, defineTable } from "convex/server";
import { v } from "convex/values";

export const destinationKind = v.union(
  v.literal("city"),
  v.literal("region"),
  v.literal("island"),
  v.literal("park"),
  v.literal("site"),
);

const catalogStatus = v.union(v.literal("active"), v.literal("retired"));

export default defineSchema({
  destinations: defineTable({
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
    status: catalogStatus,
    importedAt: v.number(),
  })
    .index("by_wikidataId", ["wikidataId"])
    .index("by_status_and_tier_and_popularity", ["status", "tier", "popularity"])
    .index("by_status_and_importedAt", ["status", "importedAt"])
    .searchIndex("search_searchText", {
      searchField: "searchText",
      filterFields: ["status", "tier"],
    }),

  landmarks: defineTable({
    wikidataId: v.string(),
    destinationId: v.id("destinations"),
    name: v.string(),
    searchText: v.string(),
    category: v.string(),
    lat: v.number(),
    lng: v.number(),
    notability: v.number(),
    order: v.number(),
    status: catalogStatus,
    importedAt: v.number(),
  })
    .index("by_wikidataId", ["wikidataId"])
    .index("by_destinationId_and_status_and_order", ["destinationId", "status", "order"])
    .index("by_status_and_importedAt", ["status", "importedAt"])
    .searchIndex("search_searchText", {
      searchField: "searchText",
      filterFields: ["status"],
    }),

  destinationNeighbors: defineTable({
    destinationId: v.id("destinations"),
    neighborId: v.id("destinations"),
    similarity: v.number(),
    basis: v.union(v.literal("nearby"), v.literal("similar")),
  }).index("by_destinationId_and_similarity", ["destinationId", "similarity"]),

  users: defineTable({
    handle: v.optional(v.string()),
    displayName: v.optional(v.string()),
    bio: v.optional(v.string()),
    searchText: v.optional(v.string()),
    friendCount: v.number(),
  })
    .index("by_handle", ["handle"])
    .searchIndex("search_searchText", { searchField: "searchText" }),

  friendRequests: defineTable({
    fromId: v.id("users"),
    toId: v.id("users"),
  })
    .index("by_fromId_and_toId", ["fromId", "toId"])
    .index("by_toId", ["toId"]),

  friendships: defineTable({
    userId: v.id("users"),
    friendId: v.id("users"),
  }).index("by_userId_and_friendId", ["userId", "friendId"]),

  blocks: defineTable({
    blockerId: v.id("users"),
    blockedId: v.id("users"),
  }).index("by_blockerId_and_blockedId", ["blockerId", "blockedId"]),
});
