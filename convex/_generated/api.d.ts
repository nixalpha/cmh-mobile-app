/* eslint-disable */
/**
 * Generated `api` utility.
 *
 * THIS CODE IS AUTOMATICALLY GENERATED.
 *
 * To regenerate, run `npx convex dev`.
 * @module
 */

import type * as auth from "../auth.js";
import type * as autoVisits from "../autoVisits.js";
import type * as catalog from "../catalog.js";
import type * as crons from "../crons.js";
import type * as destinations from "../destinations.js";
import type * as feed from "../feed.js";
import type * as friendLocations from "../friendLocations.js";
import type * as friends from "../friends.js";
import type * as landmarkVisits from "../landmarkVisits.js";
import type * as landmarks from "../landmarks.js";
import type * as lib_activities from "../lib/activities.js";
import type * as lib_auth from "../lib/auth.js";
import type * as lib_errors from "../lib/errors.js";
import type * as lib_friendLocations from "../lib/friendLocations.js";
import type * as lib_geo from "../lib/geo.js";
import type * as lib_lists from "../lib/lists.js";
import type * as lib_ranking from "../lib/ranking.js";
import type * as lib_recommendations from "../lib/recommendations.js";
import type * as lib_social from "../lib/social.js";
import type * as lib_text from "../lib/text.js";
import type * as lib_visits from "../lib/visits.js";
import type * as locationPush from "../locationPush.js";
import type * as notifications from "../notifications.js";
import type * as places from "../places.js";
import type * as rankings from "../rankings.js";
import type * as recommendations from "../recommendations.js";
import type * as users from "../users.js";

import type {
  ApiFromModules,
  FilterApi,
  FunctionReference,
} from "convex/server";

declare const fullApi: ApiFromModules<{
  auth: typeof auth;
  autoVisits: typeof autoVisits;
  catalog: typeof catalog;
  crons: typeof crons;
  destinations: typeof destinations;
  feed: typeof feed;
  friendLocations: typeof friendLocations;
  friends: typeof friends;
  landmarkVisits: typeof landmarkVisits;
  landmarks: typeof landmarks;
  "lib/activities": typeof lib_activities;
  "lib/auth": typeof lib_auth;
  "lib/errors": typeof lib_errors;
  "lib/friendLocations": typeof lib_friendLocations;
  "lib/geo": typeof lib_geo;
  "lib/lists": typeof lib_lists;
  "lib/ranking": typeof lib_ranking;
  "lib/recommendations": typeof lib_recommendations;
  "lib/social": typeof lib_social;
  "lib/text": typeof lib_text;
  "lib/visits": typeof lib_visits;
  locationPush: typeof locationPush;
  notifications: typeof notifications;
  places: typeof places;
  rankings: typeof rankings;
  recommendations: typeof recommendations;
  users: typeof users;
}>;

/**
 * A utility for referencing Convex functions in your app's public API.
 *
 * Usage:
 * ```js
 * const myFunctionReference = api.myModule.myFunction;
 * ```
 */
export declare const api: FilterApi<
  typeof fullApi,
  FunctionReference<any, "public">
>;

/**
 * A utility for referencing Convex functions in your app's internal API.
 *
 * Usage:
 * ```js
 * const myFunctionReference = internal.myModule.myFunction;
 * ```
 */
export declare const internal: FilterApi<
  typeof fullApi,
  FunctionReference<any, "internal">
>;

export declare const components: {
  auth: import("@convex-dev/auth/_generated/component.js").ComponentApi<"auth">;
  authPassword: import("@convex-dev/auth/components/password/_generated/component.js").ComponentApi<"authPassword">;
  authUsername: import("@convex-dev/auth/components/username/_generated/component.js").ComponentApi<"authUsername">;
};
