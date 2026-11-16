import type { Doc, Id } from "../_generated/dataModel";
import type { MutationCtx, QueryCtx } from "../_generated/server";
import { postActivity, removeActivities, UNLOCK_COALESCE_MS } from "./activities";
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

const DAY_PATTERN = /^(\d{4})-(\d{2})-(\d{2})$/;
// The client sends its local calendar day, which can run up to 14 hours ahead of UTC.
const MAX_UTC_OFFSET_MS = 14 * 60 * 60 * 1000;

export function checkDay(day: string) {
  const match = DAY_PATTERN.exec(day);
  const [year, month, date] = match ? match.slice(1).map(Number) : [NaN, NaN, NaN];
  const parsed = new Date(Date.UTC(year, month - 1, date));
  if (!match || parsed.getUTCFullYear() !== year || parsed.getUTCMonth() !== month - 1 || parsed.getUTCDate() !== date) {
    fail("INVALID", "That date isn't valid.");
  }
  if (year < 1900) fail("INVALID", "That date isn't valid.");
  const latest = new Date(Date.now() + MAX_UTC_OFFSET_MS).toISOString().slice(0, 10);
  if (day > latest) fail("INVALID", "The visit date can't be in the future.");
  return { year, month };
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

export async function createUnlock(
  ctx: MutationCtx,
  visit: Doc<"visits">,
  landmark: Doc<"landmarks">,
) {
  const unlockId = await ctx.db.insert("landmarkUnlocks", {
    userId: visit.userId,
    landmarkId: landmark._id,
    destinationId: landmark.destinationId,
    verification: "self_reported",
  });
  const unlockedCount = visit.unlockCount + 1;
  await ctx.db.patch("visits", visit._id, { unlockCount: unlockedCount });
  await bumpUser(ctx, visit.userId, "unlockCount", 1);
  return { unlockId, unlockedCount };
}

export const MAX_PHOTOS = 10;

export async function unlockPhotos(ctx: QueryCtx | MutationCtx, unlockId: Id<"landmarkUnlocks">) {
  return await ctx.db
    .query("landmarkPhotos")
    .withIndex("by_unlockId_and_order", (q) => q.eq("unlockId", unlockId))
    .take(MAX_PHOTOS);
}

/** Signed URLs for an unlock's photos in order. Storage IDs never leave the server. */
export async function photoUrls(ctx: QueryCtx | MutationCtx, unlockId: Id<"landmarkUnlocks">, limit: number) {
  const photos = await ctx.db
    .query("landmarkPhotos")
    .withIndex("by_unlockId_and_order", (q) => q.eq("unlockId", unlockId))
    .take(limit);
  const urls = await Promise.all(photos.map((photo) => ctx.storage.getUrl(photo.storageId)));
  return photos.flatMap((photo, i) => {
    const url = urls[i];
    return url === null ? [] : [{ _id: photo._id, url, width: photo.width, height: photo.height }];
  });
}

export async function deletePhoto(ctx: MutationCtx, photo: Doc<"landmarkPhotos">) {
  await ctx.db.delete("landmarkPhotos", photo._id);
  await ctx.storage.delete(photo.storageId);
}

async function landmarkUnlock(ctx: QueryCtx | MutationCtx, userId: Id<"users">, landmarkId: Id<"landmarks">) {
  return await ctx.db
    .query("landmarkUnlocks")
    .withIndex("by_userId_and_landmarkId", (q) => q.eq("userId", userId).eq("landmarkId", landmarkId))
    .unique();
}

async function hasDetails(ctx: QueryCtx | MutationCtx, unlock: Doc<"landmarkUnlocks"> | null) {
  if (unlock === null) return false;
  if (unlock.note || (unlock.companionIds?.length ?? 0) > 0) return true;
  return (await unlockPhotos(ctx, unlock._id)).length > 0;
}

/**
 * Posts an "unlocked" activity. Bare unlocks within the coalescing window fold into the
 * previous friends-visible post, unless that post is showing another landmark's photos,
 * note, or companions. Standalone and private posts never coalesce.
 */
export async function postUnlock(
  ctx: MutationCtx,
  args: {
    actorId: Id<"users">;
    landmark: Doc<"landmarks">;
    unlockedCount: number;
    visibility: "friends" | "private";
    standalone: boolean;
  },
) {
  const { actorId, landmark, unlockedCount, visibility } = args;
  const landmarkTotal = (await ctx.db.get("destinations", landmark.destinationId))?.landmarkCount ?? 0;
  if (!args.standalone && visibility === "friends") {
    const recent = await ctx.db
      .query("activities")
      .withIndex("by_actorId_and_destinationId", (q) =>
        q.eq("actorId", actorId).eq("destinationId", landmark.destinationId),
      )
      .order("desc")
      .take(20);
    const current = recent.find(
      (a) => a.type === "unlocked" && a.visibility === "friends" && a._creationTime > Date.now() - UNLOCK_COALESCE_MS,
    );
    if (
      current?.type === "unlocked" &&
      !(await hasDetails(ctx, await landmarkUnlock(ctx, actorId, current.landmarkId)))
    ) {
      await ctx.db.patch("activities", current._id, { landmarkId: landmark._id, unlockedCount, landmarkTotal });
      return current._id;
    }
  }
  return await postActivity(ctx, {
    type: "unlocked",
    actorId,
    destinationId: landmark.destinationId,
    visibility,
    likeCount: 0,
    commentCount: 0,
    landmarkId: landmark._id,
    unlockedCount,
    landmarkTotal,
  });
}

export async function deleteUnlock(ctx: MutationCtx, unlock: Doc<"landmarkUnlocks">) {
  for (const photo of await unlockPhotos(ctx, unlock._id)) await deletePhoto(ctx, photo);
  await ctx.db.delete("landmarkUnlocks", unlock._id);
  await removeRanking(ctx, unlock.userId, "landmarks", unlock.landmarkId);
  await removeActivities(
    ctx,
    unlock.userId,
    unlock.destinationId,
    (a) => a.type === "unlocked" && a.landmarkId === unlock.landmarkId,
  );
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
  await removeActivities(ctx, visit.userId, visit.destinationId, (a) => a.type !== "saved");
  await ctx.db.delete("visits", visit._id);
  await bumpUser(ctx, visit.userId, "visitCount", -1);
  if (visit.countryCode !== "" && (await visitsInCountry(ctx, visit.userId, visit.countryCode)) === null) {
    await bumpUser(ctx, visit.userId, "countryCount", -1);
  }
}
