# For You recommendations

For You learns from recorded destination visits, including unranked visits and
visits collected automatically. Rankings strengthen preferences; they are not a
prerequisite. The implementation is in `convex/recommendations.ts` and
`convex/lib/recommendationScoring.ts`.

## History and candidate retrieval

- Read up to 1,000 recently recorded visits and retain favorites from the top 40
  destination rankings even when they fall outside that history window.
- Select the 40 strongest visit sources. A source's weight combines recency,
  rank, and landmark exploration. The recency boost has a three-year half-life
  and a floor, so older trips still matter. Undated visits get neutral recency;
  newly importing a dated old trip does not turn it into a recent trip.
- Retrieve up to 12 catalog neighbors per source. The catalog's neighbor graph
  uses landmark-category profiles for similarity and geographic distance for
  nearby destinations; see `scripts/catalog/lib.ts`.
- Include popular destinations across three catalog tiers and up to 30 places
  of each visited destination type. This supplies candidates for places without
  neighbor data and finds parks/islands outside the global top destinations.
- Supplement with the top five rankings and ten saves of up to 100 friends.

Hydration is bounded to the top 240 candidate IDs plus the popularity/type
candidate pool. Exact indexed visit/save checks exclude previously visited or
saved destinations even when those lists exceed the initial read windows.
Retired destinations are excluded.

## Scoring and diversity

Normalize each neighbor similarity by its source weight. Use the strongest match
plus 25% of the next three matches, capped at one. Matching several past visits
therefore beats an otherwise comparable match to just one visit. When graph
evidence is weak or missing, use a weaker destination-type/country/proximity
match. Distance alone has limited influence.

Before diversity adjustment, a history match scores
`1 + 2 * historyAffinity + 0.15 * socialAffinity + 0.05 * popularity`.
Without a history match it scores
`0.4 * socialAffinity + 0.05 * popularity`.
Social signals saturate as friend counts grow; popularity is clamped to `[0, 1]`.
These weights prioritize travel history while allowing social signals to break
ties and popular places to fill gaps.

Greedily select up to 30 recommendations, reducing the remaining candidates'
scores for repeated countries, source visits, and destination types. A country
can occupy at most four slots. Persist adjusted scores so the feed's database
order preserves this diversity. Each personal recommendation identifies its
strongest source visit and the number of supporting visit matches.

## Updates and validation

Visit, ranking, save, and landmark-unlock changes schedule a recomputation with
a five-second debounce. Reads immediately hide newly visited/saved/retired
destinations and explanations whose source visit was removed. New sessions
refresh caches older than 12 hours. An algorithm version forces older caches to
refresh after scoring changes, while accepting existing stored reason formats.

`convex/recommendations.test.ts` covers cold starts, unranked visits, different
user histories, multi-visit evidence, ranking and recency influence, missing
neighbor data, exclusion, removal, diversity, authentication, and cache upgrades.
The weights are initial product choices; evaluating recommendation quality with
real usage is the next step for tuning them.
