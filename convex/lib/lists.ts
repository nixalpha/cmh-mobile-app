import type { Doc, Id } from "../_generated/dataModel";
import type { MutationCtx, QueryCtx } from "../_generated/server";
import { removeActivities } from "./activities";
import { fail } from "./errors";
import {
  answer,
  isPlaced,
  MAX_LIST_SIZE,
  opponentIndex,
  startRange,
  type Outcome,
} from "./ranking";

export type List = Doc<"rankings">["list"];
export type ItemId = Doc<"rankings">["itemId"];
export type Answer = { opponentId: ItemId; outcome: Outcome };

type Ctx = QueryCtx | MutationCtx;

export async function getHeader(ctx: Ctx, userId: Id<"users">, list: List) {
  return await ctx.db
    .query("rankedLists")
    .withIndex("by_userId_and_list", (q) => q.eq("userId", userId).eq("list", list))
    .unique();
}

export async function getRanking(ctx: Ctx, userId: Id<"users">, list: List, itemId: ItemId) {
  return await ctx.db
    .query("rankings")
    .withIndex("by_userId_and_list_and_itemId", (q) =>
      q.eq("userId", userId).eq("list", list).eq("itemId", itemId),
    )
    .unique();
}

export async function getRankingAt(ctx: Ctx, userId: Id<"users">, list: List, rank: number) {
  return await ctx.db
    .query("rankings")
    .withIndex("by_userId_and_list_and_rank", (q) =>
      q.eq("userId", userId).eq("list", list).eq("rank", rank),
    )
    .unique();
}

async function shiftFrom(ctx: MutationCtx, userId: Id<"users">, list: List, rank: number, by: number) {
  const rows = await ctx.db
    .query("rankings")
    .withIndex("by_userId_and_list_and_rank", (q) =>
      q.eq("userId", userId).eq("list", list).gte("rank", rank),
    )
    .take(MAX_LIST_SIZE);
  for (const row of rows) {
    await ctx.db.patch("rankings", row._id, { rank: row.rank + by });
  }
}

export async function removeRanking(ctx: MutationCtx, userId: Id<"users">, list: List, itemId: ItemId) {
  const row = await getRanking(ctx, userId, list, itemId);
  const header = await getHeader(ctx, userId, list);
  if (row === null || header === null) return false;
  await ctx.db.delete("rankings", row._id);
  await shiftFrom(ctx, userId, list, row.rank + 1, -1);
  const destinationId =
    list === "destinations"
      ? (itemId as Id<"destinations">)
      : (await ctx.db.get("landmarks", itemId as Id<"landmarks">))?.destinationId;
  if (destinationId) {
    await removeActivities(ctx, userId, destinationId, (a) => a.type === "ranked" && a.itemId === itemId);
  }
  await ctx.db.patch("rankedLists", header._id, {
    size: header.size - 1,
    version: header.version + 1,
  });
  return true;
}

export async function placeRanking(
  ctx: MutationCtx,
  userId: Id<"users">,
  list: List,
  itemId: ItemId,
  answers: Answer[],
  version: number,
) {
  const header = await getHeader(ctx, userId, list);
  const size = header?.size ?? 0;
  if ((header?.version ?? 0) !== version) {
    fail("LIST_CHANGED", "Your list changed. Start the ranking again.");
  }
  if (size >= MAX_LIST_SIZE) {
    fail("LIMIT_REACHED", `Lists hold at most ${MAX_LIST_SIZE} places.`);
  }

  let range = startRange(size);
  for (const given of answers) {
    if (isPlaced(range)) fail("INVALID", "More answers than the ranking needed.");
    const opponent = await getRankingAt(ctx, userId, list, opponentIndex(range) + 1);
    if (opponent === null || opponent.itemId !== given.opponentId) {
      fail("LIST_CHANGED", "Your list changed. Start the ranking again.");
    }
    range = answer(range, given.outcome);
    await ctx.db.insert("comparisons", {
      userId,
      list,
      itemId,
      opponentId: given.opponentId,
      outcome: given.outcome,
    });
  }
  if (!isPlaced(range)) fail("INVALID", "The ranking isn't finished.");

  const rank = range.lo + 1;
  const below = (await getRankingAt(ctx, userId, list, rank))?.itemId ?? null;
  await shiftFrom(ctx, userId, list, rank, 1);
  await ctx.db.insert("rankings", { userId, list, itemId, rank });
  if (header === null) {
    await ctx.db.insert("rankedLists", { userId, list, size: 1, version: 1 });
  } else {
    await ctx.db.patch("rankedLists", header._id, { size: size + 1, version: header.version + 1 });
  }
  return { rank, size: size + 1, below };
}
