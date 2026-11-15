import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

import { fold } from "../../convex/lib/text";
import {
  assignLandmarks,
  assignTiers,
  computeNeighbors,
  haversineKm,
  pickImage,
  searchText,
  type Candidate,
  type Destination,
  type DestinationImage,
  type Kind,
} from "./lib";
import {
  admin1Names,
  commonsImageInfo,
  countryNames,
  geonamesCities,
  imageCandidates,
  OUT_DIR,
  pageviews,
  parsePoint,
  sparql,
  wikivoyageArticles,
  type WikivoyageArticle,
} from "./sources";

type Overrides = {
  destinations: { remove: string[]; rename: Record<string, string>; kind: Record<string, Kind> };
  landmarks: { remove: string[]; rename: Record<string, string>; pin: Record<string, string[]> };
};

const LANDMARK_CLASSES: [category: string, root: string][] = [
  ["place of worship", "Q1370598"],
  ["castle", "Q23413"],
  ["palace", "Q16560"],
  ["fort", "Q57821"],
  ["archaeological site", "Q839954"],
  ["bridge", "Q12280"],
  ["lighthouse", "Q39715"],
  ["monument", "Q5003624"],
  ["monument", "Q179700"],
  ["monument", "Q483453"],
  ["tower", "Q12518"],
  ["tower", "Q11303"],
  ["attraction", "Q43501"],
  ["attraction", "Q2281788"],
  ["attraction", "Q194195"],
  ["park", "Q1107656"],
  ["park", "Q22698"],
  ["square", "Q174782"],
  ["market", "Q330284"],
  ["theatre", "Q24354"],
  ["theatre", "Q153562"],
  ["cemetery", "Q39614"],
  ["beach", "Q40080"],
  ["museum", "Q33506"],
  ["monument", "Q4989906"],
  ["nature", "Q34038"],
  ["nature", "Q8502"],
  ["nature", "Q23397"],
  ["nature", "Q8072"],
  ["nature", "Q177380"],
  ["nature", "Q35509"],
  ["nature", "Q150784"],
  ["nature", "Q35666"],
  ["nature", "Q83471"],
  ["viewpoint", "Q6017969"],
  ["neighborhood", "Q123705"],
  ["neighborhood", "Q676050"],
  ["neighborhood", "Q15243209"],
  ["street", "Q79007"],
  ["attraction", "Q570116"],
];
const LISTED_CLASSES: [category: string, root: string][] = [
  ["castle", "Q751876"],
  ["historic house", "Q3947"],
  ["historic house", "Q879050"],
  ["civic building", "Q25550691"],
  ["civic building", "Q543654"],
  ["civic building", "Q7138926"],
  ["civic building", "Q3284499"],
  ["library", "Q7075"],
  ["stadium", "Q483110"],
  ["station", "Q55488"],
  ["park", "Q167346"],
  ["monument", "Q860861"],
  ["monument", "Q82117"],
  ["archaeological site", "Q109607"],
  ["nature", "Q473972"],
  ["nature", "Q23442"],
  ["nature", "Q54050"],
  ["nature", "Q39816"],
  ["nature", "Q185113"],
  ["nature", "Q4421"],
  ["nature", "Q4022"],
];
const EXCLUDED_ROOTS = ["Q43229", "Q486972", "Q56061", "Q1190554", "Q5"];
const VALUES_BATCH = 400;

const WIKIVOYAGE_KINDS: Record<string, Kind> = { city: "city", ruralarea: "region", region: "region", park: "park" };
const SPOT_CHECK: [name: string, countryCode: string][] = [
  ["Paris", "FR"], ["Kyoto", "JP"], ["Tokyo", "JP"], ["Lisbon", "PT"], ["Reykjavík", "IS"], ["Rome", "IT"],
  ["New York City", "US"], ["Barcelona", "ES"], ["Mexico City", "MX"], ["Istanbul", "TR"], ["Seoul", "KR"],
  ["Cape Town", "ZA"], ["Bangkok", "TH"], ["Buenos Aires", "AR"], ["Porto", "PT"], ["Cappadocia", "TR"],
  ["Santorini", "GR"], ["Machu Picchu", "PE"], ["Banff", "CA"], ["Hallstatt", "AT"], ["Zermatt", "CH"],
  ["London", "GB"], ["Florence", "IT"], ["Prague", "CZ"], ["Marrakech", "MA"], ["Sydney", "AU"],
  ["Rio de Janeiro", "BR"], ["Cairo", "EG"], ["Seville", "ES"], ["Vienna", "AT"], ["Bali", "ID"], ["San Francisco", "US"],
  ["Agra", "IN"], ["Siem Reap", "KH"], ["Yosemite National Park", "US"], ["Maui", "US"],
];
const LATIN_NAME = /^[\p{Script=Latin}\s'’.-]{3,40}$/u;

type Draft = Destination & { enwikiTitle?: string; voyageTitle?: string; see: Set<string> };

const overrides: Overrides = JSON.parse(readFileSync(join(import.meta.dirname, "overrides.json"), "utf8"));
const WIKIVOYAGE = "?article schema:about ?item ; schema:isPartOf <https://en.wikivoyage.org/> .";
const ENWIKI = "?page schema:about ?item ; schema:isPartOf <https://en.wikipedia.org/> ; schema:name ?title .";
const LABEL = '?item rdfs:label ?label . FILTER(LANG(?label) = "en")';

async function listedItems(ids: string[]) {
  const categories: [string, string][] = [...LANDMARK_CLASSES, ...LISTED_CLASSES];
  const roots = [...categories.map(([, root]) => root), ...EXCLUDED_ROOTS].map((id) => `wd:${id}`).join(" ");
  const rows: { row: string[]; category: string }[] = [];
  for (let i = 0; i < ids.length; i += VALUES_BATCH) {
    const values = ids.slice(i, i + VALUES_BATCH).map((id) => `wd:${id}`).join(" ");
    const [details, classes] = await Promise.all([
      sparql(
        `listed-details-${i / VALUES_BATCH}`,
        `SELECT ?item ?links ?coord ?label WHERE { VALUES ?item { ${values} } ?item wdt:P625 ?coord ; wikibase:sitelinks ?links . ${LABEL} }`,
      ),
      sparql(
        `listed-classes-${i / VALUES_BATCH}`,
        `SELECT ?item ?root WHERE { VALUES ?item { ${values} } VALUES ?root { ${roots} } ?item wdt:P31/wdt:P279* ?root }`,
      ),
    ]);
    const rootsByItem = new Map<string, Set<string>>();
    for (const [id, root] of classes) {
      const set = rootsByItem.get(id);
      if (set) set.add(root);
      else rootsByItem.set(id, new Set([root]));
    }
    for (const row of details) {
      const itemRoots = rootsByItem.get(row[0]) ?? new Set();
      const category = categories.find(([, root]) => itemRoots.has(root))?.[0];
      if (!category && EXCLUDED_ROOTS.some((root) => itemRoots.has(root))) continue;
      rows.push({ row, category: category ?? "attraction" });
    }
  }
  return rows;
}

const [cities, countries, admin1, articles] = await Promise.all([
  geonamesCities(),
  countryNames(),
  admin1Names(),
  wikivoyageArticles(),
]);

const geonamesRows = await sparql(
  "geonames-items",
  `SELECT ?item ?gn ?links ?label ?title WHERE { ?item wdt:P1566 ?gn ; wikibase:sitelinks ?links . ${ENWIKI} ${LABEL} }`,
);
const itemByGeonamesId = new Map<number, { id: string; links: number; label: string; title: string }>();
for (const [id, gn, links, label, title] of geonamesRows) {
  const current = itemByGeonamesId.get(Number(gn));
  if (!current || Number(links) > current.links) {
    itemByGeonamesId.set(Number(gn), { id, links: Number(links), label, title });
  }
}

const drafts = new Map<string, Draft>();
for (const city of cities) {
  if (city.featureCode === "PPLX") continue;
  const item = itemByGeonamesId.get(city.geonamesId);
  if (!item) continue;
  const existing = drafts.get(item.id);
  if (existing && (existing.population ?? 0) >= city.population) continue;
  drafts.set(item.id, {
    wikidataId: item.id,
    geonamesId: city.geonamesId,
    kind: "city",
    name: item.label,
    altNames: [city.name, city.asciiName, ...city.altNames.filter((n) => LATIN_NAME.test(n)).slice(0, 12)],
    countryCode: city.countryCode,
    countryName: countries.get(city.countryCode) ?? "",
    admin1: admin1.get(`${city.countryCode}.${city.admin1Code}`),
    lat: city.lat,
    lng: city.lng,
    population: city.population,
    sitelinks: item.links,
    pageviews: 0,
    voyageViews: 0,
    hasWikivoyage: false,
    popularity: 0,
    tier: 3,
    enwikiTitle: item.title,
    see: new Set(),
  });
}

const [wikivoyageRows, wikivoyageCountries, islands, sites] = await Promise.all([
  sparql(
    "wikivoyage-items",
    `SELECT ?item ?article ?links ?coord ?label ?title WHERE { ${WIKIVOYAGE} ?item wikibase:sitelinks ?links ; wdt:P625 ?coord . OPTIONAL { ${LABEL} } OPTIONAL { ${ENWIKI} } }`,
  ),
  sparql("wikivoyage-countries", `SELECT ?item ?iso WHERE { ${WIKIVOYAGE} ?item wdt:P17 ?country . ?country wdt:P297 ?iso }`),
  sparql("wikivoyage-islands", `SELECT DISTINCT ?item WHERE { ${WIKIVOYAGE} VALUES ?root { wd:Q23442 wd:Q33837 } ?item wdt:P31/wdt:P279* ?root }`),
  sparql("wikivoyage-sites", `SELECT DISTINCT ?item WHERE { ${WIKIVOYAGE} ?item wdt:P31/wdt:P279* wd:Q839954 }`),
]);
const countryByItem = new Map(wikivoyageCountries.map(([id, iso]) => [id, iso]));
const islandIds = new Set(islands.map(([id]) => id));
const siteIds = new Set(sites.map(([id]) => id));

const cityParent = (article: WikivoyageArticle) => {
  const parent = article.partOf ? articles.get(article.partOf) : undefined;
  return parent?.type === "city" && (article.type === "city" || article.type === "district") ? parent : undefined;
};
const rootArticle = (title: string) => {
  let article = articles.get(title.split("/")[0]);
  for (let hops = 0; article && hops < 4; hops++) {
    const parent = cityParent(article);
    if (!parent) break;
    article = parent;
  }
  return article;
};
const seeByArticle = new Map<string, Set<string>>();
for (const article of articles.values()) {
  const root = rootArticle(article.title)!;
  const see = seeByArticle.get(root.title);
  if (see) for (const id of article.see) see.add(id);
  else seeByArticle.set(root.title, new Set(article.see));
}

const articleTitleOf = (articleUrl: string) => decodeURIComponent(articleUrl.split("/wiki/")[1] ?? "").replace(/_/g, " ");
const districtIds = new Set<string>();
for (const [id, articleUrl, links, coord, label, title] of wikivoyageRows) {
  const articleTitle = articleTitleOf(articleUrl);
  const article = rootArticle(articleTitle);
  if (article && article.title !== articleTitle) {
    districtIds.add(id);
    continue;
  }
  const point = parsePoint(coord);
  if (!article || !point || article.type === null) continue;
  const forcedKind = overrides.destinations.kind[id];
  let kind = forcedKind ?? WIKIVOYAGE_KINDS[article.type];
  if (!kind) continue;
  if (kind === "region" && islandIds.has(id)) kind = "island";
  if (kind === "region" && article.hasRegionList && !forcedKind) continue;
  if (kind === "park" && siteIds.has(id)) kind = "site";
  const name = articleTitle.replace(/\s*\([^)]*\)$/, "");
  const see = seeByArticle.get(articleTitle) ?? new Set<string>();
  const existing = drafts.get(id);
  if (existing) {
    existing.hasWikivoyage = true;
    existing.voyageTitle = articleTitle;
    existing.altNames.unshift(existing.name);
    existing.name = name;
    for (const listed of see) existing.see.add(listed);
    continue;
  }
  const countryCode = countryByItem.get(id) ?? "";
  drafts.set(id, {
    wikidataId: id,
    kind,
    name,
    altNames: label ? [label] : [],
    countryCode,
    countryName: countries.get(countryCode) ?? "",
    lat: point.lat,
    lng: point.lng,
    sitelinks: Number(links),
    pageviews: 0,
    voyageViews: 0,
    hasWikivoyage: true,
    popularity: 0,
    tier: 3,
    enwikiTitle: title || undefined,
    voyageTitle: articleTitle,
    see: new Set(see),
  });
}
for (const id of districtIds) drafts.delete(id);

for (const id of overrides.destinations.remove) drafts.delete(id);
for (const [id, name] of Object.entries(overrides.destinations.rename)) {
  const draft = drafts.get(id);
  if (draft) draft.name = name;
}
for (const [id, kind] of Object.entries(overrides.destinations.kind)) {
  const draft = drafts.get(id);
  if (draft) draft.kind = kind;
}

const byNameAndCountry = new Map<string, Draft[]>();
for (const draft of drafts.values()) {
  const key = `${fold(draft.name)}|${draft.countryCode}`;
  const group = byNameAndCountry.get(key);
  if (group) group.push(draft);
  else byNameAndCountry.set(key, [draft]);
}
for (const group of byNameAndCountry.values()) {
  group.sort((a, b) => b.sitelinks - a.sitelinks);
  for (let i = 1; i < group.length; i++) {
    const keeper = group.slice(0, i).find((k) => drafts.has(k.wikidataId) && haversineKm(k.lat, k.lng, group[i].lat, group[i].lng) <= 30);
    if (!keeper) continue;
    const duplicate = group[i];
    keeper.hasWikivoyage ||= duplicate.hasWikivoyage;
    keeper.geonamesId ??= duplicate.geonamesId;
    keeper.population ??= duplicate.population;
    keeper.admin1 ??= duplicate.admin1;
    keeper.voyageTitle ??= duplicate.voyageTitle;
    if (duplicate.kind === "city") keeper.kind = "city";
    for (const see of duplicate.see) keeper.see.add(see);
    drafts.delete(duplicate.wikidataId);
  }
}

const destinations = [...drafts.values()];
const views = await pageviews({
  wikipedia: [
    ...cities.map((city) => itemByGeonamesId.get(city.geonamesId)?.title ?? ""),
    ...wikivoyageRows.map((row) => row[5]),
  ].filter((title) => title.length > 0),
  wikivoyage: wikivoyageRows.map(([, articleUrl]) => articleTitleOf(articleUrl)),
});
for (const d of destinations) {
  d.pageviews = (d.enwikiTitle && views.wikipedia.get(d.enwikiTitle)) || 0;
  d.voyageViews = (d.voyageTitle && views.wikivoyage.get(d.voyageTitle)) || 0;
}
assignTiers(destinations);

const unescoIds = new Set(
  (await sparql("unesco", "SELECT DISTINCT ?item WHERE { ?item wdt:P1435 wd:Q9259 }")).map(([id]) => id),
);
const removedLandmarks = new Set(overrides.landmarks.remove);
const candidates = new Map<string, Candidate>();
const addCandidate = ([id, links, coord, label]: string[], category: string) => {
  const point = parsePoint(coord);
  if (!point || candidates.has(id) || removedLandmarks.has(id)) return;
  candidates.set(id, {
    wikidataId: id,
    name: overrides.landmarks.rename[id] ?? label,
    category,
    lat: point.lat,
    lng: point.lng,
    sitelinks: Number(links),
    unesco: unescoIds.has(id),
  });
};
for (const [category, root] of LANDMARK_CLASSES) {
  const rows = await sparql(
    `landmarks-${root}`,
    `SELECT ?item ?links ?coord ?label WHERE { ?item wdt:P31/wdt:P279* wd:${root} ; wdt:P625 ?coord ; wikibase:sitelinks ?links . FILTER(?links >= 5) ${LABEL} }`,
  );
  for (const row of rows) addCandidate(row, category);
}

const seeByDestination = new Map(destinations.map((d) => [d.wikidataId, d.see]));
const pins = new Map<string, { destinationId: string; rank: number }>();
for (const [destinationId, ids] of Object.entries(overrides.landmarks.pin)) {
  ids.forEach((id, rank) => pins.set(id, { destinationId, rank }));
}
const listed = new Set<string>(pins.keys());
for (const see of seeByDestination.values()) for (const id of see) listed.add(id);
for (const { row, category } of await listedItems([...listed].filter((id) => !candidates.has(id)).sort())) {
  addCandidate(row, category);
}

const landmarks = assignLandmarks(destinations, [...candidates.values()], seeByDestination, pins);
const neighbors = computeNeighbors(destinations, landmarks);

// Photos: the destination's own image or night view, then its top landmark's image, then its Wikivoyage banner.
const ownImages = await imageCandidates(destinations.map((d) => d.wikidataId));
const imageInfo = await commonsImageInfo([...ownImages.values()].flatMap((c) => [...c.image, ...c.night, ...c.banner]));
const ownPhotos = (id: string) => [...(ownImages.get(id)?.image ?? []), ...(ownImages.get(id)?.night ?? [])];
const topLandmark = new Map<string, string>();
for (const d of destinations) {
  const top = landmarks.get(d.wikidataId)?.[0]?.wikidataId;
  if (top && pickImage(ownPhotos(d.wikidataId), [], imageInfo)?.source !== "photo") topLandmark.set(d.wikidataId, top);
}
const landmarkImages = await imageCandidates([...topLandmark.values()]);
for (const [file, info] of await commonsImageInfo([...landmarkImages.values()].flatMap((c) => c.image))) {
  imageInfo.set(file, info);
}
const images = new Map<string, { image: DestinationImage; source: "photo" | "banner" } | null>();
for (const d of destinations) {
  const landmarkPhotos = landmarkImages.get(topLandmark.get(d.wikidataId) ?? "")?.image ?? [];
  images.set(
    d.wikidataId,
    pickImage([...ownPhotos(d.wikidataId), ...landmarkPhotos], ownImages.get(d.wikidataId)?.banner ?? [], imageInfo),
  );
}

const round = (value: number) => Math.round(value * 10000) / 10000;
const jsonl = (rows: object[]) => rows.map((row) => JSON.stringify(row)).join("\n") + "\n";
writeFileSync(
  join(OUT_DIR, "destinations.jsonl"),
  jsonl(
    destinations.map((d) => ({
      wikidataId: d.wikidataId,
      geonamesId: d.geonamesId,
      kind: d.kind,
      name: d.name,
      searchText: searchText([d.name, ...d.altNames, d.admin1 ?? "", d.countryName]),
      countryCode: d.countryCode,
      countryName: d.countryName,
      admin1: d.admin1,
      lat: d.lat,
      lng: d.lng,
      population: d.population,
      popularity: round(d.popularity),
      tier: d.tier,
      landmarkCount: landmarks.get(d.wikidataId)?.length ?? 0,
      image: images.get(d.wikidataId)?.image,
    })),
  ),
);
const byId = new Map(destinations.map((d) => [d.wikidataId, d]));
const landmarkRows = [...landmarks.values()].flat();
writeFileSync(
  join(OUT_DIR, "landmarks.jsonl"),
  jsonl(
    landmarkRows.map((l) => ({
      wikidataId: l.wikidataId,
      destinationWikidataId: l.destinationWikidataId,
      name: l.name,
      searchText: searchText([l.name, byId.get(l.destinationWikidataId)!.name]),
      category: l.category,
      lat: l.lat,
      lng: l.lng,
      notability: round(l.notability),
      order: l.order,
    })),
  ),
);
writeFileSync(
  join(OUT_DIR, "neighbors.jsonl"),
  jsonl(
    [...neighbors].map(([destinationWikidataId, list]) => ({
      destinationWikidataId,
      neighbors: list.map((n) => ({ ...n, similarity: round(n.similarity) })),
    })),
  ),
);

const count = <T,>(items: T[], key: (item: T) => string | number) => {
  const totals = new Map<string | number, number>();
  for (const item of items) totals.set(key(item), (totals.get(key(item)) ?? 0) + 1);
  return [...totals].sort().map(([k, n]) => `${k}: ${n}`).join(", ");
};
const tierOne = destinations.filter((d) => d.tier === 1);
const thin = tierOne.filter((d) => (landmarks.get(d.wikidataId)?.length ?? 0) < 5);
const imageSource = (d: Destination) => images.get(d.wikidataId)?.source ?? "none";
const named = (list: Destination[]) => list.map((d) => (d.kind === "city" ? d.name : `${d.name} [${d.kind}]`)).join(", ");
const report = [
  "# Catalog build report",
  "",
  `- Destinations: ${destinations.length} (tiers ${count(destinations, (d) => d.tier)})`,
  `- Kinds: ${count(destinations, (d) => d.kind)}`,
  `- Districts folded into their city: ${districtIds.size}`,
  `- Landmarks: ${landmarkRows.length} across ${landmarks.size} destinations`,
  `- Landmark categories: ${count(landmarkRows, (l) => l.category)}`,
  `- Tier 1 destinations with fewer than 5 landmarks: ${thin.length} (${count(thin, (d) => d.kind)})`,
  `- Images, all tiers: ${count(destinations, imageSource)}`,
  `- Images, tier 1: ${count(tierOne, imageSource)}`,
  `- Tier 1 destinations without a photo: ${tierOne.filter((d) => imageSource(d) !== "photo").map((d) => d.name).join(", ") || "none"}`,
  "",
  "## Top 150 destinations",
  "",
  named(destinations.slice(0, 150)),
  "",
  "## Tier 1 destinations that are not cities",
  "",
  named(tierOne.filter((d) => d.kind !== "city")),
  "",
  "## Tier 1 destinations with fewer than 5 landmarks",
  "",
  thin.map((d) => `${d.name} (${landmarks.get(d.wikidataId)?.length ?? 0})`).join(", "),
  "",
  "## Spot check",
  "",
  "S = listed under See on Wikivoyage, U = UNESCO World Heritage Site.",
  "",
];
for (const [name, countryCode] of SPOT_CHECK) {
  const destination = destinations.find((d) => fold(d.name) === fold(name) && d.countryCode === countryCode);
  if (!destination) {
    report.push(`## ${name} (${countryCode})`, "", "**Missing from the catalog.**", "");
    continue;
  }
  report.push(
    `## ${destination.name}, ${destination.countryName}`,
    "",
    `${destination.wikidataId} · ${destination.kind} · tier ${destination.tier} · rank ${destinations.indexOf(destination) + 1} · neighbors: ${(neighbors.get(destination.wikidataId) ?? []).map((n) => `${byId.get(n.wikidataId)!.name} (${n.basis})`).join(", ")}`,
    "",
    `Image (${imageSource(destination)}): ${images.get(destination.wikidataId)?.image.url ?? "none"}`,
    "",
  );
  for (const l of landmarks.get(destination.wikidataId) ?? []) {
    report.push(`${l.order}. ${l.name} (${l.category}, ${l.sitelinks} links${l.seeListed ? ", S" : ""}${l.unesco ? ", U" : ""})`);
  }
  report.push("");
}
writeFileSync(join(OUT_DIR, "report.md"), report.join("\n"));
console.log(report.slice(0, 12).join("\n"));
