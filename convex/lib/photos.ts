import type { Id } from "../_generated/dataModel";
import type { MutationCtx, QueryCtx } from "../_generated/server";
import { fail } from "./errors";

const MAX_PHOTO_BYTES = 10 * 1024 * 1024;

/** Whether a stored file is already attached to a landmark visit or a post. */
export async function photoInUse(ctx: QueryCtx | MutationCtx, storageId: Id<"_storage">) {
  const [landmark, post] = await Promise.all([
    ctx.db.query("landmarkPhotos").withIndex("by_storageId", (q) => q.eq("storageId", storageId)).unique(),
    ctx.db.query("postPhotos").withIndex("by_storageId", (q) => q.eq("storageId", storageId)).unique(),
  ]);
  return landmark !== null || post !== null;
}

/** Rejects an upload that expired, isn't an image, is too large, or is attached elsewhere. */
export async function checkUpload(
  ctx: MutationCtx,
  photo: { storageId: Id<"_storage">; width: number; height: number },
) {
  const file = await ctx.db.system.get("_storage", photo.storageId);
  if (file === null) fail("NOT_FOUND", "That photo upload has expired. Try adding it again.");
  if (!file.contentType?.startsWith("image/")) fail("INVALID", "Only images can be attached.");
  if (file.size > MAX_PHOTO_BYTES) fail("INVALID", "That photo is too large.");
  if (await photoInUse(ctx, photo.storageId)) fail("CONFLICT", "That photo is already attached.");
  const valid = (n: number) => Number.isFinite(n) && n > 0;
  if (!valid(photo.width) || !valid(photo.height)) fail("INVALID", "That photo's size isn't valid.");
}

/** Records that a camera-roll photo was imported, so later imports skip it. */
export async function markImported(ctx: MutationCtx, userId: Id<"users">, assetKey: string) {
  const seen = await ctx.db
    .query("autoPhotoReceipts")
    .withIndex("by_userId_and_assetKey", (q) => q.eq("userId", userId).eq("assetKey", assetKey))
    .unique();
  if (seen === null) await ctx.db.insert("autoPhotoReceipts", { userId, assetKey });
}

export const ASSET_KEY = /^[a-f0-9]{64}$/;
