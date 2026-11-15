import { Vector3 } from "three";
import { describe, expect, it } from "vitest";
import { clipRing, enuFrame, fromECEF, latToMercY, lonToMercX, mercXToLon, mercYToLat, ringArea, toECEF } from "./geo";

describe("mercator", () => {
  it("round-trips latitude and longitude", () => {
    for (const lat of [-80, -33.9, 0, 27.9881, 60, 85]) expect(mercYToLat(latToMercY(lat))).toBeCloseTo(lat, 9);
    for (const lon of [-180, -74.0113, 0, 139.7, 179.9]) expect(mercXToLon(lonToMercX(lon))).toBeCloseTo(lon, 9);
  });

  it("puts the equator and the tile grid edge where XYZ tiles expect them", () => {
    expect(latToMercY(0)).toBeCloseTo(0.5, 12);
    expect(mercYToLat(0)).toBeCloseTo(85.0511287798, 8);
    expect(mercYToLat(1)).toBeCloseTo(-85.0511287798, 8);
  });
});

describe("ECEF frame", () => {
  it("round-trips geodetic coordinates", () => {
    const p = toECEF(45.9766, 7.6585, 4478, new Vector3());
    const back = fromECEF(p);
    expect(back.lat).toBeCloseTo(45.9766, 9);
    expect(back.lon).toBeCloseTo(7.6585, 9);
    expect(back.height).toBeCloseTo(4478, 5);
  });

  it("builds a right-handed east, north, up frame", () => {
    const up = toECEF(10, 20, 0, new Vector3()).normalize();
    const east = new Vector3();
    const north = new Vector3();
    enuFrame(up, east, north);
    expect(new Vector3().crossVectors(east, north).distanceTo(up)).toBeLessThan(1e-12);
    const northward = toECEF(10.01, 20, 0, new Vector3()).sub(toECEF(10, 20, 0, new Vector3())).normalize();
    const eastward = toECEF(10, 20.01, 0, new Vector3()).sub(toECEF(10, 20, 0, new Vector3())).normalize();
    expect(northward.dot(north)).toBeGreaterThan(0.9999);
    expect(eastward.dot(east)).toBeGreaterThan(0.9999);
  });
});

describe("clipRing", () => {
  it("keeps a ring that is fully inside", () => {
    const ring = [0.2, 0.2, 0.4, 0.2, 0.4, 0.4, 0.2, 0.4];
    expect(clipRing(ring, 0, 0, 1, 1)).toEqual(ring);
  });

  it("cuts a ring at the rectangle and preserves its winding", () => {
    const ring = [-0.5, 0.25, 0.5, 0.25, 0.5, 0.75, -0.5, 0.75];
    const clipped = clipRing(ring, 0, 0, 1, 1);
    expect(Math.abs(ringArea(clipped))).toBeCloseTo(0.25, 12);
    expect(Math.sign(ringArea(clipped))).toBe(Math.sign(ringArea(ring)));
  });

  it("drops a ring that is fully outside", () => {
    expect(clipRing([2, 2, 3, 2, 3, 3], 0, 0, 1, 1)).toEqual([]);
  });
});
