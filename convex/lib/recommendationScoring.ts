import type { Doc, Id } from "../_generated/dataModel";
import { distanceKm } from "./geo";

export const ALGORITHM_VERSION = 2;
const YEAR_MS = 365.25 * 24 * 60 * 60 * 1000;
const clamp = (value: number) => Math.max(0, Math.min(1, value));

export type VisitSource = {
  destination: Doc<"destinations">;
  weight: number;
};
type Match = {
  weight: number;
  sourceId: Id<"destinations">;
  basis: "nearby" | "similar";
};
export type CandidateSignals = {
  topFriends: Id<"users">[];
  wantCount: number;
  matches: Match[];
};
export type ScoredDestination = {
  destination: Doc<"destinations">;
  score: number;
  reason: Doc<"recommendations">["reason"];
};

/** An undated visit is neutral; importing an old trip must not make it recent. */
export function visitWeight(visit: Doc<"visits">, rank: number | undefined, now: number) {
  const age = visit.year === undefined
    ? null
    : Math.max(0, now - Date.UTC(visit.year, (visit.month ?? 6) - 1, 15));
  const recency = age === null ? 0.8 : 0.65 + 0.35 * 2 ** (-age / (3 * YEAR_MS));
  const favorite = rank === undefined ? 0 : 0.8 / Math.log2(rank + 1);
  const engagement = Math.min(0.3, 0.075 * Math.log2(1 + visit.unlockCount));
  return recency + favorite + engagement;
}

export function scoreDestination(
  destination: Doc<"destinations">,
  signals: CandidateSignals,
  sources: VisitSource[],
): ScoredDestination {
  // Keep personal, social and popularity signals bounded. Popularity or a large
  // friend network must never swamp actual evidence from the user's travels.
  const matches = signals.matches.filter((m) => m.weight > 0)
    .sort((a, b) => b.weight - a.weight || a.sourceId.localeCompare(b.sourceId));
  const graphScore = clamp((matches[0]?.weight ?? 0) + 0.25 * matches.slice(1, 4).reduce((sum, m) => sum + m.weight, 0));
  let fallback: Match | null = null;
  for (const source of sources) {
    const km = distanceKm(destination, source.destination);
    const sameKind = destination.kind === source.destination.kind;
    const sameCountry = destination.countryCode !== "" && destination.countryCode === source.destination.countryCode;
    // For destinations without catalog neighbors, use weaker type/geographic
    // affinity. Distance alone says little about what someone enjoys.
    const affinity = (sameKind ? 0.24 : 0) + (sameCountry ? 0.1 : 0) + (km <= 400 ? 0.1 * Math.exp(-km / 400) : 0);
    const weight = affinity * source.weight / 2.1;
    if (fallback === null || weight > fallback.weight) {
      fallback = { weight, sourceId: source.destination._id, basis: km <= 400 ? "nearby" : "similar" };
    }
  }
  const historyScore = Math.max(graphScore, fallback?.weight ?? 0);
  const socialScore = 0.7 * (1 - 2 ** (-signals.topFriends.length)) + 0.3 * (1 - 2 ** (-signals.wantCount));
  const quality = 0.05 * clamp(destination.popularity);
  if (historyScore > 0) {
    const useGraph = graphScore >= (fallback?.weight ?? 0);
    const strongest = useGraph ? matches[0] : fallback!;
    return {
      destination,
      score: 1 + 2 * historyScore + 0.15 * socialScore + quality,
      reason: {
        kind: "visited_similar",
        sourceId: strongest.sourceId,
        sourceCount: useGraph ? new Set(matches.map((m) => m.sourceId)).size : 1,
        basis: strongest.basis,
      },
    };
  }
  const reason: Doc<"recommendations">["reason"] = signals.topFriends.length > 0
    ? { kind: "friends_top", count: signals.topFriends.length, friendIds: signals.topFriends.slice(0, 3) }
    : signals.wantCount > 0
      ? { kind: "friends_want", count: signals.wantCount }
      : { kind: "popular" };
  return { destination, score: 0.4 * socialScore + quality, reason };
}

/** Greedy diversity reranking; persist the adjusted scores so read order agrees. */
export function diversify(candidates: ScoredDestination[], limit: number, maxPerCountry: number) {
  const remaining = [...candidates];
  const kept: ScoredDestination[] = [];
  const countries = new Map<string, number>();
  const kinds = new Map<string, number>();
  const sources = new Map<string, number>();
  while (kept.length < limit && remaining.length > 0) {
    let bestIndex = -1;
    let bestScore = -Infinity;
    for (const [index, row] of remaining.entries()) {
      const countryCount = countries.get(row.destination.countryCode) ?? 0;
      if (countryCount >= maxPerCountry) continue;
      const sourceCount = row.reason.kind === "visited_similar" ? sources.get(row.reason.sourceId) ?? 0 : 0;
      const adjusted = row.score / (1 + 0.12 * countryCount + 0.08 * sourceCount + 0.03 * (kinds.get(row.destination.kind) ?? 0));
      if (adjusted > bestScore) {
        bestIndex = index;
        bestScore = adjusted;
      }
    }
    if (bestIndex === -1) break;
    const [row] = remaining.splice(bestIndex, 1);
    kept.push({ ...row, score: bestScore });
    countries.set(row.destination.countryCode, (countries.get(row.destination.countryCode) ?? 0) + 1);
    kinds.set(row.destination.kind, (kinds.get(row.destination.kind) ?? 0) + 1);
    if (row.reason.kind === "visited_similar") sources.set(row.reason.sourceId, (sources.get(row.reason.sourceId) ?? 0) + 1);
  }
  return kept;
}
