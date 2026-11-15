`world-land.json` is a bundled GeoJSON MultiPolygon converted from the land geometry in
[world-atlas 2.0.2, land-110m.json](https://cdn.jsdelivr.net/npm/world-atlas@2.0.2/land-110m.json).
Topology arcs were decoded and joined, and coordinates rounded to three decimal places.
Ring winding is preserved for D3's spherical clipping.

The source is [Natural Earth](https://www.naturalearthdata.com/), 1:110m land,
which is public domain. The lightweight geometry loads offline and is only a world
overview; it is not intended for street navigation or precise coastlines.

`world-borders.json` contains the country polygon rings from world-atlas 2.0.2's
`countries-110m.json`, decoded and rounded in the same way, as a MultiLineString.
These provide illustrated country boundaries when zooming into regions.
