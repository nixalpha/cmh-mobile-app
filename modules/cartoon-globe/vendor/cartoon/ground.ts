import { latToMercY, lonToMercX, mercXToLon, mercYToLat, metersPerTile, ringArea } from "../globe/geo";
import { hash32 } from "./hash";
import { findJunctions, measure, pointAt, type RoadLine, sliceLine } from "./junctions";
import { type Building, pointInPolygon, TILE_BUFFER, tileBuildings } from "./model";
import { COLORS, css, KIND_HOUSE, mix, type RGB } from "./style";
import type { Polygon, Props, TileData } from "./vt";

type Ctx = OffscreenCanvasRenderingContext2D | CanvasRenderingContext2D;

const PAD = TILE_BUFFER + 1 / 256;
const GRID = 64;
const NO_DASH: number[] = [];

const COMMERCIAL = 0;
const RAILYARD = 1;
const SCHOOL = 2;
const CEMETERY = 3;
const PARK = 4;
const FARMLAND = 5;
const SAND = 6;
const ROCK = 7;
const ICE = 8;
const WETLAND = 9;
const SCRUB = 10;
const WOOD = 11;
const LAWN = 12;
const PARK_LAWN = 13;
const FLOWERBED = 14;
const PLAYGROUND = 15;
const PITCH = 16;
const WATER = 17;
const RIVER = 18;
const CANAL = 19;
const STREAM = 20;
const DITCH = 21;
const APRON = 22;
const AIRFIELD = 23;
const RUNWAY = 24;
const TAXIWAY = 25;
const BUILDING = 26;
const AERODROME = 27;
const SHELL_YARD = 28;
const SHELL_COURT = 29;
const DYNAMIC = 30;

const ZONES: Array<[number, RGB]> = [
  [AERODROME, COLORS.land],
  [COMMERCIAL, COLORS.commercial],
  [RAILYARD, COLORS.railyard],
  [SCHOOL, COLORS.school],
  [CEMETERY, COLORS.cemetery],
];
const COVER: Array<[number, RGB]> = [
  [FARMLAND, COLORS.farmland],
  [SAND, COLORS.sand],
  [ROCK, COLORS.rock],
  [ICE, COLORS.ice],
  [WETLAND, COLORS.wetland],
  [SCRUB, COLORS.scrub],
  [WOOD, COLORS.wood],
  [LAWN, COLORS.lawn],
  [PARK_LAWN, COLORS.park],
  [FLOWERBED, COLORS.flowerbed],
];
const WATERWAYS: Array<[number, number, number]> = [
  [RIVER, 14, 1.2],
  [CANAL, 8, 1],
  [STREAM, 3, 0.7],
  [DITCH, 1.5, 0.5],
];
const FLOWERS = [COLORS.hedge, COLORS.flowerPink, COLORS.flowerPurple, COLORS.flowerWhite];
const SMALL_GARDEN = 600;
const YARD_REACH = 9;
const FLOWER_CELLS = 1536;

export const RANK_AREA = 0;
export const RANK_PATH = 1;
export const RANK_TRACK = 2;
export const RANK_SERVICE = 3;
export const RANK_MINOR = 5;
export const RANK_TERTIARY = 7;
export const RANK_SECONDARY = 8;
export const RANK_PRIMARY = 9;
export const RANK_TRUNK = 10;
export const RANK_MOTORWAY = 11;
export const RANK_RAIL = 12;

const ROADS: Record<string, [rank: number, oneway: number, twoway: number, minPx: number]> = {
  motorway: [RANK_MOTORWAY, 15, 24, 1.6],
  trunk: [RANK_TRUNK, 13, 20, 1.4],
  primary: [RANK_PRIMARY, 11, 16, 1.2],
  secondary: [RANK_SECONDARY, 10, 14, 1],
  tertiary: [RANK_TERTIARY, 8, 12, 0.9],
  busway: [6, 7, 7, 0.7],
  minor: [RANK_MINOR, 7.5, 10, 0.7],
  raceway: [4, 10, 10, 0.7],
};
const PAVED = new Set(["tertiary", "minor", "secondary", "primary", "busway"]);
const SERVICE: Record<string, number> = { alley: 4, driveway: 3, parking_aisle: 5 };

export type RoadKind = "area" | "road" | "path" | "steps" | "rail" | "tram";

export interface RoadSpec {
  key: string;
  kind: RoadKind;
  cls: string;
  rank: number;
  width: number;
  minPx: number;
  oneway: boolean;
  level: number;
  colour: RGB;
  casing: boolean;
  marks: boolean;
  walk: boolean;
}

export function roadSpec(props: Props, area: boolean): RoadSpec | null {
  let cls = String(props.class ?? "");
  const construction = cls.endsWith("_construction");
  if (construction) cls = cls.slice(0, -"_construction".length);
  const layer = Number(props.layer) || 0;
  const bridge = props.brunnel === "bridge";
  if (props.brunnel === "tunnel" || (layer < 0 && !bridge) || props.indoor || props.subclass === "corridor") return null;
  const level = bridge ? Math.max(1, layer) : Math.max(0, layer);
  const oneway = props.oneway === 1 || props.oneway === -1;
  const ramp = props.ramp === 1;
  const spec: RoadSpec = { key: "", kind: "road", cls, rank: RANK_AREA, width: 0, minPx: 0, oneway, level, colour: COLORS.plaza, casing: false, marks: false, walk: false };
  if (area) {
    if (cls !== "path" && cls !== "pier" && cls !== "bridge") return null;
    spec.kind = "area";
    if (cls === "bridge") {
      spec.colour = COLORS.pavement;
      spec.level = 0;
    }
  } else if (ROADS[cls]) {
    const [rank, one, two, minPx] = ROADS[cls];
    spec.rank = rank;
    spec.width = ramp ? 7 : oneway ? one : two;
    spec.minPx = ramp ? 0.8 : minPx;
    spec.colour = rank >= RANK_TERTIARY ? COLORS.asphalt : COLORS.asphaltMinor;
    spec.casing = !construction && !ramp && PAVED.has(cls);
    spec.marks = !construction && rank >= RANK_MINOR && cls !== "busway";
    spec.walk = spec.marks && !ramp && rank <= RANK_TRUNK;
  } else if (cls === "service") {
    spec.rank = RANK_SERVICE;
    spec.width = SERVICE[String(props.service)] ?? 5;
    spec.minPx = 0.5;
    spec.colour = COLORS.asphaltMinor;
  } else if (cls === "track") {
    spec.rank = RANK_TRACK;
    spec.width = 3;
    spec.minPx = 0.4;
    spec.colour = COLORS.track;
  } else if (cls === "path" || cls === "pier") {
    spec.kind = props.subclass === "steps" ? "steps" : "path";
    spec.rank = RANK_PATH;
    spec.width = cls === "pier" ? 3 : props.subclass === "pedestrian" ? 5 : props.subclass === "platform" ? 3 : 2.2;
    spec.minPx = 0.4;
    spec.colour = cls === "pier" || props.subclass === "pedestrian" || props.subclass === "platform" ? COLORS.plaza : COLORS.footpath;
  } else if (cls === "rail" || cls === "transit") {
    spec.kind = props.subclass === "tram" || props.subclass === "light_rail" ? "tram" : "rail";
    spec.rank = RANK_RAIL;
    spec.width = props.service ? 1 : 1.4;
    spec.minPx = props.service ? 0.5 : 0.9;
    spec.colour = COLORS.rail;
  } else {
    return null;
  }
  if (construction) spec.colour = mix(spec.colour, COLORS.land, 0.55);
  spec.key = [spec.kind, cls, spec.width, spec.minPx, oneway, level, construction, spec.colour].join("|");
  return spec;
}

export interface Marking {
  offset: number;
  width: number;
  yellow: boolean;
  dash: [number, number] | null;
}

export function roadMarkings(spec: RoadSpec, americas: boolean): Marking[] {
  if (!spec.marks) return [];
  const out: Marking[] = [];
  const half = spec.width / 2;
  const divider = (offset: number) => out.push({ offset, width: 0.2, yellow: false, dash: [3, 5] });
  const motorway = spec.rank === RANK_MOTORWAY;
  if (motorway) out.push({ offset: half - 0.6, width: 0.2, yellow: false, dash: null });
  if (spec.oneway) {
    const lanes = Math.round(spec.width / 3.4);
    for (let i = 1; i < lanes; i++) {
      const offset = (i * spec.width) / lanes - half;
      if (offset > -1e-9) divider(Math.max(0, offset));
    }
  } else {
    let travel = motorway ? half - 0.6 : half;
    if (!motorway && spec.width >= 9) {
      travel = half - 2.3;
      out.push({ offset: travel, width: 0.2, yellow: false, dash: null });
    }
    if (spec.rank >= RANK_PRIMARY) {
      const lanes = Math.max(1, Math.round(travel / 3.4));
      for (let i = 1; i < lanes; i++) divider((i * travel) / lanes);
    }
    const major = spec.rank >= RANK_SECONDARY;
    if (!americas) out.push({ offset: 0, width: major ? 0.3 : 0.2, yellow: false, dash: [3, 3] });
    else if (major) out.push({ offset: 0.2, width: 0.16, yellow: true, dash: null });
    else out.push({ offset: 0, width: 0.3, yellow: true, dash: null });
  }
  return out.sort((a, b) => b.offset - a.offset);
}

function coverGroup(props: Props, squareMetres: number): number {
  const sub = String(props.subclass ?? "");
  switch (props.class) {
    case "wood":
      return WOOD;
    case "farmland":
      return FARMLAND;
    case "sand":
      return SAND;
    case "rock":
      return ROCK;
    case "ice":
      return ICE;
    case "wetland":
      return WETLAND;
    case "grass":
      if (sub === "flowerbed" || (sub === "garden" && squareMetres < SMALL_GARDEN)) return FLOWERBED;
      if (sub === "park") return PARK_LAWN;
      if (sub === "scrub" || sub === "heath" || sub === "grassland" || sub === "tundra" || sub === "fell") return SCRUB;
      return LAWN;
    default:
      return -1;
  }
}

function zoneGroup(cls: unknown): number {
  switch (cls) {
    case "pitch":
      return PITCH;
    case "playground":
      return PLAYGROUND;
    case "school":
    case "university":
    case "college":
    case "hospital":
    case "kindergarten":
    case "library":
      return SCHOOL;
    case "cemetery":
      return CEMETERY;
    case "commercial":
    case "retail":
    case "industrial":
      return COMMERCIAL;
    case "railway":
      return RAILYARD;
    default:
      return -1;
  }
}

const GREEN_PARK = /park|nature|forest|wild|reserve|preserve|recreation|conservation|watershed|game/i;
const NOT_GREEN = /histor|marine|cultur|heritage|monument/i;

interface JunctionArt {
  level: number;
  box: [number, number, number, number];
  stubs: Array<[group: number, pts: number[]]>;
  walks: number[];
}

interface Prepared {
  metre: number;
  count: number;
  geoms: Array<number[] | Polygon>;
  groups: Uint16Array;
  boxes: Float32Array;
  cellStart: Uint32Array;
  cellItems: Uint32Array;
  stamps: Uint32Array;
  stamp: number;
  buckets: number[][];
  specs: RoadSpec[];
  levels: Array<[level: number, groups: number[]]>;
  roofs: string[];
  roofOf: Uint16Array;
  roofBuckets: number[][];
  junctions: JunctionArt[] | null;
}

const cache = new WeakMap<TileData, Prepared>();

const CROOKED = { lon0: -122.4198, lon1: -122.4178, lat0: 37.8019, lat1: 37.8023 };

function inCrookedBlock(tile: TileData, line: number[]): boolean {
  if (tile.z !== 14) return false;
  const n = 2 ** tile.z;
  const x0 = lonToMercX(CROOKED.lon0) * n - tile.x;
  const x1 = lonToMercX(CROOKED.lon1) * n - tile.x;
  const y0 = latToMercY(CROOKED.lat1) * n - tile.y;
  const y1 = latToMercY(CROOKED.lat0) * n - tile.y;
  for (let i = 0; i < line.length; i += 2) if (line[i] < x0 || line[i] > x1 || line[i + 1] < y0 || line[i + 1] > y1) return false;
  return line.length >= 40;
}

export function prepareGround(tile: TileData, z: number): void {
  const prep = prepare(tile);
  if (z >= 17) junctionArt(prep);
}


function cellOf(v: number): number {
  return Math.max(0, Math.min(GRID - 1, Math.floor(((v + PAD) / (1 + 2 * PAD)) * GRID)));
}

function prepare(tile: TileData): Prepared {
  const cached = cache.get(tile);
  if (cached) return cached;
  const metre = 1 / metersPerTile(tile.z, mercYToLat((tile.y + 0.5) / 2 ** tile.z));
  const geoms: Array<number[] | Polygon> = [];
  const groupList: number[] = [];
  const boxList: number[] = [];
  const add = (group: number, geom: number[] | Polygon, ring: number[]) => {
    let x0 = Infinity;
    let y0 = Infinity;
    let x1 = -Infinity;
    let y1 = -Infinity;
    for (let i = 0; i < ring.length; i += 2) {
      if (ring[i] < x0) x0 = ring[i];
      if (ring[i] > x1) x1 = ring[i];
      if (ring[i + 1] < y0) y0 = ring[i + 1];
      if (ring[i + 1] > y1) y1 = ring[i + 1];
    }
    geoms.push(geom);
    groupList.push(group);
    boxList.push(x0, y0, x1, y1);
  };
  const { layers } = tile;

  for (const f of layers.landuse) {
    const group = zoneGroup(f.props.class);
    if (group >= 0) for (const poly of f.polys) add(group, poly, poly.outer);
  }
  for (const f of layers.park) {
    const cls = String(f.props.class ?? "");
    if (GREEN_PARK.test(cls) && !NOT_GREEN.test(cls)) for (const poly of f.polys) add(PARK, poly, poly.outer);
  }
  for (const f of layers.landcover) {
    for (const poly of f.polys) {
      const group = coverGroup(f.props, ringArea(poly.outer) / (metre * metre));
      if (group >= 0) add(group, poly, poly.outer);
    }
  }
  for (const f of layers.water) {
    if (f.props.brunnel !== "tunnel") for (const poly of f.polys) add(WATER, poly, poly.outer);
  }
  for (const f of layers.waterway) {
    if (f.props.brunnel === "tunnel") continue;
    const cls = f.props.class;
    const group = cls === "river" ? RIVER : cls === "canal" ? CANAL : cls === "drain" || cls === "ditch" ? DITCH : STREAM;
    for (const line of f.lines) add(group, line, line);
  }
  for (const f of layers.aeroway) {
    const cls = f.props.class;
    if (cls === "apron") for (const poly of f.polys) add(APRON, poly, poly.outer);
    else if (cls === "aerodrome") for (const poly of f.polys) add(AERODROME, poly, poly.outer);
    else if (cls === "runway" || cls === "taxiway" || cls === "helipad") for (const poly of f.polys) add(AIRFIELD, poly, poly.outer);
    if (cls === "runway" || cls === "taxiway") for (const line of f.lines) add(cls === "runway" ? RUNWAY : TAXIWAY, line, line);
  }

  const specs: RoadSpec[] = [];
  const byKey = new Map<string, number>();
  const groupOf = (spec: RoadSpec): number => {
    let group = byKey.get(spec.key);
    if (group === undefined) {
      group = DYNAMIC + specs.length;
      byKey.set(spec.key, group);
      specs.push(spec);
    }
    return group;
  };
  for (const f of layers.transportation) {
    if (f.polys.length) {
      const spec = roadSpec(f.props, true);
      if (spec) for (const poly of f.polys) add(groupOf(spec), poly, poly.outer);
    }
    if (f.lines.length) {
      const spec = roadSpec(f.props, false);
      if (!spec) continue;
      let brick: RoadSpec | null = null;
      for (const line of f.lines) {
        if (f.props.class === "minor" && f.props.oneway === 1 && inCrookedBlock(tile, line)) brick ??= { ...spec, width: 4.6, minPx: 1, colour: COLORS.brickRoad, marks: false, walk: false, key: spec.key + "|brick" };
        add(groupOf(brick && inCrookedBlock(tile, line) ? brick : spec), line, line);
      }
    }
  }

  const buildings = tileBuildings(tile);
  const firstBuilding = geoms.length;
  const inks = new Map<number, string>();
  const inkOf = buildings.map((b) => {
    const [r, g, bl] = b.style.roof;
    const key = (Math.round(r / 6) << 16) | (Math.round(g / 6) << 8) | Math.round(bl / 6);
    let ink = inks.get(key);
    if (!ink) inks.set(key, (ink = css([Math.min(255, Math.round(r / 6) * 6), Math.min(255, Math.round(g / 6) * 6), Math.min(255, Math.round(bl / 6) * 6)])));
    return ink;
  });
  const roofs = [...inks.values()].sort();
  const roofIndex = new Map(roofs.map((c, i) => [c, i]));
  const whole = new Set<number[]>();
  for (const b of buildings) {
    geoms.push(b);
    groupList.push(BUILDING);
    boxList.push(b.box[0], b.box[1], b.box[2], b.box[3]);
    if (!b.clipped) whole.add(b.outer);
  }
  for (const f of layers.building) {
    const height = Number(f.props.render_height) || 6;
    const minHeight = Math.max(0, Number(f.props.render_min_height) || 0);
    if (f.props.hide_3d !== true && (minHeight > 0 || height < 0.5)) continue;
    for (const poly of f.polys) if (!whole.has(poly.outer)) add(height > 24 ? SHELL_COURT : SHELL_YARD, poly, poly.outer);
  }

  const count = geoms.length;
  const boxes = new Float32Array(boxList);
  const roofOf = new Uint16Array(count);
  for (let i = 0; i < buildings.length; i++) roofOf[firstBuilding + i] = roofIndex.get(inkOf[i])!;
  const cellStart = new Uint32Array(GRID * GRID + 1);
  for (let i = 0; i < count; i++) {
    const cx1 = cellOf(boxes[i * 4 + 2]);
    const cy1 = cellOf(boxes[i * 4 + 3]);
    for (let cy = cellOf(boxes[i * 4 + 1]); cy <= cy1; cy++) for (let cx = cellOf(boxes[i * 4]); cx <= cx1; cx++) cellStart[cy * GRID + cx + 1]++;
  }
  for (let c = 0; c < GRID * GRID; c++) cellStart[c + 1] += cellStart[c];
  const cellItems = new Uint32Array(cellStart[GRID * GRID]);
  const fill = cellStart.slice(0, GRID * GRID);
  for (let i = 0; i < count; i++) {
    const cx1 = cellOf(boxes[i * 4 + 2]);
    const cy1 = cellOf(boxes[i * 4 + 3]);
    for (let cy = cellOf(boxes[i * 4 + 1]); cy <= cy1; cy++) for (let cx = cellOf(boxes[i * 4]); cx <= cx1; cx++) cellItems[fill[cy * GRID + cx]++] = i;
  }

  const levels: Array<[number, number[]]> = [];
  const order = specs.map((_, i) => i).sort((a, b) => specs[a].level - specs[b].level || specs[a].rank - specs[b].rank || specs[a].width - specs[b].width || (specs[a].key < specs[b].key ? -1 : 1));
  if (!order.length || specs[order[0]].level > 0) levels.push([0, []]);
  for (const i of order) {
    if (!levels.length || levels[levels.length - 1][0] !== specs[i].level) levels.push([specs[i].level, []]);
    levels[levels.length - 1][1].push(DYNAMIC + i);
  }

  const prep: Prepared = {
    metre,
    count,
    geoms,
    groups: new Uint16Array(groupList),
    boxes,
    cellStart,
    cellItems,
    stamps: new Uint32Array(count),
    stamp: 0,
    buckets: Array.from({ length: DYNAMIC + specs.length }, () => []),
    specs,
    levels,
    roofs,
    roofOf,
    roofBuckets: roofs.map(() => []),
    junctions: null,
  };
  cache.set(tile, prep);
  return prep;
}

function collect(prep: Prepared, x0: number, y0: number, x1: number, y1: number): void {
  const { buckets, groups, boxes } = prep;
  for (const bucket of buckets) bucket.length = 0;
  if (x0 <= -PAD && y0 <= -PAD && x1 >= 1 + PAD && y1 >= 1 + PAD) {
    for (let i = 0; i < prep.count; i++) buckets[groups[i]].push(i);
    return;
  }
  const stamp = ++prep.stamp;
  const cx0 = cellOf(x0);
  const cx1 = cellOf(x1);
  const cy1 = cellOf(y1);
  for (let cy = cellOf(y0); cy <= cy1; cy++) {
    for (let cx = cx0; cx <= cx1; cx++) {
      const end = prep.cellStart[cy * GRID + cx + 1];
      for (let k = prep.cellStart[cy * GRID + cx]; k < end; k++) {
        const i = prep.cellItems[k];
        if (prep.stamps[i] === stamp) continue;
        prep.stamps[i] = stamp;
        if (boxes[i * 4] <= x1 && boxes[i * 4 + 2] >= x0 && boxes[i * 4 + 1] <= y1 && boxes[i * 4 + 3] >= y0) buckets[groups[i]].push(i);
      }
    }
  }
}

const BAR = 0.6;
const BAR_GAP = 0.6;
const BAR_LENGTH = 3;

function junctionArt(prep: Prepared): JunctionArt[] {
  if (prep.junctions) return prep.junctions;
  const m = prep.metre;
  const lines: RoadLine[] = [];
  const owner: number[] = [];
  for (let i = 0; i < prep.count; i++) {
    const group = prep.groups[i];
    if (group < DYNAMIC) continue;
    const spec = prep.specs[group - DYNAMIC];
    if (!spec.marks) continue;
    lines.push({ pts: prep.geoms[i] as number[], halfWidth: (spec.width * m) / 2, level: spec.level });
    owner.push(group);
  }
  const cums = new Map<number, Float64Array>();
  const out: JunctionArt[] = [];
  for (const junction of findJunctions(lines, 1.2 * m)) {
    const art: JunctionArt = { level: junction.level, box: [junction.x, junction.y, junction.x, junction.y], stubs: [], walks: [] };
    let reach = 0;
    for (const arm of junction.arms) {
      const spec = prep.specs[owner[arm.line] - DYNAMIC];
      let widest = 0;
      let setback = 0;
      let twin = false;
      for (const other of junction.arms) {
        if (other === arm) continue;
        const dot = arm.dx * other.dx + arm.dy * other.dy;
        const sin = Math.abs(arm.dx * other.dy - arm.dy * other.dx);
        widest = Math.max(widest, other.halfWidth);
        if (dot > 0.85) twin = true;
        if (sin >= 0.4) setback = Math.max(setback, Math.min(other.halfWidth / sin, other.halfWidth * 2.5));
      }
      const crossed = setback > 0;
      if (!crossed) setback = widest;
      const centre = setback + (BAR_LENGTH / 2 + 0.4) * m;
      const walk = crossed && !twin && spec.walk && arm.length >= 2 * centre + m;
      const length = Math.min(arm.length, walk ? centre + (BAR_LENGTH / 2 + 0.5) * m : setback + 0.5 * m);
      const pts = lines[arm.line].pts;
      let cum = cums.get(arm.line);
      if (!cum) cums.set(arm.line, (cum = measure(pts)));
      const stub = sliceLine(pts, cum, arm.at, arm.at + arm.dir * length);
      const back = Math.hypot(stub[2] - stub[0], stub[3] - stub[1]);
      if (back > 0) stub.unshift(stub[0] - ((stub[2] - stub[0]) / back) * m, stub[1] - ((stub[3] - stub[1]) / back) * m);
      art.stubs.push([owner[arm.line], stub]);
      reach = Math.max(reach, length + arm.halfWidth + m);
      if (!walk) continue;
      const usable = 2 * arm.halfWidth - 0.8 * m;
      const bars = Math.floor((usable + BAR_GAP * m) / ((BAR + BAR_GAP) * m));
      if (bars < 2) continue;
      const span = (bars * BAR + (bars - 1) * BAR_GAP) * m;
      const [px, py, tx, ty] = pointAt(pts, cum, arm.at + arm.dir * centre);
      art.walks.push(px + (ty * span) / 2, py - (tx * span) / 2, px - (ty * span) / 2, py + (tx * span) / 2);
    }
    art.box = [junction.x - reach, junction.y - reach, junction.x + reach, junction.y + reach];
    out.push(art);
  }
  return (prep.junctions = out);
}

function traceLine(ctx: Ctx, line: number[], skip: number): void {
  let x = line[0];
  let y = line[1];
  ctx.moveTo(x, y);
  const last = line.length - 2;
  for (let i = 2; i < last; i += 2) {
    const dx = line[i] - x;
    const dy = line[i + 1] - y;
    if (dx * dx + dy * dy < skip) continue;
    ctx.lineTo((x = line[i]), (y = line[i + 1]));
  }
  ctx.lineTo(line[last], line[last + 1]);
}

function tracePoly(ctx: Ctx, poly: Polygon, skip: number): void {
  traceLine(ctx, poly.outer, skip);
  ctx.closePath();
  for (const hole of poly.holes) {
    traceLine(ctx, hole, skip);
    ctx.closePath();
  }
}

export function paintGround(ctx: Ctx, tile: TileData, z: number, x: number, y: number, size: number): void {
  const prep = prepare(tile);
  const { geoms, buckets, specs } = prep;
  const k = 2 ** (z - tile.z);
  const scale = size * k;
  const px = 1 / scale;
  const x0 = x / k - tile.x;
  const y0 = y / k - tile.y;
  const m = 1 / metersPerTile(tile.z, mercYToLat((y + 0.5) / 2 ** z));
  const lon = mercXToLon((x + 0.5) / 2 ** z);
  const americas = lon < -30 && lon > -170;
  const pixels = (metres: number) => metres * m * scale;
  const span = (metres: number, minPx = 0) => Math.max(metres * m, minPx * px);
  const reach = 28 * m + 6 * px;
  const vx0 = x0 - reach;
  const vy0 = y0 - reach;
  const vx1 = x0 + 1 / k + reach;
  const vy1 = y0 + 1 / k + reach;
  collect(prep, vx0, vy0, vx1, vy1);

  const fine = (0.35 * px) ** 2;
  const coarse = z > tile.z ? fine : px * px;
  const fill = (ids: number[], colour: RGB | string, skip = fine) => {
    if (!ids.length) return;
    ctx.beginPath();
    for (const id of ids) tracePoly(ctx, geoms[id] as Polygon, skip);
    ctx.fillStyle = typeof colour === "string" ? colour : css(colour);
    ctx.fill();
  };
  const pen = (colour: RGB, width: number, dash: number[], cap: CanvasLineCap, join: CanvasLineJoin) => {
    const thin = width * scale < 3.5;
    ctx.strokeStyle = css(colour);
    ctx.lineWidth = width;
    ctx.lineCap = thin ? "butt" : cap;
    ctx.lineJoin = thin ? "bevel" : join;
    ctx.setLineDash(dash);
    ctx.stroke();
  };
  const stroke = (ids: number[], colour: RGB, width: number, dash: number[] = NO_DASH, cap: CanvasLineCap = "round") => {
    if (!ids.length) return;
    ctx.beginPath();
    for (const id of ids) traceLine(ctx, geoms[id] as number[], fine);
    pen(colour, width, dash, cap, "round");
  };
  const outline = (ids: number[], colour: RGB, width: number) => {
    if (!ids.length) return;
    ctx.beginPath();
    for (const id of ids) tracePoly(ctx, geoms[id] as Polygon, fine);
    pen(colour, width, NO_DASH, "butt", "miter");
  };

  ctx.save();
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.globalAlpha = 1;
  ctx.globalCompositeOperation = "source-over";
  ctx.shadowColor = "transparent";
  ctx.fillStyle = css(COLORS.land);
  ctx.fillRect(0, 0, size, size);
  ctx.setTransform(scale, 0, 0, scale, -x0 * scale, -y0 * scale);

  const footprints: number[] = [];
  const hollow: number[] = [];
  const grounded: number[] = [];
  if (z >= 13) {
    const yards: number[] = [];
    const courts: number[] = [];
    for (const id of buckets[BUILDING]) {
      const b = geoms[id] as Building;
      if (b.outline) hollow.push(id);
      else if (b.minHeight <= 0) grounded.push(id);
      else continue;
      if (b.clipped) continue;
      footprints.push(id);
      (b.style.kind === KIND_HOUSE ? yards : courts).push(id);
    }
    for (const id of buckets[SHELL_YARD]) {
      yards.push(id);
      footprints.push(id);
    }
    for (const id of buckets[SHELL_COURT]) {
      courts.push(id);
      footprints.push(id);
    }
    if (z >= 15) {
      const loose = Math.max(px, 1.2 * m) ** 2;
      for (const [ids, colour] of [[yards, COLORS.yard], [courts, COLORS.pavement]] as Array<[number[], RGB]>) {
        if (!ids.length) continue;
        ctx.beginPath();
        for (const id of ids) tracePoly(ctx, geoms[id] as Polygon, loose);
        pen(colour, span(2 * YARD_REACH), NO_DASH, "butt", "round");
      }
    }
  }

  for (const [group, colour] of ZONES) fill(buckets[group], colour);
  ctx.globalAlpha = 0.16;
  fill(buckets[PARK], COLORS.park);
  ctx.globalAlpha = 1;
  for (const [group, colour] of COVER) if (group !== FLOWERBED || z < 15) fill(buckets[group], colour);
  fill(buckets[PLAYGROUND], COLORS.playground);
  fill(buckets[PITCH], COLORS.pitch);
  if (z >= 17) outline(buckets[PITCH], COLORS.laneWhite, span(0.25, 1));

  const water = buckets[WATER];
  fill(water, COLORS.water);
  if (z >= 15 && water.length) {
    ctx.save();
    ctx.clip();
    ctx.strokeStyle = css(COLORS.waterEdge);
    ctx.lineWidth = span(6, 3);
    ctx.stroke();
    ctx.restore();
  }
  for (const [group, metres, minPx] of WATERWAYS) stroke(buckets[group], COLORS.water, span(metres, minPx));

  fill(buckets[APRON], COLORS.apron);
  fill(buckets[AIRFIELD], COLORS.taxiway);
  stroke(buckets[TAXIWAY], COLORS.taxiway, span(18, 0.8));
  if (pixels(18) >= 8) stroke(buckets[TAXIWAY], COLORS.laneYellow, span(0.4, 1));
  stroke(buckets[RUNWAY], COLORS.runway, span(45, 1.6), NO_DASH, "butt");
  if (pixels(45) >= 6) stroke(buckets[RUNWAY], COLORS.laneWhite, span(0.9, 1), [30 * m, 30 * m], "butt");


  const close = z >= 17;
  for (const [level, groups] of prep.levels) {
    const cap: CanvasLineCap = level > 0 ? "butt" : "round";
    for (const group of groups) {
      const spec = specs[group - DYNAMIC];
      if (spec.kind === "area") fill(buckets[group], spec.colour);
    }
    const surface = (group: number) => {
      const spec = specs[group - DYNAMIC];
      const ids = buckets[group];
      if (!ids.length) return;
      const fade = spec.rank >= RANK_TERTIARY ? 1 : Math.max(0, Math.min(1, (pixels(spec.width) / spec.minPx - 0.25) / 0.5));
      if (fade <= 0.02) return;
      ctx.globalAlpha = fade;
      if (spec.kind === "rail" || spec.kind === "tram") {
        stroke(ids, spec.colour, spec.kind === "tram" ? span(0.4, 0.7) : span(spec.width, spec.minPx), NO_DASH, cap);
        if (spec.kind === "rail" && pixels(1) >= 1.5) stroke(ids, spec.colour, span(spec.width * 2.2), [0.4 * m, 1.1 * m], "butt");
      } else {
        stroke(ids, spec.colour, span(spec.width, spec.minPx), NO_DASH, cap);
        if (spec.kind === "steps" && pixels(1) >= 3) stroke(ids, mix(spec.colour, COLORS.brick, 0.28), span(spec.width), [0.3 * m, 0.5 * m], "butt");
      }
      ctx.globalAlpha = 1;
    };
    for (const group of groups) if (specs[group - DYNAMIC].rank === RANK_PATH) surface(group);
    if (z >= 15) {
      for (const group of groups) {
        const spec = specs[group - DYNAMIC];
        if (spec.casing) stroke(buckets[group], COLORS.pavement, span(spec.width + 6), NO_DASH, cap);
        else if (level > 0 && spec.kind === "road") stroke(buckets[group], COLORS.pavement, span(spec.width + 1.2), NO_DASH, cap);
      }
    }
    if (close) {
      for (const group of groups) {
        const spec = specs[group - DYNAMIC];
        if (spec.casing) stroke(buckets[group], COLORS.kerb, span(spec.width) + 2 * span(0.3, 0.9), NO_DASH, cap);
      }
    }
    if (level === 0 && z >= 15 && buckets[FLOWERBED].length) {
      ctx.save();
      ctx.beginPath();
      for (const id of buckets[FLOWERBED]) tracePoly(ctx, geoms[id] as Polygon, fine);
      ctx.clip();
      ctx.fillStyle = css(COLORS.flowerbed);
      ctx.fill();
      if (close) sprinkle(ctx, tile, prep, vx0, vy0, vx1, vy1, span(0.34, 0.75));
      ctx.beginPath();
      for (const id of buckets[FLOWERBED]) tracePoly(ctx, geoms[id] as Polygon, fine);
      ctx.strokeStyle = css(COLORS.hedge);
      ctx.lineWidth = span(2.6, 1.2);
      ctx.lineJoin = "round";
      ctx.stroke();
      for (const group of groups) if (specs[group - DYNAMIC].rank === RANK_PATH) surface(group);
      ctx.restore();
    }
    for (const group of groups) {
      const rank = specs[group - DYNAMIC].rank;
      if (rank > RANK_PATH && rank < RANK_RAIL) surface(group);
    }
    if (close) {
      for (const group of groups) {
        const spec = specs[group - DYNAMIC];
        const ids = buckets[group];
        if (!ids.length) continue;
        for (const mark of roadMarkings(spec, americas)) {
          const line = span(mark.width, 1.1);
          const colour = mark.yellow ? COLORS.laneYellow : COLORS.laneWhite;
          const dash = mark.dash ? [mark.dash[0] * m, mark.dash[1] * m] : NO_DASH;
          const inner = 2 * mark.offset * m - line;
          stroke(ids, colour, mark.offset > 0 ? 2 * mark.offset * m + line : line, dash, "butt");
          if (inner * scale >= 0.8) stroke(ids, spec.colour, inner, NO_DASH, "butt");
        }
      }
      const stubs = new Map<number, number[][]>();
      const walks: number[] = [];
      for (const art of junctionArt(prep)) {
        if (art.level !== level || art.box[0] > vx1 || art.box[2] < vx0 || art.box[1] > vy1 || art.box[3] < vy0) continue;
        for (const [group, pts] of art.stubs) {
          const list = stubs.get(group);
          if (list) list.push(pts);
          else stubs.set(group, [pts]);
        }
        for (const v of art.walks) walks.push(v);
      }
      for (const group of groups) {
        const list = stubs.get(group);
        if (!list) continue;
        const spec = specs[group - DYNAMIC];
        ctx.beginPath();
        for (const pts of list) traceLine(ctx, pts, 0);
        pen(spec.colour, span(spec.width, spec.minPx), NO_DASH, "butt", "round");
      }
      if (walks.length) {
        ctx.beginPath();
        for (let i = 0; i < walks.length; i += 4) {
          ctx.moveTo(walks[i], walks[i + 1]);
          ctx.lineTo(walks[i + 2], walks[i + 3]);
        }
        pen(COLORS.laneWhite, BAR_LENGTH * m, [BAR * m, BAR_GAP * m], "butt", "round");
      }
    }
    for (const group of groups) if (specs[group - DYNAMIC].rank === RANK_RAIL) surface(group);
  }

  if (z >= 13) {
    if (z >= 15) {
      ctx.shadowColor = `rgba(${COLORS.shadow[0]},${COLORS.shadow[1]},${COLORS.shadow[2]},0.45)`;
      ctx.shadowBlur = pixels(3.2);
    }
    fill(z >= 15 ? footprints : hollow, COLORS.pavement);
    ctx.shadowColor = "transparent";
    ctx.shadowBlur = 0;
    for (const bucket of prep.roofBuckets) bucket.length = 0;
    for (const id of grounded) prep.roofBuckets[prep.roofOf[id]].push(id);
    prep.roofBuckets.forEach((ids, i) => fill(ids, prep.roofs[i], coarse));
  }
  ctx.restore();
}

function sprinkle(ctx: Ctx, tile: TileData, prep: Prepared, vx0: number, vy0: number, vx1: number, vy1: number, radius: number): void {
  const beds = prep.buckets[FLOWERBED];
  if (!beds.length) return;
  const n = FLOWER_CELLS * 2 ** (14 - tile.z);
  const dots: number[][] = FLOWERS.map(() => []);
  for (const id of beds) {
    const bed = prep.geoms[id] as Polygon;
    const i0 = Math.floor(Math.max(vx0, prep.boxes[id * 4]) * n);
    const i1 = Math.floor(Math.min(vx1, prep.boxes[id * 4 + 2]) * n);
    const j0 = Math.floor(Math.max(vy0, prep.boxes[id * 4 + 1]) * n);
    const j1 = Math.floor(Math.min(vy1, prep.boxes[id * 4 + 3]) * n);
    if ((i1 - i0 + 1) * (j1 - j0 + 1) > 40000) continue;
    for (let j = j0; j <= j1; j++) {
      for (let i = i0; i <= i1; i++) {
        const gx = tile.x * n + i;
        const gy = tile.y * n + j;
        const h = hash32(gx, gy);
        const clump = hash32(gx >> 2, (gy >> 2) + 0x5bd1);
        const shrub = h % 100 < 14;
        if (!shrub && (h >>> 7) % 100 >= ((clump & 7) < 4 ? 72 : 6)) continue;
        const dx = (i + 0.15 + (((h >>> 8) & 255) / 255) * 0.7) / n;
        const dy = (j + 0.15 + (((h >>> 16) & 255) / 255) * 0.7) / n;
        if (!pointInPolygon(bed, dx, dy)) continue;
        const size = radius * (0.8 + ((h >>> 4) & 15) / 30);
        if (shrub) dots[0].push(dx, dy, size * 2.4);
        else dots[1 + (((h >>> 24) & 3) === 0 ? (h >>> 26) % 3 : (clump >>> 8) % 3)].push(dx, dy, size);
      }
    }
  }
  dots.forEach((list, c) => {
    if (!list.length) return;
    ctx.beginPath();
    for (let i = 0; i < list.length; i += 3) {
      ctx.moveTo(list[i] + list[i + 2], list[i + 1]);
      ctx.arc(list[i], list[i + 1], list[i + 2], 0, Math.PI * 2);
    }
    ctx.fillStyle = css(FLOWERS[c]);
    ctx.fill();
  });
}
