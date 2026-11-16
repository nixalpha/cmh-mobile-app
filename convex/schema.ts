import { defineSchema, defineTable } from "convex/server";
import { v } from "convex/values";

export const destinationKind = v.union(
  v.literal("city"),
  v.literal("region"),
  v.literal("island"),
  v.literal("park"),
  v.literal("site"),
);

export const rankedList = v.union(v.literal("destinations"), v.literal("landmarks"));

export const verification = v.union(
  v.literal("self_reported"),
  v.literal("photo"),
  v.literal("check_in"),
);

export const destinationImage = v.object({
  url: v.string(),
  width: v.number(),
  height: v.number(),
  credit: v.string(),
  license: v.string(),
  sourceUrl: v.string(),
});

const itemId = v.union(v.id("destinations"), v.id("landmarks"));

const activityBase = {
  actorId: v.id("users"),
  destinationId: v.id("destinations"),
  visibility: v.union(v.literal("friends"), v.literal("private")),
  likeCount: v.number(),
  commentCount: v.number(),
};

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
    image: v.optional(destinationImage),
    status: catalogStatus,
    importedAt: v.number(),
  })
    .index("by_wikidataId", ["wikidataId"])
    .index("by_status_and_tier_and_popularity", ["status", "tier", "popularity"])
    .index("by_status_and_kind_and_popularity", ["status", "kind", "popularity"])
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
    .index("by_status_and_lat", ["status", "lat"])
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
    visitCount: v.optional(v.number()),
    unlockCount: v.optional(v.number()),
    countryCount: v.optional(v.number()),
  })
    .index("by_handle", ["handle"])
    .searchIndex("search_searchText", { searchField: "searchText" }),

  visits: defineTable({
    userId: v.id("users"),
    destinationId: v.id("destinations"),
    countryCode: v.string(),
    year: v.optional(v.number()),
    month: v.optional(v.number()),
    source: verification,
    unlockCount: v.number(),
  })
    .index("by_userId", ["userId"])
    .index("by_userId_and_destinationId", ["userId", "destinationId"])
    .index("by_userId_and_countryCode", ["userId", "countryCode"]),

  landmarkUnlocks: defineTable({
    userId: v.id("users"),
    landmarkId: v.id("landmarks"),
    destinationId: v.id("destinations"),
    verification,
    visitedOn: v.optional(v.string()),
    note: v.optional(v.string()),
    companionIds: v.optional(v.array(v.id("users"))),
  })
    .index("by_userId_and_destinationId", ["userId", "destinationId"])
    .index("by_userId_and_landmarkId", ["userId", "landmarkId"]),

  landmarkPhotos: defineTable({
    userId: v.id("users"),
    unlockId: v.id("landmarkUnlocks"),
    landmarkId: v.id("landmarks"),
    destinationId: v.id("destinations"),
    storageId: v.id("_storage"),
    width: v.number(),
    height: v.number(),
    takenAt: v.optional(v.number()),
    order: v.number(),
  })
    .index("by_unlockId_and_order", ["unlockId", "order"])
    .index("by_storageId", ["storageId"]),

  saves: defineTable({
    userId: v.id("users"),
    destinationId: v.id("destinations"),
  }).index("by_userId_and_destinationId", ["userId", "destinationId"]),

  rankedLists: defineTable({
    userId: v.id("users"),
    list: rankedList,
    size: v.number(),
    version: v.number(),
  }).index("by_userId_and_list", ["userId", "list"]),

  rankings: defineTable({
    userId: v.id("users"),
    list: rankedList,
    itemId,
    rank: v.number(),
  })
    .index("by_userId_and_list_and_rank", ["userId", "list", "rank"])
    .index("by_userId_and_list_and_itemId", ["userId", "list", "itemId"]),

  comparisons: defineTable({
    userId: v.id("users"),
    list: rankedList,
    itemId,
    opponentId: itemId,
    outcome: v.union(v.literal("new"), v.literal("existing"), v.literal("tie")),
  }).index("by_userId_and_list", ["userId", "list"]),

  activities: defineTable(
    v.union(
      v.object({
        ...activityBase,
        type: v.literal("ranked"),
        list: rankedList,
        itemId,
        rank: v.number(),
        listSize: v.number(),
        score: v.number(),
        beatId: v.optional(itemId),
        note: v.optional(v.string()),
        showPair: v.boolean(),
      }),
      v.object({
        ...activityBase,
        type: v.literal("unlocked"),
        landmarkId: v.id("landmarks"),
        unlockedCount: v.number(),
        landmarkTotal: v.number(),
      }),
      v.object({ ...activityBase, type: v.literal("saved") }),
    ),
  )
    .index("by_actorId", ["actorId"])
    .index("by_actorId_and_destinationId", ["actorId", "destinationId"]),

  feedItems: defineTable({
    ownerId: v.id("users"),
    actorId: v.id("users"),
    activityId: v.id("activities"),
    postedAt: v.number(),
  })
    .index("by_ownerId_and_postedAt", ["ownerId", "postedAt"])
    .index("by_ownerId_and_actorId", ["ownerId", "actorId"])
    .index("by_ownerId_and_actorId_and_postedAt", ["ownerId", "actorId", "postedAt"])
    .index("by_activityId_and_ownerId", ["activityId", "ownerId"]),

  likes: defineTable({
    activityId: v.id("activities"),
    userId: v.id("users"),
  }).index("by_activityId_and_userId", ["activityId", "userId"]),

  comments: defineTable({
    activityId: v.id("activities"),
    authorId: v.id("users"),
    body: v.string(),
  }).index("by_activityId", ["activityId"]),

  notifications: defineTable({
    userId: v.id("users"),
    actorId: v.id("users"),
    type: v.union(
      v.literal("friend_request"),
      v.literal("friend_accepted"),
      v.literal("like"),
      v.literal("comment"),
      v.literal("tagged"),
    ),
    activityId: v.optional(v.id("activities")),
    landmarkId: v.optional(v.id("landmarks")),
    read: v.boolean(),
  })
    .index("by_userId", ["userId"])
    .index("by_userId_and_read", ["userId", "read"])
    .index("by_activityId_and_actorId", ["activityId", "actorId"]),

  recommendations: defineTable({
    userId: v.id("users"),
    destinationId: v.id("destinations"),
    score: v.number(),
    reason: v.union(
      v.object({
        kind: v.literal("friends_top"),
        count: v.number(),
        friendIds: v.array(v.id("users")),
      }),
      v.object({ kind: v.literal("friends_want"), count: v.number() }),
      v.object({
        kind: v.literal("visited_similar"),
        sourceId: v.id("destinations"),
        sourceCount: v.number(),
        basis: v.union(v.literal("nearby"), v.literal("similar")),
      }),
      v.object({
        kind: v.literal("similar_to"),
        sourceId: v.id("destinations"),
        sourceRank: v.number(),
        basis: v.union(v.literal("nearby"), v.literal("similar")),
      }),
      v.object({ kind: v.literal("popular") }),
    ),
  }).index("by_userId_and_score", ["userId", "score"]),

  recommendationState: defineTable({
    userId: v.id("users"),
    computedAt: v.optional(v.number()),
    pending: v.boolean(),
    algorithmVersion: v.optional(v.number()),
  }).index("by_userId", ["userId"]),

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

  autoVisitDevices: defineTable({
    userId: v.id("users"),
    secret: v.string(),
    enabledAt: v.number(),
    photos: v.boolean(),
    candidate: v.optional(v.object({ landmarkId: v.id("landmarks"), since: v.number(), lastAt: v.number() })),
  })
    .index("by_secret", ["secret"])
    .index("by_userId", ["userId"]),

  autoPhotoReceipts: defineTable({
    userId: v.id("users"),
    assetKey: v.string(),
  }).index("by_userId_and_assetKey", ["userId", "assetKey"]),

  locationSettings: defineTable({
    userId: v.id("users"),
    enabled: v.boolean(),
    nearbyAlerts: v.boolean(),
    cityAlerts: v.boolean(),
    visitingDestinationId: v.optional(v.id("destinations")),
  }).index("by_userId", ["userId"]),

  friendLocations: defineTable({
    userId: v.id("users"),
    lat: v.number(),
    lng: v.number(),
    accuracy: v.number(),
    city: v.optional(v.string()),
    countryCode: v.optional(v.string()),
    updatedAt: v.number(),
  }).index("by_userId", ["userId"]),

  locationShares: defineTable({
    userId: v.id("users"),
    friendId: v.id("users"),
  }).index("by_userId_and_friendId", ["userId", "friendId"]),

  locationAlerts: defineTable({
    userId: v.id("users"),
    actorId: v.id("users"),
    kind: v.union(v.literal("nearby"), v.literal("city")),
    destinationId: v.optional(v.id("destinations")),
    eventTime: v.number(),
    read: v.boolean(),
  })
    .index("by_userId_and_eventTime", ["userId", "eventTime"])
    .index("by_userId_and_actorId_and_kind", ["userId", "actorId", "kind"]),

  locationPushTokens: defineTable({
    userId: v.id("users"),
    token: v.string(),
  })
    .index("by_token", ["token"])
    .index("by_userId", ["userId"]),

  locationDevices: defineTable({
    userId: v.id("users"),
    secret: v.string(),
  })
    .index("by_secret", ["secret"])
    .index("by_userId", ["userId"]),
});
