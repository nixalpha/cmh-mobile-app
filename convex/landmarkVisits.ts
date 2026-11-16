import { v, type Infer } from "convex/values";

import { internal } from "./_generated/api";
import type { Doc, Id } from "./_generated/dataModel";
import { internalMutation, mutation, query, type MutationCtx, type QueryCtx } from "./_generated/server";
import { landmarkValidator, toLandmark } from "./destinations";
import { notify } from "./lib/activities";
import { requireUser } from "./lib/auth";
import { fail } from "./lib/errors";
import { distanceKm, toPoint } from "./lib/geo";
import { areFriends } from "./lib/social";
import {
  checkDay,
  createUnlock,
  deletePhoto,
  getVisit,
  MAX_PHOTOS,
  photoUrls,
  postUnlock,
  unlockPhotos,
} from "./lib/visits";
import { verification } from "./schema";
import { toSummary, userSummaryValidator } from "./users";

export const MAX_NOTE = 1000;
export const MAX_COMPANIONS = 20;
const MAX_PHOTO_BYTES = 10 * 1024 * 1024;
/** A photo taken this close to the landmark counts as photo verification. */
export const VERIFY_RADIUS_KM = 1;
/** Uploads not attached to a visit within this window are deleted by the cleanup cron. */
export const ORPHAN_AFTER_MS = 24 * 60 * 60 * 1000;
const CLEANUP_BATCH = 100;

async function getUnlock(ctx: QueryCtx, userId: Id<"users">, landmarkId: Id<"landmarks">) {
  return await ctx.db
    .query("landmarkUnlocks")
    .withIndex("by_userId_and_landmarkId", (q) => q.eq("userId", userId).eq("landmarkId", landmarkId))
    .unique();
}

/** The viewer's "unlocked" post for this landmark, if one still points at it. */
async function unlockActivity(ctx: QueryCtx, userId: Id<"users">, landmark: Doc<"landmarks">) {
  const recent = await ctx.db
    .query("activities")
    .withIndex("by_actorId_and_destinationId", (q) =>
      q.eq("actorId", userId).eq("destinationId", landmark.destinationId),
    )
    .order("desc")
    .take(200);
  return recent.find((a) => a.type === "unlocked" && a.landmarkId === landmark._id) ?? null;
}

export const generateUploadUrl = mutation({
  args: {},
  returns: v.string(),
  handler: async (ctx) => {
    await requireUser(ctx);
    return await ctx.storage.generateUploadUrl();
  },
});

const newPhotoValidator = v.object({
  storageId: v.id("_storage"),
  width: v.number(),
  height: v.number(),
  takenAt: v.optional(v.number()),
  // Read from the photo's EXIF on the device. Used only for the verification check, never stored.
  lat: v.optional(v.number()),
  lng: v.optional(v.number()),
});

async function checkNewPhoto(ctx: MutationCtx, photo: Infer<typeof newPhotoValidator>) {
  const file = await ctx.db.system.get("_storage", photo.storageId);
  if (file === null) fail("NOT_FOUND", "That photo upload has expired. Try adding it again.");
  if (!file.contentType?.startsWith("image/")) fail("INVALID", "Only images can be attached.");
  if (file.size > MAX_PHOTO_BYTES) fail("INVALID", "That photo is too large.");
  const used = await ctx.db
    .query("landmarkPhotos")
    .withIndex("by_storageId", (q) => q.eq("storageId", photo.storageId))
    .unique();
  if (used !== null) fail("CONFLICT", "That photo is already attached.");
  const valid = (n: number) => Number.isFinite(n) && n > 0;
  if (!valid(photo.width) || !valid(photo.height)) fail("INVALID", "That photo's size isn't valid.");
}

export const save = mutation({
  args: {
    landmarkId: v.id("landmarks"),
    visitedOn: v.optional(v.string()),
    note: v.optional(v.string()),
    companionIds: v.array(v.id("users")),
    keepPhotoIds: v.array(v.id("landmarkPhotos")),
    newPhotos: v.array(newPhotoValidator),
    stealth: v.boolean(),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const user = await requireUser(ctx);
    const landmark = await ctx.db.get("landmarks", args.landmarkId);
    if (landmark === null) fail("NOT_FOUND", "That landmark doesn't exist.");
    const visit = await getVisit(ctx, user._id, landmark.destinationId);
    if (visit === null) fail("INVALID", "Add the place to your visits before unlocking its landmarks.");

    const when = args.visitedOn === undefined ? null : checkDay(args.visitedOn);
    const note = args.note?.trim() || undefined;
    if (note !== undefined && note.length > MAX_NOTE) fail("INVALID", `Notes can be up to ${MAX_NOTE} characters.`);

    const companionIds = [...new Set(args.companionIds)];
    if (companionIds.length > MAX_COMPANIONS) fail("LIMIT_REACHED", `You can tag up to ${MAX_COMPANIONS} people.`);
    for (const id of companionIds) {
      if (id === user._id) fail("INVALID", "You don't need to tag yourself.");
      if (!(await areFriends(ctx, user._id, id))) fail("FORBIDDEN", "You can only tag friends.");
    }

    const existing = await getUnlock(ctx, user._id, landmark._id);
    const existingPhotos = existing ? await unlockPhotos(ctx, existing._id) : [];
    const keepIds = new Set(args.keepPhotoIds);
    if (args.keepPhotoIds.some((id) => !existingPhotos.some((photo) => photo._id === id))) {
      fail("NOT_FOUND", "One of those photos is no longer attached.");
    }
    const kept = existingPhotos.filter((photo) => keepIds.has(photo._id));
    const removed = existingPhotos.filter((photo) => !keepIds.has(photo._id));
    if (kept.length + args.newPhotos.length > MAX_PHOTOS) {
      fail("LIMIT_REACHED", `You can attach up to ${MAX_PHOTOS} photos.`);
    }
    if (new Set(args.newPhotos.map((photo) => photo.storageId)).size !== args.newPhotos.length) {
      fail("INVALID", "The same photo was added twice.");
    }
    for (const photo of args.newPhotos) await checkNewPhoto(ctx, photo);

    const created = existing === null ? await createUnlock(ctx, visit, landmark) : null;
    const unlockId = existing?._id ?? created!.unlockId;
    const previousCompanions = new Set(existing?.companionIds ?? []);

    for (const photo of removed) await deletePhoto(ctx, photo);
    for (const [order, photo] of kept.entries()) {
      if (photo.order !== order) await ctx.db.patch("landmarkPhotos", photo._id, { order });
    }
    for (const [i, photo] of args.newPhotos.entries()) {
      await ctx.db.insert("landmarkPhotos", {
        userId: user._id,
        unlockId,
        landmarkId: landmark._id,
        destinationId: landmark.destinationId,
        storageId: photo.storageId,
        width: photo.width,
        height: photo.height,
        takenAt: photo.takenAt,
        order: kept.length + i,
      });
    }

    const current = existing?.verification ?? "self_reported";
    const nearby = args.newPhotos.some((photo) => {
      const point = toPoint(photo.lat, photo.lng);
      return point !== null && distanceKm(point, landmark) <= VERIFY_RADIUS_KM;
    });
    const photoCount = kept.length + args.newPhotos.length;
    const nextVerification =
      current === "check_in" ? current : nearby ? "photo" : current === "photo" && photoCount === 0 ? "self_reported" : current;

    await ctx.db.patch("landmarkUnlocks", unlockId, {
      visitedOn: args.visitedOn,
      note,
      companionIds: companionIds.length > 0 ? companionIds : undefined,
      verification: nextVerification,
    });
    if (when && visit.year === undefined) {
      await ctx.db.patch("visits", visit._id, { year: when.year, month: when.month });
    }

    const visibility = args.stealth ? "private" : "friends";
    let activityId: Id<"activities"> | undefined;
    if (created) {
      activityId = await postUnlock(ctx, {
        actorId: user._id,
        landmark,
        unlockedCount: created.unlockedCount,
        visibility,
        standalone: note !== undefined || companionIds.length > 0 || photoCount > 0,
      });
    } else {
      const activity = await unlockActivity(ctx, user._id, landmark);
      if (activity !== null && activity.visibility !== visibility) {
        await ctx.db.patch("activities", activity._id, { visibility });
      }
      activityId = activity?._id;
    }

    if (!args.stealth) {
      for (const id of companionIds) {
        if (previousCompanions.has(id)) continue;
        await notify(ctx, { userId: id, actorId: user._id, type: "tagged", landmarkId: landmark._id, activityId });
      }
    }
    return null;
  },
});

const mineValidator = v.object({
  visitedOn: v.union(v.string(), v.null()),
  note: v.union(v.string(), v.null()),
  companions: v.array(userSummaryValidator),
  photos: v.array(
    v.object({ _id: v.id("landmarkPhotos"), url: v.string(), width: v.number(), height: v.number() }),
  ),
  verification,
  stealth: v.boolean(),
});

/** Everything the landmark visit sheet needs: the landmark, whether it can be logged, and the viewer's saved visit. */
export const get = query({
  args: { landmarkId: v.id("landmarks") },
  returns: v.union(
    v.object({
      landmark: landmarkValidator,
      destinationName: v.string(),
      destinationVisited: v.boolean(),
      mine: v.union(mineValidator, v.null()),
    }),
    v.null(),
  ),
  handler: async (ctx, args) => {
    const user = await requireUser(ctx);
    const landmark = await ctx.db.get("landmarks", args.landmarkId);
    if (landmark === null) return null;
    const [destination, visit, unlock] = await Promise.all([
      ctx.db.get("destinations", landmark.destinationId),
      getVisit(ctx, user._id, landmark.destinationId),
      getUnlock(ctx, user._id, landmark._id),
    ]);
    if (destination === null) return null;
    const base = {
      landmark: toLandmark(landmark),
      destinationName: destination.name,
      destinationVisited: visit !== null,
    };
    if (unlock === null) return { ...base, mine: null };
    const [companions, photos, activity] = await Promise.all([
      Promise.all((unlock.companionIds ?? []).map((id) => ctx.db.get("users", id))),
      photoUrls(ctx, unlock._id, MAX_PHOTOS),
      unlockActivity(ctx, user._id, landmark),
    ]);
    return {
      ...base,
      mine: {
        visitedOn: unlock.visitedOn ?? null,
        note: unlock.note ?? null,
        companions: companions.filter((u): u is Doc<"users"> => u !== null).map(toSummary),
        photos,
        verification: unlock.verification,
        stealth: activity?.visibility === "private",
      },
    };
  },
});

/**
 * Deletes uploads that were never attached to a landmark visit (for example, the sheet was
 * closed after picking photos). Landmark photos are currently the only use of file storage;
 * anything else that stores files must be referenced here before this runs against it.
 */
export const cleanOrphanUploads = internalMutation({
  args: { cursor: v.union(v.string(), v.null()) },
  returns: v.null(),
  handler: async (ctx, args) => {
    const cutoff = Date.now() - ORPHAN_AFTER_MS;
    const result = await ctx.db.system
      .query("_storage")
      .paginate({ cursor: args.cursor, numItems: CLEANUP_BATCH });
    let reachedRecent = false;
    for (const file of result.page) {
      if (file._creationTime >= cutoff) {
        reachedRecent = true;
        break;
      }
      const photo = await ctx.db
        .query("landmarkPhotos")
        .withIndex("by_storageId", (q) => q.eq("storageId", file._id))
        .unique();
      if (photo === null) await ctx.storage.delete(file._id);
    }
    if (!result.isDone && !reachedRecent) {
      await ctx.scheduler.runAfter(0, internal.landmarkVisits.cleanOrphanUploads, { cursor: result.continueCursor });
    }
    return null;
  },
});
