import { fold } from "../../convex/lib/text";

export type Kind = "city" | "region" | "island" | "park" | "site";

export type Destination = {
  wikidataId: string;
  geonamesId?: number;
  kind: Kind;
  name: string;
  altNames: string[];
  countryCode: string;
  countryName: string;
  admin1?: string;
  lat: number;
  lng: number;
  population?: number;
  sitelinks: number;
  pageviews: number;
  voyageViews: number;
  hasWikivoyage: boolean;
  popularity: number;
  tier: number;
};

export type Candidate = {
  wikidataId: string;
  name: string;
  category: string;
  lat: number;
  lng: number;
  sitelinks: number;
  unesco: boolean;
};

export type Landmark = Candidate & {
  destinationWikidataId: string;
  seeListed: boolean;
  notability: number;
  order: number;
};

export type Neighbor = {
  wikidataId: string;
  similarity: number;
  basis: "nearby" | "similar";
};

export const TIER_1_SIZE = 1500;
export const TIER_2_SIZE = 8500;
const MAX_SEE_DISTANCE_KM = 80;
const NATURE_REACH = 2;
const DUPLICATE_DISTANCE_KM = 0.15;

export function haversineKm(aLat: number, aLng: number, bLat: number, bLng: number) {
  const rad = Math.PI / 180;
  const dLat = (bLat - aLat) * rad;
  const dLng = (bLng - aLng) * rad;
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(aLat * rad) * Math.cos(bLat * rad) * Math.sin(dLng / 2) ** 2;
  return 12742 * Math.asin(Math.min(1, Math.sqrt(h)));
}

export class Grid<T extends { lat: number; lng: number }> {
  private cells = new Map<string, T[]>();

  constructor(private cellDeg: number, items: T[]) {
    for (const item of items) {
      const key = this.key(item.lat, item.lng);
      const cell = this.cells.get(key);
      if (cell) cell.push(item);
      else this.cells.set(key, [item]);
    }
  }

  private key(lat: number, lng: number) {
    return `${Math.floor(lat / this.cellDeg)}:${Math.floor(lng / this.cellDeg)}`;
  }

  near(lat: number, lng: number, radiusKm: number): { item: T; km: number }[] {
    const dLat = radiusKm / 111;
    const dLng = radiusKm / (111 * Math.max(0.1, Math.cos((lat * Math.PI) / 180)));
    const found: { item: T; km: number }[] = [];
    for (let y = Math.floor((lat - dLat) / this.cellDeg); y <= Math.floor((lat + dLat) / this.cellDeg); y++) {
      for (let x = Math.floor((lng - dLng) / this.cellDeg); x <= Math.floor((lng + dLng) / this.cellDeg); x++) {
        for (const item of this.cells.get(`${y}:${x}`) ?? []) {
          const km = haversineKm(lat, lng, item.lat, item.lng);
          if (km <= radiusKm) found.push({ item, km });
        }
      }
    }
    return found;
  }
}

export function radiusKm(destination: Pick<Destination, "kind" | "population">) {
  switch (destination.kind) {
    case "site":
      return 5;
    case "park":
      return 30;
    case "island":
    case "region":
      return 40;
    case "city": {
      const population = destination.population ?? 0;
      if (population >= 5_000_000) return 25;
      if (population >= 1_000_000) return 18;
      if (population >= 200_000) return 12;
      return 8;
    }
  }
}

export function landmarkLimit(tier: number) {
  return tier === 1 ? 12 : 8;
}

const CATEGORY_ADJUSTMENT: Record<string, number> = { neighborhood: -1, street: -0.5 };

export function notability(candidate: Candidate, seeListed: boolean) {
  return (
    Math.log2(1 + candidate.sitelinks) +
    (seeListed ? 1 : 0) +
    (candidate.unesco ? 1 : 0) +
    (CATEGORY_ADJUSTMENT[candidate.category] ?? 0)
  );
}

export function assignTiers(destinations: Destination[]) {
  const scaled = (pick: (d: Destination) => number) => {
    const max = Math.log1p(Math.max(1, ...destinations.map(pick)));
    return (d: Destination) => Math.log1p(pick(d)) / max;
  };
  const links = scaled((d) => d.sitelinks);
  const views = scaled((d) => d.pageviews);
  const voyageViews = scaled((d) => d.voyageViews);
  for (const d of destinations) {
    d.popularity = 0.25 * links(d) + 0.25 * views(d) + 0.5 * voyageViews(d);
  }
  destinations.sort((a, b) => b.popularity - a.popularity || a.wikidataId.localeCompare(b.wikidataId));
  destinations.forEach((d, i) => {
    d.tier = i < TIER_1_SIZE ? 1 : i < TIER_1_SIZE + TIER_2_SIZE ? 2 : 3;
  });
}

function sharesNameToken(a: string, b: string) {
  const tokens = new Set(fold(a).split(" ").filter((t) => t.length >= 4));
  return fold(b).split(" ").some((t) => tokens.has(t));
}

export function assignLandmarks(
  destinations: Destination[],
  candidates: Candidate[],
  seeByDestination: Map<string, Set<string>>,
  pins: Map<string, { destinationId: string; rank: number }> = new Map(),
): Map<string, Landmark[]> {
  const byId = new Map(destinations.map((d) => [d.wikidataId, d]));
  const grid = new Grid(0.5, destinations);
  const seeListers = new Map<string, Destination[]>();
  for (const [destinationId, landmarkIds] of seeByDestination) {
    const destination = byId.get(destinationId);
    if (!destination) continue;
    for (const id of landmarkIds) {
      const list = seeListers.get(id);
      if (list) list.push(destination);
      else seeListers.set(id, [destination]);
    }
  }

  const assigned = new Map<string, Landmark[]>();
  for (const candidate of candidates) {
    if (byId.has(candidate.wikidataId)) continue;
    const listers = (seeListers.get(candidate.wikidataId) ?? [])
      .map((d) => ({ item: d, km: haversineKm(candidate.lat, candidate.lng, d.lat, d.lng) }))
      .filter((l) => l.km <= MAX_SEE_DISTANCE_KM)
      .sort((a, b) => a.km - b.km);
    const seeListed = listers.length > 0;
    const pin = pins.get(candidate.wikidataId);
    const pinnedOwner = pin && byId.get(pin.destinationId);

    let owner = pinnedOwner ?? listers[0]?.item;
    if (!owner) {
      const reach = candidate.category === "nature" ? NATURE_REACH : 1;
      owner = grid
        .near(candidate.lat, candidate.lng, 40 * NATURE_REACH)
        .filter((c) => c.km <= radiusKm(c.item) * reach)
        .map((c) => c.item)
        .sort((a, b) => b.popularity - a.popularity)[0];
    }
    if (!owner) continue;

    const landmark = {
      ...candidate,
      destinationWikidataId: owner.wikidataId,
      seeListed,
      notability: notability(candidate, seeListed) + (pin && pinnedOwner ? 100 - pin.rank : 0),
      order: 0,
    };
    const list = assigned.get(owner.wikidataId);
    if (list) list.push(landmark);
    else assigned.set(owner.wikidataId, [landmark]);
  }

  for (const [destinationId, list] of assigned) {
    list.sort((a, b) => b.notability - a.notability || a.wikidataId.localeCompare(b.wikidataId));
    const kept: Landmark[] = [];
    const limit = landmarkLimit(byId.get(destinationId)!.tier);
    for (const landmark of list) {
      if (kept.length >= limit) break;
      const duplicate = kept.some(
        (k) =>
          haversineKm(k.lat, k.lng, landmark.lat, landmark.lng) <= DUPLICATE_DISTANCE_KM &&
          sharesNameToken(k.name, landmark.name),
      );
      if (!duplicate) kept.push(landmark);
    }
    kept.forEach((landmark, i) => (landmark.order = i + 1));
    assigned.set(destinationId, kept);
  }
  return assigned;
}

function cosine(a: Map<string, number>, b: Map<string, number>) {
  let dot = 0;
  let aa = 0;
  let bb = 0;
  for (const [key, value] of a) {
    aa += value * value;
    dot += value * (b.get(key) ?? 0);
  }
  for (const value of b.values()) bb += value * value;
  return aa === 0 || bb === 0 ? 0 : dot / Math.sqrt(aa * bb);
}

export function computeNeighbors(
  destinations: Destination[],
  landmarks: Map<string, Landmark[]>,
): Map<string, Neighbor[]> {
  const eligible = destinations.filter((d) => d.tier <= 2);
  const grid = new Grid(2, eligible);
  const tierOne = eligible.filter((d) => d.tier === 1);
  const profiles = new Map<string, Map<string, number>>();
  for (const d of eligible) {
    const profile = new Map<string, number>([[`kind:${d.kind}`, 2]]);
    for (const landmark of landmarks.get(d.wikidataId) ?? []) {
      profile.set(landmark.category, (profile.get(landmark.category) ?? 0) + 1);
    }
    profiles.set(d.wikidataId, profile);
  }

  const result = new Map<string, Neighbor[]>();
  for (const d of eligible) {
    const nearby = grid
      .near(d.lat, d.lng, 400)
      .filter((n) => n.item.wikidataId !== d.wikidataId)
      .filter((n) => !(n.item.kind === "region" && n.km <= radiusKm(n.item)))
      .map((n) => ({
        wikidataId: n.item.wikidataId,
        similarity:
          Math.exp(-n.km / 400) *
          n.item.popularity ** 2 *
          (n.item.countryCode === d.countryCode ? 1 : 0.9),
        basis: "nearby" as const,
      }))
      .sort((a, b) => b.similarity - a.similarity)
      .slice(0, 8);
    const taken = new Set(nearby.map((n) => n.wikidataId));
    const profile = profiles.get(d.wikidataId)!;
    const similar = tierOne
      .filter((n) => n.wikidataId !== d.wikidataId && !taken.has(n.wikidataId))
      .filter((n) => haversineKm(d.lat, d.lng, n.lat, n.lng) > 400)
      .map((n) => ({
        wikidataId: n.wikidataId,
        similarity: cosine(profile, profiles.get(n.wikidataId)!) * n.popularity,
        basis: "similar" as const,
      }))
      .sort((a, b) => b.similarity - a.similarity)
      .slice(0, 4);
    result.set(d.wikidataId, [...nearby, ...similar]);
  }
  return result;
}

export function searchText(parts: string[], maxLength = 300) {
  const seen = new Set<string>();
  const kept: string[] = [];
  let length = 0;
  for (const part of parts) {
    const folded = fold(part);
    if (folded.length === 0 || seen.has(folded)) continue;
    if (length + folded.length + 1 > maxLength) break;
    seen.add(folded);
    kept.push(folded);
    length += folded.length + 1;
  }
  return kept.join(" ");
}

const LISTING_START = /\{\{\s*(see|listing|marker)\s*\|/gi;
const MAX_LISTING_LENGTH = 6000;

export function seeListings(text: string): string[] {
  const ids: string[] = [];
  for (const match of text.matchAll(LISTING_START)) {
    const limit = Math.min(text.length - 1, match.index + MAX_LISTING_LENGTH);
    let depth = 0;
    let end = match.index;
    for (; end < limit; end++) {
      if (text[end] === "{" && text[end + 1] === "{") {
        depth++;
        end++;
      } else if (text[end] === "}" && text[end + 1] === "}") {
        depth--;
        end++;
        if (depth === 0) break;
      }
    }
    const listing = text.slice(match.index, end);
    if (match[1].toLowerCase() !== "see" && !/\|\s*type\s*=\s*see\b/i.test(listing)) continue;
    const id = /\|\s*wikidata\s*=\s*(Q\d+)/i.exec(listing)?.[1];
    if (id) ids.push(id);
  }
  return ids;
}
