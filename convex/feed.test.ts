import { afterEach, beforeEach, expect, test, vi } from "vitest";

import { api, internal } from "./_generated/api";
import type { Id } from "./_generated/dataModel";
import { befriend, setup, signUp, type Test } from "./test.setup";

type Person = Awaited<ReturnType<typeof signUp>>;
const firstPage = { numItems: 50, cursor: null };
const HOUR = 60 * 60 * 1000;

beforeEach(() => {
  vi.useFakeTimers();
});
afterEach(() => {
  vi.useRealTimers();
});

async function seedCatalog(t: Test) {
  await t.mutation(internal.catalog.upsertDestinations, {
    importedAt: 1,
    rows: ["Kyoto", "Paris", "Porto"].map((name, i) => ({
      wikidataId: `Q${i}`,
      kind: "city" as const,
      name,
      searchText: name.toLowerCase(),
      countryCode: "XX",
      countryName: "Testland",
      lat: i,
      lng: i,
      popularity: 0.9,
      tier: 1,
      landmarkCount: i === 0 ? 3 : 0,
    })),
  });
  await t.mutation(internal.catalog.upsertLandmarks, {
    importedAt: 1,
    rows: ["Fushimi Inari", "Kinkaku-ji", "Arashiyama"].map((name, i) => ({
      wikidataId: `L${i}`,
      destinationWikidataId: "Q0",
      name,
      searchText: name.toLowerCase(),
      category: "place of worship",
      lat: 0,
      lng: 0,
      notability: 9 - i,
      order: i + 1,
    })),
  });
  return await t.run(async (ctx) => {
    const cities = await ctx.db.query("destinations").take(10);
    const landmarks = await ctx.db.query("landmarks").take(10);
    const id = <T extends { name: string }>(docs: T[], name: string) => docs.find((d) => d.name === name)!;
    return {
      kyoto: id(cities, "Kyoto")._id,
      paris: id(cities, "Paris")._id,
      porto: id(cities, "Porto")._id,
      landmarks: ["Fushimi Inari", "Kinkaku-ji", "Arashiyama"].map((name) => id(landmarks, name)._id),
    };
  });
}

const settle = async (t: Test) => {
  await t.finishAllScheduledFunctions(vi.runAllTimers);
  vi.advanceTimersByTime(1000);
};

async function rankFirst(person: Person, itemId: Id<"destinations">, post?: { note?: string; showPair?: boolean }) {
  const { version } = await person.as.query(api.rankings.session, { list: "destinations" });
  return await person.as.mutation(api.rankings.place, { list: "destinations", itemId, answers: [], version, visit: { year: 2026, month: 10 }, post });
}

async function rankAbove(person: Person, itemId: Id<"destinations">, opponentId: Id<"destinations">, post = {}) {
  const { version } = await person.as.query(api.rankings.session, { list: "destinations" });
  return await person.as.mutation(api.rankings.place, {
    list: "destinations",
    itemId,
    answers: [{ opponentId, outcome: "new" }],
    version,
    visit: { year: 2026 },
    post,
  });
}

const feedOf = async (person: Person, actorId?: Id<"users">) =>
  (await person.as.query(api.feed.friends, { actorId, paginationOpts: firstPage })).page;

async function world() {
  const t = setup();
  const places = await seedCatalog(t);
  const maya = await signUp(t, "maya");
  const sam = await signUp(t, "sam");
  const stranger = await signUp(t, "stranger");
  await befriend(maya, sam);
  await settle(t);
  return { t, places, maya, sam, stranger };
}

test("a posted ranking reaches friends only, with its snapshot", async () => {
  const { t, places, maya, sam, stranger } = await world();
  await rankFirst(maya, places.paris);
  await rankAbove(maya, places.kyoto, places.paris, { note: "The moss gardens won it.", showPair: true });
  await settle(t);

  const [post, ...rest] = await feedOf(sam);
  expect(rest).toEqual([]);
  expect(post).toMatchObject({
    type: "ranked",
    actor: { handle: "maya" },
    destination: { name: "Kyoto" },
    ranking: { list: "destinations", rank: 1, listSize: 2, score: 10, beatName: "Paris", note: "The moss gardens won it.", showPair: true },
    likeCount: 0,
    likedByViewer: false,
  });
  expect(await feedOf(stranger)).toEqual([]);
  expect(await feedOf(maya)).toEqual([]);
  const mine = await maya.as.query(api.feed.byUser, { paginationOpts: firstPage });
  expect(mine.page.map((p) => p.destination.name)).toEqual(["Kyoto"]);
});

test("unfriending and blocking hide posts at once and the pointers are then deleted", async () => {
  const { t, places, maya, sam } = await world();
  await rankFirst(maya, places.kyoto, {});
  await settle(t);
  expect(await feedOf(sam)).toHaveLength(1);

  await sam.as.mutation(api.friends.unfriend, { userId: maya.id });
  expect(await feedOf(sam)).toEqual([]);
  await expect(sam.as.query(api.feed.byUser, { userId: maya.id, paginationOpts: firstPage })).rejects.toThrow(/FORBIDDEN/);
  await settle(t);
  expect(await t.run((ctx) => ctx.db.query("feedItems").take(10))).toEqual([]);

  await befriend(maya, sam);
  await settle(t);
  expect(await feedOf(sam)).toHaveLength(1);
  await maya.as.mutation(api.friends.block, { userId: sam.id });
  expect(await feedOf(sam)).toEqual([]);
  await settle(t);
  expect(await t.run((ctx) => ctx.db.query("feedItems").take(10))).toEqual([]);
});

test("a private post disappears for friends and stays for its author", async () => {
  const { t, places, maya, sam } = await world();
  await rankFirst(maya, places.kyoto, {});
  await settle(t);
  const [post] = await feedOf(sam);
  await expect(sam.as.mutation(api.feed.setVisibility, { activityId: post._id, visibility: "private" })).rejects.toThrow(/NOT_FOUND/);
  await maya.as.mutation(api.feed.setVisibility, { activityId: post._id, visibility: "private" });

  expect(await feedOf(sam)).toEqual([]);
  expect((await sam.as.query(api.feed.byUser, { userId: maya.id, paginationOpts: firstPage })).page).toEqual([]);
  await expect(sam.as.mutation(api.feed.like, { activityId: post._id })).rejects.toThrow(/NOT_FOUND/);
  expect((await maya.as.query(api.feed.byUser, { paginationOpts: firstPage })).page).toHaveLength(1);
});

test("a new friend gets recent posts backfilled, and the feed filters by friend", async () => {
  const { t, places, maya, sam, stranger } = await world();
  await rankFirst(maya, places.kyoto, {});
  await settle(t);
  await maya.as.mutation(api.places.save, { destinationId: places.porto });
  await settle(t);
  await befriend(stranger, sam);
  await befriend(stranger, maya);
  await rankFirst(stranger, places.paris, {});
  await settle(t);

  expect((await feedOf(stranger)).map((p) => [p.type, p.destination.name])).toEqual([["saved", "Porto"], ["ranked", "Kyoto"]]);
  expect((await feedOf(sam)).map((p) => p.actor.handle)).toEqual(["stranger", "maya", "maya"]);
  expect((await feedOf(sam, stranger.id)).map((p) => p.destination.name)).toEqual(["Paris"]);
});

test("ranking without posting, and onboarding visits, create nothing in the feed", async () => {
  const { t, places, maya, sam } = await world();
  await maya.as.mutation(api.places.addVisit, { destinationId: places.paris });
  await rankFirst(maya, places.kyoto);
  await maya.as.mutation(api.places.save, { destinationId: places.porto, post: false });
  await settle(t);
  expect(await feedOf(sam)).toEqual([]);
  expect((await maya.as.query(api.feed.byUser, { paginationOpts: firstPage })).page).toEqual([]);
});

test("unlocks in one city within 12 hours share a post, and a later one starts a new post", async () => {
  const { t, places, maya, sam } = await world();
  await maya.as.mutation(api.places.addVisit, { destinationId: places.kyoto, year: 2026 });
  await maya.as.mutation(api.places.unlockLandmark, { landmarkId: places.landmarks[0] });
  await settle(t);
  vi.advanceTimersByTime(2 * HOUR);
  await maya.as.mutation(api.places.unlockLandmark, { landmarkId: places.landmarks[1] });
  await settle(t);

  const merged = await feedOf(sam);
  expect(merged).toHaveLength(1);
  expect(merged[0]).toMatchObject({ type: "unlocked", landmark: { name: "Kinkaku-ji" }, unlock: { unlockedCount: 2, landmarkTotal: 3 } });

  vi.advanceTimersByTime(13 * HOUR);
  await maya.as.mutation(api.places.unlockLandmark, { landmarkId: places.landmarks[2] });
  await settle(t);
  const later = await feedOf(sam);
  expect(later.map((p) => [p.landmark?.name, p.unlock?.unlockedCount])).toEqual([["Arashiyama", 3], ["Kinkaku-ji", 2]]);
});

test("removing what a post reports removes the post and its pointers", async () => {
  const { t, places, maya, sam } = await world();
  await rankFirst(maya, places.kyoto, {});
  await maya.as.mutation(api.places.save, { destinationId: places.porto });
  await settle(t);
  const [, rankedPost] = await feedOf(sam);
  await sam.as.mutation(api.feed.like, { activityId: rankedPost._id });

  await maya.as.mutation(api.rankings.remove, { list: "destinations", itemId: places.kyoto });
  await maya.as.mutation(api.places.unsave, { destinationId: places.porto });
  expect(await feedOf(sam)).toEqual([]);
  await settle(t);
  const leftovers = await t.run(async (ctx) => ({
    items: await ctx.db.query("feedItems").take(10),
    likes: await ctx.db.query("likes").take(10),
    notifications: await ctx.db.query("notifications").withIndex("by_userId", (q) => q.eq("userId", maya.id)).take(10),
  }));
  expect(leftovers.items).toEqual([]);
  expect(leftovers.likes).toEqual([]);
  expect(leftovers.notifications.filter((n) => n.type === "like")).toEqual([]);
});

test("friends can like and comment, strangers cannot, and the author is notified once", async () => {
  const { t, places, maya, sam, stranger } = await world();
  await rankFirst(maya, places.kyoto, {});
  await settle(t);
  const [post] = await feedOf(sam);
  await maya.as.mutation(api.notifications.markAllRead, {});

  await sam.as.mutation(api.feed.like, { activityId: post._id });
  await sam.as.mutation(api.feed.like, { activityId: post._id });
  await sam.as.mutation(api.feed.unlike, { activityId: post._id });
  await sam.as.mutation(api.feed.like, { activityId: post._id });
  const commentId = await sam.as.mutation(api.feed.comment, { activityId: post._id, body: "  Jealous.  " });
  await expect(sam.as.mutation(api.feed.comment, { activityId: post._id, body: "   " })).rejects.toThrow(/INVALID/);

  await expect(stranger.as.mutation(api.feed.like, { activityId: post._id })).rejects.toThrow(/NOT_FOUND/);
  await expect(stranger.as.mutation(api.feed.comment, { activityId: post._id, body: "hi" })).rejects.toThrow(/NOT_FOUND/);
  await expect(stranger.as.query(api.feed.comments, { activityId: post._id, paginationOpts: firstPage })).rejects.toThrow(/NOT_FOUND/);
  await expect(stranger.as.mutation(api.feed.deleteComment, { commentId })).rejects.toThrow(/NOT_FOUND/);

  expect((await feedOf(sam))[0]).toMatchObject({ likeCount: 1, commentCount: 1, likedByViewer: true });
  const thread = await maya.as.query(api.feed.comments, { activityId: post._id, paginationOpts: firstPage });
  expect(thread.page.map((c) => [c.author.handle, c.body])).toEqual([["sam", "Jealous."]]);
  expect(await maya.as.query(api.notifications.unreadCount, {})).toBe(2);
  const inbox = await maya.as.query(api.notifications.list, { paginationOpts: firstPage });
  expect(inbox.page.slice(0, 2).map((n) => [n.type, n.actor.handle]).sort()).toEqual([["comment", "sam"], ["like", "sam"]]);

  await maya.as.mutation(api.feed.deleteComment, { commentId });
  expect((await feedOf(sam))[0]).toMatchObject({ commentCount: 0 });
});

test("friend requests and acceptances notify the other person", async () => {
  const t = setup();
  const maya = await signUp(t, "maya");
  const sam = await signUp(t, "sam");
  await maya.as.mutation(api.friends.sendRequest, { userId: sam.id });
  expect((await sam.as.query(api.notifications.list, { paginationOpts: firstPage })).page).toMatchObject([
    { type: "friend_request", actor: { handle: "maya" }, read: false },
  ]);
  const { page } = await sam.as.query(api.friends.incomingRequests, { paginationOpts: firstPage });
  await sam.as.mutation(api.friends.respondToRequest, { requestId: page[0]._id, accept: true });
  expect((await maya.as.query(api.notifications.list, { paginationOpts: firstPage })).page).toMatchObject([
    { type: "friend_accepted", actor: { handle: "sam" } },
  ]);
  expect(await maya.as.query(api.notifications.unreadCount, {})).toBe(1);
  await maya.as.mutation(api.notifications.markAllRead, {});
  expect(await maya.as.query(api.notifications.unreadCount, {})).toBe(0);
  await settle(t);
});

test("signed-out callers are refused by every feed and notification function", async () => {
  const { t, places, maya, sam } = await world();
  await rankFirst(maya, places.kyoto, {});
  await settle(t);
  const [post] = await feedOf(sam);
  const commentId = await sam.as.mutation(api.feed.comment, { activityId: post._id, body: "hi" });
  const refused = [
    t.query(api.feed.friends, { paginationOpts: firstPage }),
    t.query(api.feed.byUser, { paginationOpts: firstPage }),
    t.mutation(api.feed.setVisibility, { activityId: post._id, visibility: "private" }),
    t.mutation(api.feed.like, { activityId: post._id }),
    t.mutation(api.feed.unlike, { activityId: post._id }),
    t.mutation(api.feed.comment, { activityId: post._id, body: "hi" }),
    t.mutation(api.feed.deleteComment, { commentId }),
    t.query(api.feed.comments, { activityId: post._id, paginationOpts: firstPage }),
    t.query(api.notifications.list, { paginationOpts: firstPage }),
    t.query(api.notifications.unreadCount, {}),
    t.mutation(api.notifications.markAllRead, {}),
  ];
  for (const call of refused) await expect(call).rejects.toThrow(/UNAUTHENTICATED/);
});
