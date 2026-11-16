import { v } from "convex/values";

import { internal } from "./_generated/api";
import type { Id } from "./_generated/dataModel";
import { action, internalMutation, internalQuery, query, type QueryCtx } from "./_generated/server";
import { requireUser } from "./lib/auth";
import { fail } from "./lib/errors";

const USER_AGENT = "travi/0.1 (https://github.com/nixalpha/cmh-mobile-app)";
// Stop adding sentences once the blurb is this long, and never show more than the cap.
const SUMMARY_TARGET = 140;
const SUMMARY_CAP = 320;

const summaryValidator = v.object({
  summary: v.union(v.string(), v.null()),
  wikipediaUrl: v.union(v.string(), v.null()),
});
type Summary = typeof summaryValidator.type;

/** The cached blurb for a landmark, or null when nobody has fetched it yet. */
export const get = query({
  args: { landmarkId: v.id("landmarks") },
  returns: v.union(summaryValidator, v.null()),
  handler: async (ctx, args) => {
    await requireUser(ctx);
    const row = await findSummary(ctx.db, args.landmarkId);
    return row === null ? null : { summary: row.summary, wikipediaUrl: row.wikipediaUrl };
  },
});

/** Fetches the blurb from Wikidata and Wikipedia and caches it. `get` updates once it lands. */
export const fetch = action({
  args: { landmarkId: v.id("landmarks") },
  returns: v.null(),
  handler: async (ctx, args) => {
    if ((await ctx.auth.getUserIdentity()) === null) fail("UNAUTHENTICATED", "Sign in to continue.");
    const landmark: { wikidataId: string; cached: boolean } | null =
      await ctx.runQuery(internal.landmarkSummaries.lookup, args);
    if (landmark === null) fail("NOT_FOUND", "Landmark not found.");
    if (landmark.cached) return null;
    const summary = await fetchSummary(landmark.wikidataId);
    await ctx.runMutation(internal.landmarkSummaries.store, { landmarkId: args.landmarkId, ...summary });
    return null;
  },
});

export const lookup = internalQuery({
  args: { landmarkId: v.id("landmarks") },
  returns: v.union(v.object({ wikidataId: v.string(), cached: v.boolean() }), v.null()),
  handler: async (ctx, args) => {
    const landmark = await ctx.db.get("landmarks", args.landmarkId);
    if (landmark === null) return null;
    const row = await findSummary(ctx.db, args.landmarkId);
    return { wikidataId: landmark.wikidataId, cached: row !== null };
  },
});

export const store = internalMutation({
  args: { landmarkId: v.id("landmarks"), summary: v.union(v.string(), v.null()), wikipediaUrl: v.union(v.string(), v.null()) },
  returns: v.null(),
  handler: async (ctx, { landmarkId, summary, wikipediaUrl }) => {
    const existing = await findSummary(ctx.db, landmarkId);
    const fields = { summary, wikipediaUrl, fetchedAt: Date.now() };
    if (existing === null) await ctx.db.insert("landmarkSummaries", { landmarkId, ...fields });
    else await ctx.db.patch("landmarkSummaries", existing._id, fields);
    return null;
  },
});

async function findSummary(db: QueryCtx["db"], landmarkId: Id<"landmarks">) {
  return await db.query("landmarkSummaries").withIndex("by_landmarkId", (q) => q.eq("landmarkId", landmarkId)).unique();
}

async function getJson(url: string): Promise<unknown> {
  const response = await globalThis.fetch(url, { headers: { "User-Agent": USER_AGENT, Accept: "application/json" } });
  if (!response.ok) throw new Error(`Wikimedia returned ${response.status} for ${url}`);
  return await response.json();
}

type WikidataEntities = {
  entities?: Record<string, {
    descriptions?: { en?: { value?: string } };
    sitelinks?: { enwiki?: { title?: string; url?: string } };
  }>;
};
type WikipediaPage = { extract?: string; content_urls?: { mobile?: { page?: string }; desktop?: { page?: string } } };

/** Looks up the English Wikipedia article for a Wikidata item and trims its intro to a blurb. */
export async function fetchSummary(wikidataId: string): Promise<Summary> {
  if (!/^Q\d+$/.test(wikidataId)) return { summary: null, wikipediaUrl: null };
  const entities = await getJson(
    `https://www.wikidata.org/w/api.php?action=wbgetentities&ids=${wikidataId}&props=descriptions%7Csitelinks%2Furls&languages=en&sitefilter=enwiki&format=json`,
  ) as WikidataEntities;
  const item = entities.entities?.[wikidataId];
  const description = item?.descriptions?.en?.value?.trim();
  const fallback = description ? description[0].toUpperCase() + description.slice(1) + "." : null;
  const article = item?.sitelinks?.enwiki;
  if (!article?.title) return { summary: fallback, wikipediaUrl: null };

  const slug = encodeURIComponent(article.title.replaceAll(" ", "_"));
  const page = await getJson(`https://en.wikipedia.org/api/rest_v1/page/summary/${slug}?redirect=true`) as WikipediaPage;
  return {
    summary: shortSummary(page.extract ?? "") ?? fallback,
    wikipediaUrl: page.content_urls?.mobile?.page ?? article.url ?? `https://en.wikipedia.org/wiki/${slug}`,
  };
}

/** The first sentence or two of an article intro, cut at a word if it runs long. */
export function shortSummary(extract: string): string | null {
  const text = extract.replace(/\s+/g, " ").trim();
  if (text.length === 0) return null;
  // Short fragments such as "St." merge into the next piece because we keep going until the target length.
  const sentences = text.split(/(?<=[.!?])\s+(?=[A-Z0-9"“(])/);
  let summary = "";
  for (const sentence of sentences) {
    summary = summary ? `${summary} ${sentence}` : sentence;
    if (summary.length >= SUMMARY_TARGET) break;
  }
  if (summary.length <= SUMMARY_CAP) return summary;
  const cut = summary.slice(0, SUMMARY_CAP - 1);
  return `${cut.slice(0, cut.lastIndexOf(" ")).replace(/[,;:\s]+$/, "")}…`;
}
