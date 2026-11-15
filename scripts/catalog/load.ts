import { readFileSync } from "node:fs";
import { join } from "node:path";

import { ConvexHttpClient } from "convex/browser";
import { makeFunctionReference } from "convex/server";

import { OUT_DIR } from "./sources";

const url = process.env.CONVEX_URL ?? process.env.EXPO_PUBLIC_CONVEX_URL;
const deployKey = process.env.CONVEX_DEPLOY_KEY;
if (!url || !deployKey) {
  throw new Error("Set CONVEX_URL (or EXPO_PUBLIC_CONVEX_URL) and CONVEX_DEPLOY_KEY.");
}
const retire = process.argv.includes("--retire");
const maxTier = Number(process.argv.find((arg) => arg.startsWith("--max-tier="))?.split("=")[1] ?? 3);
if (retire && maxTier < 3) throw new Error("--retire needs the full catalog; drop --max-tier.");

const client = new ConvexHttpClient(url);
(client as unknown as { setAdminAuth(token: string): void }).setAdminAuth(deployKey);
const call = (name: string, args: Record<string, unknown>) =>
  client.mutation(makeFunctionReference<"mutation">(name), args);

const read = <T,>(file: string): T[] =>
  readFileSync(join(OUT_DIR, file), "utf8")
    .split("\n")
    .filter((line) => line.length > 0)
    .map((line) => JSON.parse(line));

async function inBatches<T>(label: string, rows: T[], size: number, send: (batch: T[]) => Promise<unknown>) {
  const batches: T[][] = [];
  for (let i = 0; i < rows.length; i += size) batches.push(rows.slice(i, i + size));
  let next = 0;
  let done = 0;
  const worker = async () => {
    while (next < batches.length) {
      const batch = batches[next++];
      await send(batch);
      done += batch.length;
      if (done % (size * 20) < size) console.log(`${label}: ${done}/${rows.length}`);
    }
  };
  await Promise.all(Array.from({ length: 4 }, worker));
  console.log(`${label}: ${rows.length} loaded`);
}

const importedAt = Date.now();
const destinations = read<{ wikidataId: string; tier: number }>("destinations.jsonl").filter((d) => d.tier <= maxTier);
const kept = new Set(destinations.map((d) => d.wikidataId));
const landmarks = read<{ destinationWikidataId: string }>("landmarks.jsonl").filter((l) => kept.has(l.destinationWikidataId));
const neighbors = read<{ destinationWikidataId: string }>("neighbors.jsonl").filter((n) => kept.has(n.destinationWikidataId));

await inBatches("destinations", destinations, 100, (rows) => call("catalog:upsertDestinations", { importedAt, rows }));
await inBatches("landmarks", landmarks, 100, (rows) => call("catalog:upsertLandmarks", { importedAt, rows }));
await inBatches("neighbors", neighbors, 20, (rows) => call("catalog:replaceNeighbors", { rows }));

if (retire) {
  for (const table of ["landmarks", "destinations"]) {
    let total = 0;
    for (;;) {
      const result = (await call("catalog:retireStale", { table, importedBefore: importedAt })) as {
        retired: number;
        done: boolean;
      };
      total += result.retired;
      if (result.done) break;
    }
    console.log(`${table}: ${total} retired`);
  }
}
