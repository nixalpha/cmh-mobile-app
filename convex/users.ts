import { v } from "convex/values";

import { components } from "./_generated/api";
import type { Doc, Id } from "./_generated/dataModel";
import {
  internalMutation,
  mutation,
  query,
  type QueryCtx,
} from "./_generated/server";
import { getUser, requireUser } from "./lib/auth";
import { fail } from "./lib/errors";
import { getRelationship, isBlockedEitherWay } from "./lib/social";

const HANDLE_PATTERN = /^[a-z0-9_]{3,20}$/;
const MAX_DISPLAY_NAME = 50;
const MAX_BIO = 160;

const relationship = v.union(
  v.literal("self"),
  v.literal("friends"),
  v.literal("outgoing"),
  v.literal("incoming"),
  v.literal("none"),
);

export const profileValidator = v.object({
  _id: v.id("users"),
  handle: v.union(v.string(), v.null()),
  displayName: v.union(v.string(), v.null()),
  bio: v.union(v.string(), v.null()),
  friendCount: v.number(),
  relationship,
  stats: v.union(
    v.object({ cities: v.number(), landmarks: v.number(), countries: v.number() }),
    v.null(),
  ),
});

export const userSummaryValidator = v.object({
  _id: v.id("users"),
  handle: v.union(v.string(), v.null()),
  displayName: v.union(v.string(), v.null()),
});

export function toSummary(user: Doc<"users">) {
  return {
    _id: user._id,
    handle: user.handle ?? null,
    displayName: user.displayName ?? null,
  };
}

async function toProfile(
  ctx: QueryCtx,
  viewerId: Id<"users">,
  user: Doc<"users">,
) {
  const relationship = await getRelationship(ctx, viewerId, user._id);
  return {
    ...toSummary(user),
    bio: user.bio ?? null,
    friendCount: user.friendCount,
    relationship,
    stats:
      relationship === "self" || relationship === "friends"
        ? {
            cities: user.visitCount ?? 0,
            landmarks: user.unlockCount ?? 0,
            countries: user.countryCount ?? 0,
          }
        : null,
  };
}

export const createUser = internalMutation({
  args: {
    method: v.object({
      name: v.literal("usernamePassword"),
      profile: v.object({}),
    }),
  },
  returns: v.id("users"),
  handler: async (ctx) => {
    return await ctx.db.insert("users", { friendCount: 0 });
  },
});

export const me = query({
  args: {},
  returns: v.union(profileValidator, v.null()),
  handler: async (ctx) => {
    const user = await getUser(ctx);
    if (user === null) return null;
    return await toProfile(ctx, user._id, user);
  },
});

export const updateProfile = mutation({
  args: {
    handle: v.optional(v.string()),
    displayName: v.optional(v.string()),
    bio: v.optional(v.string()),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const user = await requireUser(ctx);

    let handle = args.handle?.trim().toLowerCase() ?? user.handle;
    if (handle === undefined) {
      const username = await ctx.runQuery(
        components.authUsername.public.getUsername,
        { userId: user._id },
      );
      handle = username?.trim().toLowerCase();
    }
    if (handle === undefined || !HANDLE_PATTERN.test(handle)) {
      fail(
        "INVALID",
        "Handles are 3 to 20 characters: lowercase letters, digits, and underscores.",
      );
    }
    if (handle !== user.handle) {
      const taken = await ctx.db
        .query("users")
        .withIndex("by_handle", (q) => q.eq("handle", handle))
        .unique();
      if (taken !== null) fail("CONFLICT", "That handle is taken.");
    }

    const displayName = args.displayName?.trim() ?? user.displayName ?? handle;
    if (displayName.length === 0 || displayName.length > MAX_DISPLAY_NAME) {
      fail("INVALID", `Names are 1 to ${MAX_DISPLAY_NAME} characters.`);
    }
    const bio = args.bio?.trim() ?? user.bio;
    if (bio !== undefined && bio.length > MAX_BIO) {
      fail("INVALID", `Bios are at most ${MAX_BIO} characters.`);
    }

    await ctx.db.patch("users", user._id, {
      handle,
      displayName,
      bio,
      searchText: `${handle} ${displayName}`,
    });
    return null;
  },
});

export const profile = query({
  args: { userId: v.id("users") },
  returns: v.union(profileValidator, v.null()),
  handler: async (ctx, args) => {
    const viewer = await requireUser(ctx);
    const user = await ctx.db.get("users", args.userId);
    if (user === null) return null;
    if (await isBlockedEitherWay(ctx, viewer._id, user._id)) return null;
    return await toProfile(ctx, viewer._id, user);
  },
});

export const byHandle = query({
  args: { handle: v.string() },
  returns: v.union(profileValidator, v.null()),
  handler: async (ctx, args) => {
    const viewer = await requireUser(ctx);
    const handle = args.handle.trim().toLowerCase();
    const user = await ctx.db
      .query("users")
      .withIndex("by_handle", (q) => q.eq("handle", handle))
      .unique();
    if (user === null) return null;
    if (await isBlockedEitherWay(ctx, viewer._id, user._id)) return null;
    return await toProfile(ctx, viewer._id, user);
  },
});

export const search = query({
  args: { query: v.string() },
  returns: v.array(profileValidator),
  handler: async (ctx, args) => {
    const viewer = await requireUser(ctx);
    const text = args.query.trim().toLowerCase();
    if (text.length === 0) return [];
    const matches = await ctx.db
      .query("users")
      .withSearchIndex("search_searchText", (q) => q.search("searchText", text))
      .take(20);
    const results = [];
    for (const user of matches) {
      if (user._id === viewer._id) continue;
      if (await isBlockedEitherWay(ctx, viewer._id, user._id)) continue;
      results.push(await toProfile(ctx, viewer._id, user));
    }
    return results;
  },
});
