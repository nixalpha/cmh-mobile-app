import { v } from "convex/values";

import { mutation, query } from "./_generated/server";
import { requireUser } from "./lib/auth";
import { fail } from "./lib/errors";
import { distanceKm, toPoint } from "./lib/geo";
import { ASSET_KEY, checkUpload, markImported } from "./lib/photos";
import { checkDay, createUnlock, getVisit, MAX_PHOTOS, postUnlock, unlockPhotos } from "./lib/visits";
import { createPost, postPhotoValidator } from "./posts";

/** A past photo this close to a landmark collects it. The device picks the nearest landmark. */
export const LANDMARK_RADIUS_KM = 0.3;
const MAX_KEYS = 1000;

/** Which of these camera-roll photos were imported before. Asset IDs are hashed on the device. */
export const seen = query({
  args: { assetKeys: v.array(v.string()) },
  returns: v.array(v.string()),
  handler: async (ctx, args) => {
    const user = await requireUser(ctx);
    if (args.assetKeys.length > MAX_KEYS) fail("LIMIT_REACHED", `Check up to ${MAX_KEYS} photos at a time.`);
    const seen: string[] = [];
    for (const assetKey of args.assetKeys) {
      if (!ASSET_KEY.test(assetKey)) fail("INVALID", "Invalid photo identifier.");
      const receipt = await ctx.db
        .query("autoPhotoReceipts")
        .withIndex("by_userId_and_assetKey", (q) => q.eq("userId", user._id).eq("assetKey", assetKey))
        .unique();
      if (receipt !== null) seen.push(assetKey);
    }
    return seen;
  },
});

const landmarkPhotoValidator = v.object({
  storageId: v.id("_storage"),
  width: v.number(),
  height: v.number(),
  takenAt: v.number(),
  // The photo's local capture day and position, read on the device. The position is checked, never stored.
  day: v.string(),
  lat: v.number(),
  lng: v.number(),
  assetKey: v.string(),
});

/**
 * Collects a landmark from past photos taken there: unlocks it as photo-verified, dates the
 * visit from the earliest photo, attaches the photos, and posts it to friends.
 * Returns how many photos were attached.
 */
export const importLandmark = mutation({
  args: { landmarkId: v.id("landmarks"), photos: v.array(landmarkPhotoValidator) },
  returns: v.number(),
  handler: async (ctx, args) => {
    const user = await requireUser(ctx);
    const landmark = await ctx.db.get("landmarks", args.landmarkId);
    if (landmark === null) fail("NOT_FOUND", "That landmark doesn't exist.");
    const visit = await getVisit(ctx, user._id, landmark.destinationId);
    if (visit === null) fail("INVALID", "Add the place to your visits before importing its photos.");
    if (args.photos.length > MAX_PHOTOS) fail("LIMIT_REACHED", `Import up to ${MAX_PHOTOS} photos at a time.`);

    const accepted: typeof args.photos = [];
    for (const photo of args.photos) {
      if (!ASSET_KEY.test(photo.assetKey)) fail("INVALID", "Invalid photo identifier.");
      checkDay(photo.day);
      const point = toPoint(photo.lat, photo.lng);
      if (point === null || distanceKm(point, landmark) > LANDMARK_RADIUS_KM) continue;
      const seen = await ctx.db
        .query("autoPhotoReceipts")
        .withIndex("by_userId_and_assetKey", (q) => q.eq("userId", user._id).eq("assetKey", photo.assetKey))
        .unique();
      if (seen !== null || accepted.some((other) => other.storageId === photo.storageId)) continue;
      await checkUpload(ctx, photo);
      accepted.push(photo);
    }
    if (accepted.length === 0) return 0;
    accepted.sort((a, b) => a.takenAt - b.takenAt);
    const firstDay = accepted.map((photo) => photo.day).sort()[0];

    const existing = await ctx.db
      .query("landmarkUnlocks")
      .withIndex("by_userId_and_landmarkId", (q) => q.eq("userId", user._id).eq("landmarkId", landmark._id))
      .unique();
    const created = existing === null ? await createUnlock(ctx, visit, landmark) : null;
    const unlockId = existing?._id ?? created!.unlockId;
    const photos = await unlockPhotos(ctx, unlockId);
    const room = Math.max(0, MAX_PHOTOS - photos.length);
    for (const [i, photo] of accepted.slice(0, room).entries()) {
      await ctx.db.insert("landmarkPhotos", {
        userId: user._id,
        unlockId,
        landmarkId: landmark._id,
        destinationId: landmark.destinationId,
        storageId: photo.storageId,
        width: photo.width,
        height: photo.height,
        takenAt: photo.takenAt,
        order: photos.length + i,
      });
    }
    for (const photo of accepted) await markImported(ctx, user._id, photo.assetKey);

    const unlock = (await ctx.db.get("landmarkUnlocks", unlockId))!;
    await ctx.db.patch("landmarkUnlocks", unlockId, {
      verification: unlock.verification === "check_in" ? "check_in" : "photo",
      visitedOn: unlock.visitedOn ?? firstDay,
    });
    if (visit.year === undefined) {
      const when = checkDay(firstDay);
      await ctx.db.patch("visits", visit._id, { year: when.year, month: when.month });
    }
    if (created) {
      await postUnlock(ctx, {
        actorId: user._id,
        landmark,
        unlockedCount: created.unlockedCount,
        visibility: "friends",
        standalone: true,
      });
    }
    return Math.min(room, accepted.length);
  },
});

/** Posts past photos from the city that weren't taken at a landmark, dated by the earliest one. */
export const importCityPhotos = mutation({
  args: { destinationId: v.id("destinations"), takenOn: v.string(), photos: v.array(postPhotoValidator) },
  returns: v.number(),
  handler: async (ctx, args) => {
    const user = await requireUser(ctx);
    const fresh = [];
    for (const photo of args.photos) {
      if (photo.assetKey === undefined) fail("INVALID", "Imported photos need an identifier.");
      const seen = await ctx.db
        .query("autoPhotoReceipts")
        .withIndex("by_userId_and_assetKey", (q) => q.eq("userId", user._id).eq("assetKey", photo.assetKey!))
        .unique();
      if (seen === null) fresh.push(photo);
    }
    if (fresh.length === 0) return 0;
    await createPost(ctx, user._id, {
      destinationId: args.destinationId,
      photos: fresh,
      takenOn: args.takenOn,
      visibility: "friends",
    });
    return fresh.length;
  },
});

/** Marks this place's photos as imported so opening it again doesn't rescan the camera roll. */
export const finish = mutation({
  args: { destinationId: v.id("destinations") },
  returns: v.null(),
  handler: async (ctx, args) => {
    const user = await requireUser(ctx);
    const visit = await getVisit(ctx, user._id, args.destinationId);
    if (visit === null) fail("NOT_FOUND", "You haven't added that place.");
    if (visit.photosImportedAt === undefined) {
      await ctx.db.patch("visits", visit._id, { photosImportedAt: Date.now() });
    }
    return null;
  },
});
