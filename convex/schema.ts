import { defineSchema, defineTable } from "convex/server";
import { v } from "convex/values";

export default defineSchema({
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
