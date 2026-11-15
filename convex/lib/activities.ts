import type { WithoutSystemFields } from "convex/server";

import { internal } from "../_generated/api";
import type { Doc, Id } from "../_generated/dataModel";
import type { MutationCtx } from "../_generated/server";

export const UNLOCK_COALESCE_MS = 12 * 60 * 60 * 1000;

export async function postActivity(
  ctx: MutationCtx,
  activity: WithoutSystemFields<Doc<"activities">>,
): Promise<Id<"activities">> {
  const activityId = await ctx.db.insert("activities", activity);
  await ctx.scheduler.runAfter(0, internal.feed.fanOut, { activityId, cursor: null });
  return activityId;
}

export async function removeActivities(
  ctx: MutationCtx,
  actorId: Id<"users">,
  destinationId: Id<"destinations">,
  matches: (activity: Doc<"activities">) => boolean,
): Promise<void> {
  const activities = await ctx.db
    .query("activities")
    .withIndex("by_actorId_and_destinationId", (q) =>
      q.eq("actorId", actorId).eq("destinationId", destinationId),
    )
    .take(200);
  for (const activity of activities) {
    if (!matches(activity)) continue;
    await ctx.db.delete("activities", activity._id);
    await ctx.scheduler.runAfter(0, internal.feed.cleanUpActivity, { activityId: activity._id });
  }
}

export async function notify(
  ctx: MutationCtx,
  notification: Omit<WithoutSystemFields<Doc<"notifications">>, "read">,
): Promise<void> {
  if (notification.userId === notification.actorId) return;
  await ctx.db.insert("notifications", { ...notification, read: false });
}
