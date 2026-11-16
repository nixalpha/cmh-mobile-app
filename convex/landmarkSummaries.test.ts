import { afterEach, expect, test, vi } from "vitest";

import { api, internal } from "./_generated/api";
import { shortSummary } from "./landmarkSummaries";
import { setup, signUp, type Test } from "./test.setup";

afterEach(() => {
  vi.unstubAllGlobals();
});

async function seed(t: Test, wikidataId: string) {
  await t.mutation(internal.catalog.upsertDestinations, {
    importedAt: 1,
    rows: [{
      wikidataId: "Q90",
      kind: "city",
      name: "Paris",
      searchText: "paris",
      countryCode: "FR",
      countryName: "France",
      lat: 48.85,
      lng: 2.35,
      popularity: 0.9,
      tier: 1,
      landmarkCount: 1,
    }],
  });
  await t.mutation(internal.catalog.upsertLandmarks, {
    importedAt: 1,
    rows: [{
      wikidataId,
      destinationWikidataId: "Q90",
      name: "Eiffel Tower",
      searchText: "eiffel tower",
      category: "tower",
      lat: 48.858,
      lng: 2.294,
      notability: 9,
      order: 1,
    }],
  });
  return await t.run(async (ctx) => (await ctx.db.query("landmarks").first())!._id);
}

function stubWikimedia(responses: Record<string, unknown>) {
  const calls: string[] = [];
  vi.stubGlobal("fetch", vi.fn(async (url: string) => {
    calls.push(url);
    const host = new URL(url).host;
    return new Response(JSON.stringify(responses[host] ?? {}), { status: 200 });
  }));
  return calls;
}

test("trims an article intro to a sentence or two", () => {
  const intro =
    "The Eiffel Tower is a wrought-iron lattice tower on the Champ de Mars in Paris, France. " +
    "It is named after the engineer Gustave Eiffel, whose company designed and built the tower from 1887 to 1889. " +
    "Locally nicknamed \"La dame de fer\", it was constructed as the centerpiece of the 1889 World's Fair.";
  expect(shortSummary(intro)).toBe(
    "The Eiffel Tower is a wrought-iron lattice tower on the Champ de Mars in Paris, France. " +
    "It is named after the engineer Gustave Eiffel, whose company designed and built the tower from 1887 to 1889.",
  );
  expect(shortSummary("St. Peter's Basilica is a church in Vatican City. It is huge.")).toBe(
    "St. Peter's Basilica is a church in Vatican City. It is huge.",
  );
  expect(shortSummary("   ")).toBeNull();
  const long = shortSummary("word ".repeat(200))!;
  expect(long.length).toBeLessThanOrEqual(320);
  expect(long.endsWith("…")).toBe(true);
});

test("fetches the Wikipedia blurb once and caches it", async () => {
  const t = setup();
  const landmarkId = await seed(t, "Q243");
  const ada = await signUp(t, "ada");
  const calls = stubWikimedia({
    "www.wikidata.org": {
      entities: { Q243: {
        descriptions: { en: { value: "tower in Paris, France" } },
        sitelinks: { enwiki: { title: "Eiffel Tower", url: "https://en.wikipedia.org/wiki/Eiffel_Tower" } },
      } },
    },
    "en.wikipedia.org": {
      extract: "The Eiffel Tower is a wrought-iron lattice tower on the Champ de Mars in Paris, France.",
      content_urls: { mobile: { page: "https://en.m.wikipedia.org/wiki/Eiffel_Tower" } },
    },
  });

  expect(await ada.as.query(api.landmarkSummaries.get, { landmarkId })).toBeNull();
  await ada.as.action(api.landmarkSummaries.fetch, { landmarkId });
  expect(await ada.as.query(api.landmarkSummaries.get, { landmarkId })).toEqual({
    summary: "The Eiffel Tower is a wrought-iron lattice tower on the Champ de Mars in Paris, France.",
    wikipediaUrl: "https://en.m.wikipedia.org/wiki/Eiffel_Tower",
  });
  expect(calls[1]).toContain("/page/summary/Eiffel_Tower");

  await ada.as.action(api.landmarkSummaries.fetch, { landmarkId });
  expect(calls).toHaveLength(2);
});

test("falls back to the Wikidata description when there is no English article", async () => {
  const t = setup();
  const landmarkId = await seed(t, "Q999");
  const ada = await signUp(t, "ada");
  const calls = stubWikimedia({
    "www.wikidata.org": { entities: { Q999: { descriptions: { en: { value: "fountain in Paris" } } } } },
  });

  await ada.as.action(api.landmarkSummaries.fetch, { landmarkId });
  expect(await ada.as.query(api.landmarkSummaries.get, { landmarkId })).toEqual({
    summary: "Fountain in Paris.",
    wikipediaUrl: null,
  });
  expect(calls).toHaveLength(1);
});
