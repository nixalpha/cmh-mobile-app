// Mock users for local testing. Run against the dev deployment only:
//   npx convex run seed:run '{"target":"12345"}'
//   npx convex run seed:clear '{"target":"12345"}'
import { v } from "convex/values";

import { internal } from "./_generated/api";
import type { Doc, Id } from "./_generated/dataModel";
import { internalAction, internalMutation, type MutationCtx } from "./_generated/server";
import { notify, postActivity } from "./lib/activities";
import { fail } from "./lib/errors";
import { scoreForRank } from "./lib/ranking";
import { invalidateRecommendations, scheduleRecompute } from "./lib/recommendations";
import { locationFor } from "./lib/friendLocations";
import { areFriends } from "./lib/social";
import { createUnlock, deleteVisit, ensureVisit, getVisit } from "./lib/visits";

const PEOPLE = [
  { handle: "maya_chen", name: "Maya Chen", bio: "Chasing ramen and sunsets. 40 countries and counting." },
  { handle: "theo_rivers", name: "Theo Rivers", bio: "Backpacker, film photographer, bad at packing light." },
  { handle: "priya_k", name: "Priya Kapoor", bio: "Museums by day, night markets by night." },
  { handle: "lucas_m", name: "Lucas Martin", bio: "Train nerd. Will take the scenic route every time." },
  { handle: "sofia_alvarez", name: "Sofía Álvarez", bio: "Barcelona born, everywhere else raised." },
  { handle: "jamal_w", name: "Jamal Washington", bio: "Hiking boots always in the carry-on." },
  { handle: "hana_sato", name: "Hana Sato", bio: "Coffee shops, bookstores, and old temples." },
  { handle: "olivia_b", name: "Olivia Brooks", bio: "Weekend trips are a personality trait." },
  { handle: "noah_fischer", name: "Noah Fischer", bio: "Architecture and street food, in that order." },
  { handle: "amara_okafor", name: "Amara Okafor", bio: "Collecting stamps in my passport, not albums." },
  { handle: "diego_ramos", name: "Diego Ramos", bio: "Surf trips and long bus rides." },
  { handle: "elena_petrova", name: "Elena Petrova", bio: "Slow travel. One city, one month." },
];

// The last few send a friend request instead of being friends already.
const PENDING = 3;

// Locations older than LOCATION_TTL (24h) drop off the map, so the mock users "check in"
// well inside that window for as long as they exist.
const REFRESH_MS = 6 * 60 * 60 * 1000;
const DRIFT = 0.004;

const RANK_NOTES = [
  "Still thinking about the food here.",
  "Would move here tomorrow.",
  "Way better than I expected.",
  "Go in shoulder season, trust me.",
  "Walked 25k steps a day and loved every one.",
  "The light in the evening is unreal.",
  "Overhyped? Not even a little.",
  "Came for a weekend, stayed a week.",
];
const VISIT_NOTES = [
  "Got here right at opening and had it almost to ourselves.",
  "Worth every minute of the line.",
  "Photos don't do it justice.",
  "Went back twice in the same trip.",
  "Bring water and good shoes.",
  "Sunset from here was the highlight of the trip.",
];
const COMMENTS = [
  "Okay this is going on my list",
  "Jealous!!",
  "Rank seems low tbh",
  "We need to go together next time",
  "Best trip of the year?",
  "The food there is insane",
  "How long were you there?",
  "Saving this",
  "No way, I was there last month",
];

function rng(seed: string) {
  let h = 2166136261;
  for (const c of seed) h = Math.imul(h ^ c.charCodeAt(0), 16777619);
  return () => {
    h = (h + 0x6d2b79f5) | 0;
    let t = Math.imul(h ^ (h >>> 15), 1 | h);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

type Rand = () => number;
const pick = <T,>(rand: Rand, items: readonly T[]) => items[Math.floor(rand() * items.length)];
const between = (rand: Rand, lo: number, hi: number) => lo + Math.floor(rand() * (hi - lo + 1));
function sample<T>(rand: Rand, items: readonly T[], n: number) {
  const copy = [...items];
  for (let i = copy.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    [copy[i], copy[j]] = [copy[j], copy[i]];
  }
  return copy.slice(0, n);
}

async function targetUser(ctx: MutationCtx, handle: string) {
  const user = await ctx.db
    .query("users")
    .withIndex("by_handle", (q) => q.eq("handle", handle))
    .unique();
  if (user === null) fail("NOT_FOUND", `No user with handle ${handle}.`);
  return user;
}

async function befriend(ctx: MutationCtx, a: Id<"users">, b: Id<"users">) {
  if (await areFriends(ctx, a, b)) return;
  await ctx.db.insert("friendships", { userId: a, friendId: b });
  await ctx.db.insert("friendships", { userId: b, friendId: a });
  for (const id of [a, b]) {
    const user = (await ctx.db.get("users", id))!;
    await ctx.db.patch("users", id, { friendCount: user.friendCount + 1 });
  }
  await ctx.scheduler.runAfter(0, internal.feed.backfill, { ownerId: a, actorId: b });
  await ctx.scheduler.runAfter(0, internal.feed.backfill, { ownerId: b, actorId: a });
}

async function destinationPool(ctx: MutationCtx) {
  const pool: Doc<"destinations">[] = [];
  for (const tier of [1, 2]) {
    const rows = await ctx.db
      .query("destinations")
      .withIndex("by_status_and_tier_and_popularity", (q) => q.eq("status", "active").eq("tier", tier))
      .order("desc")
      .take(300);
    pool.push(...rows.filter((d) => d.landmarkCount > 0));
    if (pool.length >= 80) break;
  }
  if (pool.length < 10) fail("NOT_FOUND", "The catalog needs destinations with landmarks first.");
  return pool;
}

const photoJob = v.object({
  userId: v.id("users"),
  unlockId: v.id("landmarkUnlocks"),
  landmarkId: v.id("landmarks"),
  destinationId: v.id("destinations"),
  url: v.string(),
  width: v.number(),
  height: v.number(),
});

export const mockUsers = internalMutation({
  args: { target: v.string() },
  returns: v.object({ created: v.array(v.string()), photos: v.array(photoJob) }),
  handler: async (ctx, args) => {
    const target = await targetUser(ctx, args.target);
    const pool = await destinationPool(ctx);
    const now = Date.now();
    const thisYear = new Date(now).getUTCFullYear();
    const thisMonth = new Date(now).getUTCMonth() + 1;

    const people: { id: Id<"users">; rand: Rand; friend: boolean }[] = [];
    const created: string[] = [];
    for (const [i, person] of PEOPLE.entries()) {
      const taken = await ctx.db
        .query("users")
        .withIndex("by_handle", (q) => q.eq("handle", person.handle))
        .unique();
      if (taken !== null) continue;
      const id = await ctx.db.insert("users", {
        handle: person.handle,
        displayName: person.name,
        bio: person.bio,
        searchText: `${person.handle} ${person.name}`,
        friendCount: 0,
        onboardedAt: now,
      });
      created.push(person.handle);
      people.push({ id, rand: rng(person.handle), friend: i < PEOPLE.length - PENDING });
    }
    if (people.length === 0) return { created, photos: [] };

    // Friends with the target, plus a ring of friendships between mock users for mutuals.
    for (const [i, person] of people.entries()) {
      if (person.friend) {
        await befriend(ctx, target._id, person.id);
      } else {
        await ctx.db.insert("friendRequests", { fromId: person.id, toId: target._id });
        await notify(ctx, { userId: target._id, actorId: person.id, type: "friend_request" });
      }
      for (const step of [1, 2, 4]) {
        await befriend(ctx, person.id, people[(i + step) % people.length].id);
      }
    }

    const targetLocation = await locationFor(ctx, target._id);
    let nearbyCount = 0;
    const posts: (() => Promise<Id<"activities">>)[] = [];
    const photos: (typeof photoJob.type)[] = [];

    for (const person of people) {
      const { id: userId, rand } = person;
      const trips = sample(rand, pool, between(rand, 5, 9));

      for (const destination of trips) {
        const year = between(rand, 2018, thisYear);
        const month = between(rand, 1, year === thisYear ? thisMonth : 12);
        await ensureVisit(ctx, userId, destination, { year, month });
      }

      // The trip order doubles as the ranked list, best first.
      for (const [i, destination] of trips.entries()) {
        await ctx.db.insert("rankings", { userId, list: "destinations", itemId: destination._id, rank: i + 1 });
      }
      await ctx.db.insert("rankedLists", { userId, list: "destinations", size: trips.length, version: 1 });
      for (const i of sample(rand, [...trips.keys()], between(rand, 2, 3))) {
        const destination = trips[i];
        const note = rand() < 0.7 ? pick(rand, RANK_NOTES) : undefined;
        posts.push(() =>
          postActivity(ctx, {
            type: "ranked",
            actorId: userId,
            destinationId: destination._id,
            visibility: "friends",
            likeCount: 0,
            commentCount: 0,
            list: "destinations",
            itemId: destination._id,
            rank: i + 1,
            listSize: trips.length,
            score: scoreForRank(i + 1, trips.length),
            beatId: trips[i + 1]?._id,
            note,
            showPair: trips[i + 1] !== undefined && rand() < 0.5,
          }),
        );
      }

      // Landmark unlocks in a couple of cities, some with notes and photos.
      for (const destination of sample(rand, trips, between(rand, 1, 3))) {
        const landmarks = await ctx.db
          .query("landmarks")
          .withIndex("by_destinationId_and_status_and_order", (q) =>
            q.eq("destinationId", destination._id).eq("status", "active"),
          )
          .take(6);
        for (const landmark of sample(rand, landmarks, between(rand, 1, 2))) {
          const visit = (await getVisit(ctx, userId, destination._id))!;
          const { unlockId, unlockedCount } = await createUnlock(ctx, visit, landmark);
          const day = `${visit.year}-${String(visit.month).padStart(2, "0")}-${String(between(rand, 1, 28)).padStart(2, "0")}`;
          const note = rand() < 0.6 ? pick(rand, VISIT_NOTES) : undefined;
          await ctx.db.patch("landmarkUnlocks", unlockId, { visitedOn: day, note });
          if (destination.image && rand() < 0.6) {
            photos.push({
              userId,
              unlockId,
              landmarkId: landmark._id,
              destinationId: destination._id,
              url: destination.image.url,
              width: destination.image.width,
              height: destination.image.height,
            });
          }
          posts.push(() =>
            postActivity(ctx, {
              type: "unlocked",
              actorId: userId,
              destinationId: destination._id,
              visibility: "friends",
              likeCount: 0,
              commentCount: 0,
              landmarkId: landmark._id,
              unlockedCount,
              landmarkTotal: destination.landmarkCount,
            }),
          );
        }
      }

      // Places they want to go.
      const unvisited = pool.filter((d) => !trips.includes(d));
      for (const destination of sample(rand, unvisited, between(rand, 1, 3))) {
        await ctx.db.insert("saves", { userId, destinationId: destination._id });
        if (rand() < 0.5) {
          posts.push(() =>
            postActivity(ctx, {
              type: "saved",
              actorId: userId,
              destinationId: destination._id,
              visibility: "friends",
              likeCount: 0,
              commentCount: 0,
            }),
          );
        }
      }

      // A live location shared with the target. The first couple of friends sit a few km
      // from the target's own location (if it has one) so "nearby" has something to show;
      // everyone else is somewhere in one of their cities.
      const home = pick(rand, trips);
      const near = targetLocation !== null && person.friend && nearbyCount < 2;
      if (near) nearbyCount++;
      const spread = near ? 0.03 : 0.05;
      await ctx.db.insert("locationSettings", { userId, enabled: true, nearbyAlerts: false, cityAlerts: false });
      await ctx.db.insert("friendLocations", {
        userId,
        lat: (near ? targetLocation.lat : home.lat) + (rand() - 0.5) * spread,
        lng: (near ? targetLocation.lng : home.lng) + (rand() - 0.5) * spread,
        accuracy: 50,
        city: near ? targetLocation.city : home.name,
        countryCode: near ? targetLocation.countryCode : home.countryCode,
        updatedAt: now,
      });
      if (person.friend) await ctx.db.insert("locationShares", { userId, friendId: target._id });
      await scheduleRecompute(ctx, userId);
    }

    // Interleave posts across people so the feed doesn't come in blocks.
    const rand = rng(args.target);
    const activityIds: Id<"activities">[] = [];
    for (const post of sample(rand, posts, posts.length)) activityIds.push(await post());

    // The target's own posts get some love too.
    const ownPosts = await ctx.db
      .query("activities")
      .withIndex("by_actorId", (q) => q.eq("actorId", target._id))
      .order("desc")
      .take(10);
    activityIds.push(...ownPosts.filter((a) => a.visibility === "friends").map((a) => a._id));

    for (const activityId of activityIds) {
      const activity = (await ctx.db.get("activities", activityId))!;
      const friends = [];
      for (const other of people) {
        if (other.id !== activity.actorId && (await areFriends(ctx, other.id, activity.actorId))) {
          friends.push(other.id);
        }
      }
      const likers = sample(rand, friends, between(rand, 0, Math.min(5, friends.length)));
      const commenters = sample(rand, friends, between(rand, 0, Math.min(2, friends.length)));
      for (const userId of likers) {
        await ctx.db.insert("likes", { activityId, userId });
        await notify(ctx, { userId: activity.actorId, actorId: userId, type: "like", activityId });
      }
      for (const authorId of commenters) {
        await ctx.db.insert("comments", { activityId, authorId, body: pick(rand, COMMENTS) });
        await notify(ctx, { userId: activity.actorId, actorId: authorId, type: "comment", activityId });
      }
      await ctx.db.patch("activities", activityId, {
        likeCount: activity.likeCount + likers.length,
        commentCount: activity.commentCount + commenters.length,
      });
    }

    await invalidateRecommendations(ctx, target._id);
    await ctx.scheduler.runAfter(REFRESH_MS, internal.seed.refreshLocations, {});
    return { created, photos };
  },
});

export const refreshLocations = internalMutation({
  args: {},
  returns: v.number(),
  handler: async (ctx) => {
    const now = Date.now();
    let moved = 0;
    for (const person of PEOPLE) {
      const user = await ctx.db
        .query("users")
        .withIndex("by_handle", (q) => q.eq("handle", person.handle))
        .unique();
      const location = user && (await locationFor(ctx, user._id));
      if (!location) continue;
      await ctx.db.patch("friendLocations", location._id, {
        lat: location.lat + (Math.random() - 0.5) * DRIFT,
        lng: location.lng + (Math.random() - 0.5) * DRIFT,
        updatedAt: now,
      });
      moved++;
    }
    // The chain ends on its own once seed:clear removes the mock users.
    if (moved > 0) await ctx.scheduler.runAfter(REFRESH_MS, internal.seed.refreshLocations, {});
    return moved;
  },
});

export const attachPhoto = internalMutation({
  args: { job: photoJob, storageId: v.id("_storage") },
  returns: v.null(),
  handler: async (ctx, { job, storageId }) => {
    await ctx.db.insert("landmarkPhotos", {
      userId: job.userId,
      unlockId: job.unlockId,
      landmarkId: job.landmarkId,
      destinationId: job.destinationId,
      storageId,
      width: job.width,
      height: job.height,
      order: 0,
    });
    return null;
  },
});

export const run = internalAction({
  args: { target: v.string() },
  returns: v.object({ created: v.array(v.string()), photos: v.number(), photoFailures: v.number() }),
  handler: async (ctx, args): Promise<{ created: string[]; photos: number; photoFailures: number }> => {
    const { created, photos }: { created: string[]; photos: (typeof photoJob.type)[] } =
      await ctx.runMutation(internal.seed.mockUsers, args);
    let stored = 0;
    for (const job of photos) {
      try {
        const res = await fetch(job.url, { headers: { "User-Agent": "travi-dev-seed/1.0" } });
        if (!res.ok) continue;
        const storageId = await ctx.storage.store(await res.blob());
        await ctx.runMutation(internal.seed.attachPhoto, { job, storageId });
        stored++;
      } catch {
        // A missing photo just leaves the post text-only.
      }
    }
    return { created, photos: stored, photoFailures: photos.length - stored };
  },
});

export const clear = internalMutation({
  args: { target: v.string() },
  returns: v.array(v.string()),
  handler: async (ctx, args) => {
    const target = await targetUser(ctx, args.target);
    const removed: string[] = [];
    for (const person of PEOPLE) {
      const user = await ctx.db
        .query("users")
        .withIndex("by_handle", (q) => q.eq("handle", person.handle))
        .unique();
      if (user === null) continue;
      const userId = user._id;
      // A pending state makes scheduleRecompute a no-op, so the deletes below don't
      // queue a recompute that would write rows for a user that no longer exists.
      const state = await ctx.db
        .query("recommendationState")
        .withIndex("by_userId", (q) => q.eq("userId", userId))
        .unique();
      if (state) await ctx.db.patch("recommendationState", state._id, { pending: true });
      else await ctx.db.insert("recommendationState", { userId, pending: true });

      const friendships = await ctx.db
        .query("friendships")
        .withIndex("by_userId_and_friendId", (q) => q.eq("userId", userId))
        .take(1000);
      for (const row of friendships) {
        const back = await ctx.db
          .query("friendships")
          .withIndex("by_userId_and_friendId", (q) => q.eq("userId", row.friendId).eq("friendId", userId))
          .unique();
        if (back) await ctx.db.delete("friendships", back._id);
        await ctx.db.delete("friendships", row._id);
        const friend = await ctx.db.get("users", row.friendId);
        if (friend) await ctx.db.patch("users", friend._id, { friendCount: Math.max(0, friend.friendCount - 1) });
        await ctx.scheduler.runAfter(0, internal.feed.unlink, { ownerId: row.friendId, actorId: userId });
        await ctx.scheduler.runAfter(0, internal.feed.unlink, { ownerId: userId, actorId: row.friendId });
      }
      const requests = await ctx.db
        .query("friendRequests")
        .withIndex("by_fromId_and_toId", (q) => q.eq("fromId", userId))
        .take(100);
      for (const row of requests) await ctx.db.delete("friendRequests", row._id);

      const visits = await ctx.db.query("visits").withIndex("by_userId", (q) => q.eq("userId", userId)).take(200);
      for (const visit of visits) await deleteVisit(ctx, visit);
      const activities = await ctx.db
        .query("activities")
        .withIndex("by_actorId", (q) => q.eq("actorId", userId))
        .take(200);
      for (const activity of activities) {
        await ctx.db.delete("activities", activity._id);
        await ctx.scheduler.runAfter(0, internal.feed.cleanUpActivity, { activityId: activity._id });
      }
      const saves = await ctx.db
        .query("saves")
        .withIndex("by_userId_and_destinationId", (q) => q.eq("userId", userId))
        .take(200);
      for (const row of saves) await ctx.db.delete("saves", row._id);
      for (const list of ["destinations", "landmarks"] as const) {
        const header = await ctx.db
          .query("rankedLists")
          .withIndex("by_userId_and_list", (q) => q.eq("userId", userId).eq("list", list))
          .unique();
        if (header) await ctx.db.delete("rankedLists", header._id);
      }
      for (const table of ["locationSettings", "friendLocations", "recommendationState"] as const) {
        const row = await ctx.db.query(table).withIndex("by_userId", (q) => q.eq("userId", userId)).unique();
        if (row) await ctx.db.delete(table, row._id);
      }
      const recs = await ctx.db
        .query("recommendations")
        .withIndex("by_userId_and_score", (q) => q.eq("userId", userId))
        .take(200);
      for (const row of recs) await ctx.db.delete("recommendations", row._id);
      const shares = await ctx.db
        .query("locationShares")
        .withIndex("by_userId_and_friendId", (q) => q.eq("userId", userId))
        .take(100);
      for (const row of shares) await ctx.db.delete("locationShares", row._id);

      const inbox = await ctx.db
        .query("notifications")
        .withIndex("by_userId", (q) => q.eq("userId", userId))
        .take(1000);
      for (const row of inbox) await ctx.db.delete("notifications", row._id);

      await ctx.db.delete("users", userId);
      removed.push(person.handle);
    }

    // Likes, comments, and notifications the mock users left on the target's account.
    const gone = async (id: Id<"users">) => (await ctx.db.get("users", id)) === null;
    const own = await ctx.db
      .query("activities")
      .withIndex("by_actorId", (q) => q.eq("actorId", target._id))
      .take(200);
    for (const activity of own) {
      const likes = await ctx.db
        .query("likes")
        .withIndex("by_activityId_and_userId", (q) => q.eq("activityId", activity._id))
        .take(200);
      const comments = await ctx.db
        .query("comments")
        .withIndex("by_activityId", (q) => q.eq("activityId", activity._id))
        .take(200);
      let likeDrop = 0;
      let commentDrop = 0;
      for (const like of likes) {
        if (await gone(like.userId)) {
          await ctx.db.delete("likes", like._id);
          likeDrop++;
        }
      }
      for (const comment of comments) {
        if (await gone(comment.authorId)) {
          await ctx.db.delete("comments", comment._id);
          commentDrop++;
        }
      }
      if (likeDrop || commentDrop) {
        await ctx.db.patch("activities", activity._id, {
          likeCount: Math.max(0, activity.likeCount - likeDrop),
          commentCount: Math.max(0, activity.commentCount - commentDrop),
        });
      }
    }
    const notes = await ctx.db
      .query("notifications")
      .withIndex("by_userId", (q) => q.eq("userId", target._id))
      .take(1000);
    for (const note of notes) {
      if (await gone(note.actorId)) await ctx.db.delete("notifications", note._id);
    }
    await invalidateRecommendations(ctx, target._id);
    return removed;
  },
});
