import type { Doc, Id } from "../_generated/dataModel";
import type { MutationCtx, QueryCtx } from "../_generated/server";
import { fail } from "./errors";
import { removeRanking } from "./lists";

type Counter = "visitCount" | "unlockCount" | "countryCount";

export async function bumpUser(ctx: MutationCtx, userId: Id<"users">, counter: Counter, by: number) {
  const user = await ctx.db.get("users", userId);
  if (user === null) return;
  await ctx.db.patch("users", userId, { [counter]: Math.max(0, (user[counter] ?? 0) + by) });
}

export async function getVisit(ctx: QueryCtx | MutationCtx, userId: Id<"users">, destinationId: Id<"destinations">) {
  return await ctx.db
    .query("visits")
    .withIndex("by_userId_and_destinationId", (q) =>
      q.eq("userId", userId).eq("destinationId", destinationId),
    )
    .unique();
}

async function visitsInCountry(ctx: MutationCtx, userId: Id<"users">, countryCode: string) {
  return await ctx.db
    .query("visits")
    .withIndex("by_userId_and_countryCode", (q) => q.eq("userId", userId).eq("countryCode", countryCode))
    .first();
}

export type When = { year?: number; month?: number };

export function checkWhen(when: When) {
  const now = new Date();
  if (when.month !== undefined && (!Number.isInteger(when.month) || when.month < 1 || when.month > 12)) {
    fail("INVALID", "Months run from 1 to 12.");
  }
  if (when.month !== undefined && when.year === undefined) {
    fail("INVALID", "A month needs a year.");
  }
  if (when.year !== undefined && (!Number.isInteger(when.year) || when.year < 1900 || when.year > now.getUTCFullYear())) {
    fail("INVALID", "That year isn't valid.");
  }
}

export async function ensureVisit(
  ctx: MutationCtx,
  userId: Id<"users">,
  destination: Doc<"destinations">,
  when: When | undefined,
) {
  if (when) checkWhen(when);
  const existing = await getVisit(ctx, userId, destination._id);
  if (existing !== null) {
    if (when) await ctx.db.patch("visits", existing._id, { year: when.year, month: when.month });
    return existing._id;
  }
  const firstInCountry =
    destination.countryCode !== "" && (await visitsInCountry(ctx, userId, destination.countryCode)) === null;
  const visitId = await ctx.db.insert("visits", {
    userId,
    destinationId: destination._id,
    countryCode: destination.countryCode,
    year: when?.year,
    month: when?.month,
    source: "self_reported",
    unlockCount: 0,
  });
  await bumpUser(ctx, userId, "visitCount", 1);
  if (firstInCountry) await bumpUser(ctx, userId, "countryCount", 1);
  return visitId;
}

export async function deleteUnlock(ctx: MutationCtx, unlock: Doc<"landmarkUnlocks">) {
  await ctx.db.delete("landmarkUnlocks", unlock._id);
  await removeRanking(ctx, unlock.userId, "landmarks", unlock.landmarkId);
  await bumpUser(ctx, unlock.userId, "unlockCount", -1);
  const visit = await getVisit(ctx, unlock.userId, unlock.destinationId);
  if (visit !== null) {
    await ctx.db.patch("visits", visit._id, { unlockCount: Math.max(0, visit.unlockCount - 1) });
  }
}

export async function deleteVisit(ctx: MutationCtx, visit: Doc<"visits">) {
  const unlocks = await ctx.db
    .query("landmarkUnlocks")
    .withIndex("by_userId_and_destinationId", (q) =>
      q.eq("userId", visit.userId).eq("destinationId", visit.destinationId),
    )
    .take(200);
  for (const unlock of unlocks) await deleteUnlock(ctx, unlock);
  await removeRanking(ctx, visit.userId, "destinations", visit.destinationId);
  await ctx.db.delete("visits", visit._id);
  await bumpUser(ctx, visit.userId, "visitCount", -1);
  if (visit.countryCode !== "" && (await visitsInCountry(ctx, visit.userId, visit.countryCode)) === null) {
    await bumpUser(ctx, visit.userId, "countryCount", -1);
  }
}
