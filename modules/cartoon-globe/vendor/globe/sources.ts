export interface ImageryLayer {
  id: string;
  name: string;
  description: string;
  maxZoom: number;
  url: (z: number, x: number, y: number) => string;
  load?: (z: number, x: number, y: number, signal?: AbortSignal) => Promise<ImageBitmap>;
  attribution: string;
  shade: number;
}

const sub = (x: number, y: number) => "abc"[(x + y) % 3];

export const LAYERS: ImageryLayer[] = [
  {
    id: "satellite",
    name: "Satellite",
    description: "Esri World Imagery",
    maxZoom: 19,
    url: (z, x, y) =>
      `https://${(x + y) % 2 ? "server" : "services"}.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/${z}/${y}/${x}?blankTile=false`,
    attribution: "Imagery © Esri, Maxar, Earthstar Geographics",
    shade: 0.3,
  },
  {
    id: "sentinel",
    name: "Sentinel-2",
    description: "Cloudless mosaic by EOX",
    maxZoom: 14,
    url: (z, x, y) => `https://tiles.maps.eox.at/wmts/1.0.0/s2cloudless_3857/default/g/${z}/${y}/${x}.jpg`,
    attribution: "Sentinel-2 cloudless by EOX (contains modified Copernicus Sentinel data 2016)",
    shade: 0.35,
  },
  {
    id: "osm",
    name: "OpenStreetMap",
    description: "Standard street map",
    maxZoom: 19,
    url: (z, x, y) => `https://tile.openstreetmap.org/${z}/${x}/${y}.png`,
    attribution: "© OpenStreetMap contributors",
    shade: 0.55,
  },
  {
    id: "topo",
    name: "Topographic",
    description: "OpenTopoMap contours",
    maxZoom: 17,
    url: (z, x, y) => `https://${sub(x, y)}.tile.opentopomap.org/${z}/${x}/${y}.png`,
    attribution: "© OpenStreetMap contributors, SRTM | Style © OpenTopoMap (CC-BY-SA)",
    shade: 0.3,
  },
  {
    id: "bluemarble",
    name: "Blue Marble",
    description: "NASA shaded relief and bathymetry",
    maxZoom: 8,
    url: (z, x, y) =>
      `https://gibs.earthdata.nasa.gov/wmts/epsg3857/best/BlueMarble_ShadedRelief_Bathymetry/default/GoogleMapsCompatible_Level8/${z}/${y}/${x}.jpeg`,
    attribution: "Blue Marble © NASA Earth Observatory / GIBS",
    shade: 0.35,
  },
];

export const LABELS_OVERLAY = {
  maxZoom: 19,
  url: (z: number, x: number, y: number) =>
    `https://server.arcgisonline.com/ArcGIS/rest/services/Reference/World_Boundaries_and_Places/MapServer/tile/${z}/${y}/${x}?blankTile=false`,
  attribution: "Labels © Esri",
};

export const DEM_MAX_ZOOM = 14;
export const demUrl = (z: number, x: number, y: number) =>
  `https://s3.amazonaws.com/elevation-tiles-prod/terrarium/${z}/${x}/${y}.png`;
export const DEM_ATTRIBUTION = "Terrain: Mapzen Terrain Tiles (SRTM, GMTED, NED, ETOPO1)";

export const BUILDINGS_TILEJSON = "https://tiles.openfreemap.org/planet";
export const BUILDINGS_ATTRIBUTION = "Buildings © OpenStreetMap contributors via OpenFreeMap / OpenMapTiles";

export function layerById(id: string): ImageryLayer {
  return LAYERS.find((l) => l.id === id) ?? LAYERS[0];
}
