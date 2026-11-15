import { internal } from "../_generated/api";
import type { Id } from "../_generated/dataModel";
import type { MutationCtx } from "../_generated/server";

export const STALE_AFTER_MS = 12 * 60 * 60 * 1000;
const DEBOUNCE_MS = 5000;

export async function scheduleRecompute(
  ctx: MutationCtx,
  userId: Id<"users">,
  delayMs = DEBOUNCE_MS,
): Promise<boolean> {
  const state = await ctx.db
    .query("recommendationState")
    .withIndex("by_userId", (q) => q.eq("userId", userId))
    .unique();
  if (state?.pending) return false;
  if (state === null) {
    await ctx.db.insert("recommendationState", { userId, pending: true });
  } else {
    await ctx.db.patch("recommendationState", state._id, { pending: true });
  }
  await ctx.scheduler.runAfter(delayMs, internal.recommendations.recompute, { userId });
  return true;
}
