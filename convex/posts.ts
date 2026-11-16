import { v } from "convex/values";

import type { Id } from "./_generated/dataModel";
import { mutation, type MutationCtx } from "./_generated/server";
import { MAX_POST_PHOTOS, postActivity } from "./lib/activities";
import { requireUser } from "./lib/auth";
import { fail } from "./lib/errors";
import { ASSET_KEY, checkUpload, markImported } from "./lib/photos";
import { checkDay, getVisit } from "./lib/visits";

export const MAX_POST_NOTE = 1000;

export const postPhotoValidator = v.object({
  storageId: v.id("_storage"),
  width: v.number(),
  height: v.number(),
  takenAt: v.optional(v.number()),
  // The camera roll photo this came from, hashed on the device. Imports use it to skip repeats.
  assetKey: v.optional(v.string()),
});

type NewPost = {
  destinationId: Id<"destinations">;
  photos: { storageId: Id<"_storage">; width: number; height: number; takenAt?: number; assetKey?: string }[];
  takenOn?: string;
  note?: string;
  visibility: "friends" | "private";
};

/** Posts photos from a place the user has visited. The post shows `takenOn` as its date. */
export async function createPost(ctx: MutationCtx, userId: Id<"users">, post: NewPost) {
  const visit = await getVisit(ctx, userId, post.destinationId);
  if (visit === null) fail("INVALID", "Add this place to your visits before posting from it.");
  if (post.photos.length === 0) fail("INVALID", "Pick at least one photo.");
  if (post.photos.length > MAX_POST_PHOTOS) fail("LIMIT_REACHED", `You can post up to ${MAX_POST_PHOTOS} photos.`);
  if (new Set(post.photos.map((photo) => photo.storageId)).size !== post.photos.length) {
    fail("INVALID", "The same photo was added twice.");
  }
  for (const photo of post.photos) {
    await checkUpload(ctx, photo);
    if (photo.assetKey !== undefined && !ASSET_KEY.test(photo.assetKey)) fail("INVALID", "Invalid photo identifier.");
  }
  const when = post.takenOn === undefined ? null : checkDay(post.takenOn);
  const note = post.note?.trim() || undefined;
  if (note !== undefined && note.length > MAX_POST_NOTE) fail("INVALID", `Notes can be up to ${MAX_POST_NOTE} characters.`);

  const activityId = await postActivity(ctx, {
    type: "posted",
    actorId: userId,
    destinationId: post.destinationId,
    visibility: post.visibility,
    likeCount: 0,
    commentCount: 0,
    note,
    takenOn: post.takenOn,
  });
  for (const [order, photo] of post.photos.entries()) {
    await ctx.db.insert("postPhotos", {
      userId,
      activityId,
      destinationId: post.destinationId,
      storageId: photo.storageId,
      width: photo.width,
      height: photo.height,
      takenAt: photo.takenAt,
      order,
    });
    if (photo.assetKey !== undefined) await markImported(ctx, userId, photo.assetKey);
  }
  if (when && visit.year === undefined) {
    await ctx.db.patch("visits", visit._id, { year: when.year, month: when.month });
  }
  return activityId;
}

export const create = mutation({
  args: {
    destinationId: v.id("destinations"),
    photos: v.array(postPhotoValidator),
    takenOn: v.optional(v.string()),
    note: v.optional(v.string()),
    stealth: v.optional(v.boolean()),
  },
  returns: v.id("activities"),
  handler: async (ctx, args) => {
    const user = await requireUser(ctx);
    return await createPost(ctx, user._id, {
      destinationId: args.destinationId,
      photos: args.photos,
      takenOn: args.takenOn,
      note: args.note,
      visibility: args.stealth ? "private" : "friends",
    });
  },
});
