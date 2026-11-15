import { paginationOptsValidator, paginationResultValidator } from "convex/server";
import { v } from "convex/values";

import { mutation, query } from "./_generated/server";
import { landmarkValidator, toLandmark } from "./destinations";
import { requireUser } from "./lib/auth";
import { toSummary, userSummaryValidator } from "./users";

const MAX_BADGE = 99;

export const list = query({
  args: { paginationOpts: paginationOptsValidator },
  returns: paginationResultValidator(
    v.object({
      _id: v.id("notifications"),
      _creationTime: v.number(),
      type: v.union(
        v.literal("friend_request"),
        v.literal("friend_accepted"),
        v.literal("like"),
        v.literal("comment"),
        v.literal("tagged"),
      ),
      actor: userSummaryValidator,
      activityId: v.union(v.id("activities"), v.null()),
      landmark: v.union(landmarkValidator, v.null()),
      read: v.boolean(),
    }),
  ),
  handler: async (ctx, args) => {
    const user = await requireUser(ctx);
    const result = await ctx.db
      .query("notifications")
      .withIndex("by_userId", (q) => q.eq("userId", user._id))
      .order("desc")
      .paginate(args.paginationOpts);
    const page = [];
    for (const row of result.page) {
      const actor = await ctx.db.get("users", row.actorId);
      if (actor === null) continue;
      const landmark = row.landmarkId ? await ctx.db.get("landmarks", row.landmarkId) : null;
      page.push({
        _id: row._id,
        _creationTime: row._creationTime,
        type: row.type,
        actor: toSummary(actor),
        activityId: row.activityId ?? null,
        landmark: landmark ? toLandmark(landmark) : null,
        read: row.read,
      });
    }
    return { ...result, page };
  },
});

export const unreadCount = query({
  args: {},
  returns: v.number(),
  handler: async (ctx) => {
    const user = await requireUser(ctx);
    const unread = await ctx.db
      .query("notifications")
      .withIndex("by_userId_and_read", (q) => q.eq("userId", user._id).eq("read", false))
      .take(MAX_BADGE);
    return unread.length;
  },
});

export const markAllRead = mutation({
  args: {},
  returns: v.null(),
  handler: async (ctx) => {
    const user = await requireUser(ctx);
    const unread = await ctx.db
      .query("notifications")
      .withIndex("by_userId_and_read", (q) => q.eq("userId", user._id).eq("read", false))
      .take(500);
    for (const row of unread) await ctx.db.patch("notifications", row._id, { read: true });
    return null;
  },
});
