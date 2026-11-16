import { expect, test } from "vitest";

import { api } from "./_generated/api";
import { befriend, setup, signUp } from "./test.setup";

const firstPage = { numItems: 20, cursor: null };

test("sign-up creates a profile whose handle defaults to the username", async () => {
  const t = setup();
  const alice = await signUp(t, "alice");
  const me = await alice.as.query(api.users.me, {});
  expect(me).toMatchObject({ handle: "alice", displayName: "alice", friendCount: 0, relationship: "self" });
});

test("new accounts start onboarding until they complete it", async () => {
  const t = setup();
  const alice = await signUp(t, "alice");
  expect(await alice.as.query(api.users.me, {})).toMatchObject({ onboarded: false });
  await alice.as.mutation(api.users.completeOnboarding, {});
  await alice.as.mutation(api.users.completeOnboarding, {});
  expect(await alice.as.query(api.users.me, {})).toMatchObject({ onboarded: true });
  await expect(t.mutation(api.users.completeOnboarding, {})).rejects.toThrow(/UNAUTHENTICATED/);
});

test("signed-out callers are refused everywhere", async () => {
  const t = setup();
  const alice = await signUp(t, "alice");
  expect(await t.query(api.users.me, {})).toBeNull();
  await expect(t.query(api.users.profile, { userId: alice.id })).rejects.toThrow(/UNAUTHENTICATED/);
  await expect(t.query(api.users.byHandle, { handle: "alice" })).rejects.toThrow(/UNAUTHENTICATED/);
  await expect(t.query(api.users.search, { query: "alice" })).rejects.toThrow(/UNAUTHENTICATED/);
  await expect(t.mutation(api.users.updateProfile, {})).rejects.toThrow(/UNAUTHENTICATED/);
  await expect(t.mutation(api.friends.sendRequest, { userId: alice.id })).rejects.toThrow(/UNAUTHENTICATED/);
  await expect(t.mutation(api.friends.unfriend, { userId: alice.id })).rejects.toThrow(/UNAUTHENTICATED/);
  await expect(t.mutation(api.friends.block, { userId: alice.id })).rejects.toThrow(/UNAUTHENTICATED/);
  await expect(t.mutation(api.friends.unblock, { userId: alice.id })).rejects.toThrow(/UNAUTHENTICATED/);
  await expect(t.query(api.friends.list, { paginationOpts: firstPage })).rejects.toThrow(/UNAUTHENTICATED/);
  await expect(t.query(api.friends.incomingRequests, { paginationOpts: firstPage })).rejects.toThrow(/UNAUTHENTICATED/);
  await expect(t.query(api.friends.outgoingRequests, { paginationOpts: firstPage })).rejects.toThrow(/UNAUTHENTICATED/);
});

test("handles are unique and validated", async () => {
  const t = setup();
  const alice = await signUp(t, "alice");
  await signUp(t, "bob");
  await expect(alice.as.mutation(api.users.updateProfile, { handle: "bob" })).rejects.toThrow(/CONFLICT/);
  await expect(alice.as.mutation(api.users.updateProfile, { handle: "a b" })).rejects.toThrow(/INVALID/);
  await alice.as.mutation(api.users.updateProfile, { handle: "Alice_2", displayName: "Alice Liddell" });
  expect(await alice.as.query(api.users.me, {})).toMatchObject({ handle: "alice_2", displayName: "Alice Liddell" });
});

test("a request, then an acceptance, makes both sides friends", async () => {
  const t = setup();
  const alice = await signUp(t, "alice");
  const bob = await signUp(t, "bob");

  expect(await alice.as.mutation(api.friends.sendRequest, { userId: bob.id })).toBe("requested");
  expect(await alice.as.query(api.users.profile, { userId: bob.id })).toMatchObject({ relationship: "outgoing" });
  expect(await bob.as.query(api.users.profile, { userId: alice.id })).toMatchObject({ relationship: "incoming" });
  await expect(alice.as.mutation(api.friends.sendRequest, { userId: bob.id })).rejects.toThrow(/CONFLICT/);

  const incoming = await bob.as.query(api.friends.incomingRequests, { paginationOpts: firstPage });
  expect(incoming.page).toHaveLength(1);
  expect(incoming.page[0].user.handle).toBe("alice");
  await bob.as.mutation(api.friends.respondToRequest, { requestId: incoming.page[0]._id, accept: true });

  expect(await alice.as.query(api.users.profile, { userId: bob.id })).toMatchObject({ relationship: "friends", friendCount: 1 });
  const friends = await alice.as.query(api.friends.list, { paginationOpts: firstPage });
  expect(friends.page.map((f) => f.handle)).toEqual(["bob"]);
});

test("only the recipient can answer a request and only the sender can cancel it", async () => {
  const t = setup();
  const alice = await signUp(t, "alice");
  const bob = await signUp(t, "bob");
  const carol = await signUp(t, "carol");
  await alice.as.mutation(api.friends.sendRequest, { userId: bob.id });
  const { page } = await bob.as.query(api.friends.incomingRequests, { paginationOpts: firstPage });
  const requestId = page[0]._id;

  await expect(carol.as.mutation(api.friends.respondToRequest, { requestId, accept: true })).rejects.toThrow(/NOT_FOUND/);
  await expect(alice.as.mutation(api.friends.respondToRequest, { requestId, accept: true })).rejects.toThrow(/NOT_FOUND/);
  await expect(bob.as.mutation(api.friends.cancelRequest, { requestId })).rejects.toThrow(/NOT_FOUND/);
  await alice.as.mutation(api.friends.cancelRequest, { requestId });
  expect(await bob.as.query(api.users.profile, { userId: alice.id })).toMatchObject({ relationship: "none" });
});

test("a friend list is visible to friends only", async () => {
  const t = setup();
  const alice = await signUp(t, "alice");
  const bob = await signUp(t, "bob");
  const carol = await signUp(t, "carol");
  await befriend(alice, bob);
  const seen = await bob.as.query(api.friends.list, { userId: alice.id, paginationOpts: firstPage });
  expect(seen.page.map((f) => f.handle)).toEqual(["bob"]);
  await expect(carol.as.query(api.friends.list, { userId: alice.id, paginationOpts: firstPage })).rejects.toThrow(/FORBIDDEN/);
});

test("unfriending removes both sides", async () => {
  const t = setup();
  const alice = await signUp(t, "alice");
  const bob = await signUp(t, "bob");
  await befriend(alice, bob);
  await bob.as.mutation(api.friends.unfriend, { userId: alice.id });
  expect(await alice.as.query(api.users.me, {})).toMatchObject({ friendCount: 0 });
  expect(await alice.as.query(api.users.profile, { userId: bob.id })).toMatchObject({ relationship: "none", friendCount: 0 });
  await expect(bob.as.mutation(api.friends.unfriend, { userId: alice.id })).rejects.toThrow(/NOT_FOUND/);
});

test("blocking ends the friendship and hides each person from the other", async () => {
  const t = setup();
  const alice = await signUp(t, "alice");
  const bob = await signUp(t, "bob");
  await befriend(alice, bob);
  await alice.as.mutation(api.friends.block, { userId: bob.id });

  expect(await bob.as.query(api.users.profile, { userId: alice.id })).toBeNull();
  expect(await alice.as.query(api.users.profile, { userId: bob.id })).toBeNull();
  expect(await bob.as.query(api.users.byHandle, { handle: "alice" })).toBeNull();
  expect(await bob.as.query(api.users.search, { query: "alice" })).toEqual([]);
  expect(await bob.as.query(api.users.me, {})).toMatchObject({ friendCount: 0 });
  await expect(bob.as.mutation(api.friends.sendRequest, { userId: alice.id })).rejects.toThrow(/NOT_FOUND/);

  await alice.as.mutation(api.friends.unblock, { userId: bob.id });
  expect(await bob.as.query(api.users.profile, { userId: alice.id })).toMatchObject({ relationship: "none" });
});

test('contacts match accounts by hashed phone key', async () => {
  const t = setup();
  const alice = await signUp(t, 'alice');
  const bob = await signUp(t, 'bob');
  const key = 'a'.repeat(64);
  await bob.as.mutation(api.users.setPhoneKey, { phoneKey: key });
  await expect(bob.as.mutation(api.users.setPhoneKey, { phoneKey: '4155550134' })).rejects.toThrow(/INVALID/);
  expect(await bob.as.query(api.users.me, {})).toMatchObject({ hasPhone: true });
  const matches = await alice.as.query(api.users.matchContacts, { phoneKeys: [key, 'b'.repeat(64), 'junk'] });
  expect(matches).toMatchObject([{ _id: bob.id, phoneKey: key, relationship: 'none' }]);
  expect(await bob.as.query(api.users.matchContacts, { phoneKeys: [key] })).toEqual([]);
});
