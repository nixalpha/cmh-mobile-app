/// <reference types="vite/client" />
import { registerCore, sessionIdentity } from "@convex-dev/auth/test";
import { registerPassword } from "@convex-dev/auth/components/password/test";
import { registerUsername } from "@convex-dev/auth/components/username/test";
import { convexTest } from "convex-test";

import { api } from "./_generated/api";
import schema from "./schema";

const modules = import.meta.glob("./**/*.ts");

export function setup() {
  const t = convexTest(schema, modules);
  registerCore(t);
  registerPassword(t);
  registerUsername(t);
  return t;
}

export type Test = ReturnType<typeof setup>;

export async function signUp(t: Test, username: string) {
  const result = await t.mutation(api.auth.signUpWithUsernamePassword, {
    username,
    password: "correct horse battery staple",
  });
  if (result.status !== "complete") {
    throw new Error(`Sign-up failed for ${username}`);
  }
  const as = t.withIdentity(sessionIdentity(result.tokens));
  await as.mutation(api.users.updateProfile, {});
  const me = await as.query(api.users.me, {});
  if (me === null) throw new Error("Signed-up user has no profile");
  return { as, id: me._id };
}

export async function befriend(
  a: Awaited<ReturnType<typeof signUp>>,
  b: Awaited<ReturnType<typeof signUp>>,
) {
  await a.as.mutation(api.friends.sendRequest, { userId: b.id });
  await b.as.mutation(api.friends.sendRequest, { userId: a.id });
}
