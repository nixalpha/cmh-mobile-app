import { spawn, spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { createInterface } from "node:readline";

import { seeListings } from "./lib";

export const CACHE_DIR = join(import.meta.dirname, ".cache");
export const OUT_DIR = join(import.meta.dirname, "out");
const USER_AGENT = "travi-catalog/0.1 (https://github.com/nixalpha/cmh-mobile-app)";
const SPARQL_ENDPOINT = process.env.SPARQL_ENDPOINT ?? "https://qlever.dev/api/wikidata";

const PREFIXES = `PREFIX wd: <http://www.wikidata.org/entity/>
PREFIX wdt: <http://www.wikidata.org/prop/direct/>
PREFIX wikibase: <http://wikiba.se/ontology#>
PREFIX schema: <http://schema.org/>
PREFIX rdfs: <http://www.w3.org/2000/01/rdf-schema#>
`;

mkdirSync(CACHE_DIR, { recursive: true });
mkdirSync(OUT_DIR, { recursive: true });

async function retry<T>(label: string, run: () => Promise<T>, times = 4): Promise<T> {
  for (let attempt = 1; ; attempt++) {
    try {
      return await run();
    } catch (error) {
      if (attempt >= times) throw new Error(`${label} failed after ${times} attempts: ${error}`);
      await new Promise((resolve) => setTimeout(resolve, 1500 * attempt));
    }
  }
}

async function download(name: string, url: string): Promise<string> {
  const path = join(CACHE_DIR, name);
  if (existsSync(path)) return path;
  console.log(`downloading ${url}`);
  await retry(name, async () => {
    const response = await fetch(url, { headers: { "User-Agent": USER_AGENT } });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    writeFileSync(path, Buffer.from(await response.arrayBuffer()));
  });
  return path;
}

function decodeCell(cell: string): string {
  if (cell.startsWith("<") && cell.endsWith(">")) {
    return cell.slice(1, -1).replace("http://www.wikidata.org/entity/", "");
  }
  if (cell.startsWith('"')) {
    const end = cell.lastIndexOf('"');
    return cell
      .slice(1, end)
      .replace(/\\(["\\tn])/g, (_, c) => (c === "t" ? "\t" : c === "n" ? "\n" : c));
  }
  return cell;
}

export async function sparql(name: string, query: string): Promise<string[][]> {
  const path = join(CACHE_DIR, `${name}-${createHash("sha1").update(query).digest("hex").slice(0, 8)}.tsv`);
  if (!existsSync(path)) {
    console.log(`querying ${name}`);
    const text = await retry(name, async () => {
      const response = await fetch(SPARQL_ENDPOINT, {
        method: "POST",
        headers: {
          "Content-Type": "application/sparql-query",
          Accept: "text/tab-separated-values",
          "User-Agent": USER_AGENT,
        },
        body: PREFIXES + query,
      });
      if (!response.ok) throw new Error(`HTTP ${response.status}: ${(await response.text()).slice(0, 300)}`);
      return await response.text();
    });
    writeFileSync(path, text);
  }
  return readFileSync(path, "utf8")
    .split("\n")
    .slice(1)
    .filter((line) => line.length > 0)
    .map((line) => line.split("\t").map(decodeCell));
}

export function parsePoint(point: string): { lat: number; lng: number } | null {
  const match = /POINT\(([-\d.eE]+) ([-\d.eE]+)\)/.exec(point);
  if (!match) return null;
  const lng = Number(match[1]);
  const lat = Number(match[2]);
  if (!Number.isFinite(lat) || !Number.isFinite(lng) || Math.abs(lat) > 90 || Math.abs(lng) > 180) return null;
  return { lat, lng };
}

export type GeoNamesCity = {
  geonamesId: number;
  name: string;
  asciiName: string;
  altNames: string[];
  lat: number;
  lng: number;
  featureCode: string;
  countryCode: string;
  admin1Code: string;
  population: number;
};

export async function geonamesCities(): Promise<GeoNamesCity[]> {
  const zip = await download("cities15000.zip", "https://download.geonames.org/export/dump/cities15000.zip");
  const text = spawnSync("unzip", ["-p", zip, "cities15000.txt"], { maxBuffer: 1 << 30 }).stdout.toString();
  return text
    .split("\n")
    .filter((line) => line.length > 0)
    .map((line) => {
      const f = line.split("\t");
      return {
        geonamesId: Number(f[0]),
        name: f[1],
        asciiName: f[2],
        altNames: f[3].length > 0 ? f[3].split(",") : [],
        lat: Number(f[4]),
        lng: Number(f[5]),
        featureCode: f[7],
        countryCode: f[8],
        admin1Code: f[10],
        population: Number(f[14]),
      };
    });
}

export async function countryNames(): Promise<Map<string, string>> {
  const path = await download("countryInfo.txt", "https://download.geonames.org/export/dump/countryInfo.txt");
  const names = new Map<string, string>();
  for (const line of readFileSync(path, "utf8").split("\n")) {
    if (line.startsWith("#") || line.length === 0) continue;
    const f = line.split("\t");
    names.set(f[0], f[4]);
  }
  return names;
}

export async function admin1Names(): Promise<Map<string, string>> {
  const path = await download("admin1CodesASCII.txt", "https://download.geonames.org/export/dump/admin1CodesASCII.txt");
  const names = new Map<string, string>();
  for (const line of readFileSync(path, "utf8").split("\n")) {
    const f = line.split("\t");
    if (f.length >= 2) names.set(f[0], f[1]);
  }
  return names;
}

export type WikivoyageArticle = {
  title: string;
  type: string | null;
  hasRegionList: boolean;
  partOf: string | null;
  see: string[];
};

const STATUS_TEMPLATE =
  /\{\{\s*(?:stub|outline|usable|guide|star)(city|region|country|park|district|airport|continent|continentalsection|itinerary|topic|phrasebook|diveguide|ruralarea|event|gallery)\s*[|}]/i;
const PART_OF = /\{\{\s*IsPartOf\s*\|\s*([^|}]+)/i;
function decodeEntities(text: string) {
  return text.replace(/&quot;/g, '"').replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&#039;/g, "'").replace(/&amp;/g, "&");
}

export async function wikivoyageArticles(): Promise<Map<string, WikivoyageArticle>> {
  const cachePath = join(CACHE_DIR, "wikivoyage-articles-v2.json");
  if (existsSync(cachePath)) {
    return new Map(JSON.parse(readFileSync(cachePath, "utf8")));
  }
  const dump = await download(
    "enwikivoyage-pages-articles.xml.bz2",
    "https://dumps.wikimedia.org/enwikivoyage/latest/enwikivoyage-latest-pages-articles.xml.bz2",
  );
  console.log("parsing the Wikivoyage dump");
  const articles = new Map<string, WikivoyageArticle>();
  const seeBySubpageRoot = new Map<string, Set<string>>();
  const bzcat = spawn("bzcat", [dump], { stdio: ["ignore", "pipe", "inherit"] });
  const decoder = new TextDecoder();
  let buffer = "";
  const handlePage = (page: string) => {
    if (!page.includes("<ns>0</ns>") || page.includes("<redirect ")) return;
    const titleMatch = /<title>([^<]*)<\/title>/.exec(page);
    if (!titleMatch) return;
    const title = decodeEntities(titleMatch[1]);
    const textStart = page.indexOf("<text");
    const text = decodeEntities(page.slice(textStart));
    const root = title.split("/")[0];
    const see = seeBySubpageRoot.get(root) ?? new Set<string>();
    seeBySubpageRoot.set(root, see);
    for (const id of seeListings(text)) see.add(id);
    if (title.includes("/")) return;
    articles.set(title, {
      title,
      type: STATUS_TEMPLATE.exec(text)?.[1].toLowerCase() ?? null,
      hasRegionList: /\{\{\s*regionlist/i.test(text),
      partOf: PART_OF.exec(text)?.[1].replace(/_/g, " ").trim() ?? null,
      see: [],
    });
  };
  for await (const chunk of bzcat.stdout) {
    buffer += decoder.decode(chunk, { stream: true });
    let end: number;
    while ((end = buffer.indexOf("</page>")) !== -1) {
      handlePage(buffer.slice(0, end));
      buffer = buffer.slice(end + 7);
    }
  }
  for (const article of articles.values()) {
    article.see = [...(seeBySubpageRoot.get(article.title) ?? [])];
  }
  writeFileSync(cachePath, JSON.stringify([...articles]));
  return articles;
}

export type Pageviews = { wikipedia: Map<string, number>; wikivoyage: Map<string, number> };

export async function pageviews(titles: { wikipedia: string[]; wikivoyage: string[] }): Promise<Pageviews> {
  const cachePath = join(CACHE_DIR, "pageviews-v2.json");
  if (existsSync(cachePath)) {
    const cached = JSON.parse(readFileSync(cachePath, "utf8"));
    return { wikipedia: new Map(cached.wikipedia), wikivoyage: new Map(cached.wikivoyage) };
  }
  const previous = new Date();
  previous.setUTCDate(0);
  const month =
    process.env.PAGEVIEWS_MONTH ??
    `${previous.getUTCFullYear()}-${String(previous.getUTCMonth() + 1).padStart(2, "0")}`;
  const url = `https://dumps.wikimedia.org/other/pageview_complete/monthly/${month.slice(0, 4)}/${month}/pageviews-${month.replace("-", "")}-user.bz2`;
  const titlesPath = join(CACHE_DIR, "pageview-titles.txt");
  const wanted = (wiki: string, list: string[]) => [...new Set(list)].map((title) => `${wiki} ${title.replace(/ /g, "_")}`);
  writeFileSync(
    titlesPath,
    [...wanted("en.wikipedia", titles.wikipedia), ...wanted("en.wikivoyage", titles.wikivoyage)].join("\n") + "\n",
  );
  console.log(`streaming ${url} (several GB, expect 10 to 20 minutes)`);
  const filter =
    'NR == FNR { wanted[$0] = 1; next } $1 == "en.wikipedia" || $1 == "en.wikivoyage" { if ($1 == "en.wikivoyage") last = 1; if (($1 " " $2) in wanted) print $1 "\t" $2 "\t" $5; next } last { exit }';
  const pipeline = spawn(
    "bash",
    ["-c", `curl -sfL -A "$USER_AGENT" "$DUMP_URL" | bzcat 2>/dev/null | awk '${filter}' "$TITLES" -`],
    {
      env: { ...process.env, USER_AGENT, DUMP_URL: url, TITLES: titlesPath },
      stdio: ["ignore", "pipe", "inherit"],
    },
  );
  const views: Pageviews = { wikipedia: new Map(), wikivoyage: new Map() };
  for await (const line of createInterface({ input: pipeline.stdout })) {
    const [wiki, title, total] = line.split("\t");
    const map = wiki === "en.wikivoyage" ? views.wikivoyage : views.wikipedia;
    const key = title.replace(/_/g, " ");
    map.set(key, (map.get(key) ?? 0) + Number(total));
  }
  if (views.wikipedia.size === 0 || views.wikivoyage.size === 0) throw new Error(`No pageviews read from ${url}`);
  writeFileSync(cachePath, JSON.stringify({ month, wikipedia: [...views.wikipedia], wikivoyage: [...views.wikivoyage] }));
  console.log(
    `pageviews for ${views.wikipedia.size} of ${titles.wikipedia.length} Wikipedia and ${views.wikivoyage.size} of ${titles.wikivoyage.length} Wikivoyage articles`,
  );
  return views;
}
