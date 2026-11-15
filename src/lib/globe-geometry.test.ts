import { geoArea, geoPath, type GeoPermissibleObjects } from 'd3-geo';
import { describe, expect, it } from 'vitest';

import land from '../data/world-land.json';
import { globeProjection, projectGlobePlaces, rotateGlobe } from './globe-geometry';

describe('globe geography', () => {
  const paris = { _id: 'paris', name: 'Paris', lng: 2.35, lat: 48.86 };
  const tokyo = { _id: 'tokyo', name: 'Tokyo', lng: 139.69, lat: 35.68 };

  it('centers a selected destination and hides places on the back of the globe', () => {
    const antipode = { _id: 'antipode', name: 'Opposite side', lng: paris.lng - 180, lat: -paris.lat };
    const pins = projectGlobePlaces([paris, antipode], { longitude: paris.lng, latitude: paris.lat }, 320);
    expect(pins.map(({ place }) => place._id)).toEqual(['paris']);
    expect(pins[0].x).toBeCloseTo(160);
    expect(pins[0].y).toBeCloseTo(160);
    const tokyoPin = projectGlobePlaces([tokyo], { longitude: tokyo.lng, latitude: tokyo.lat }, 320)[0];
    expect(tokyoPin.x).toBeCloseTo(160);
    expect(tokyoPin.y).toBeCloseTo(160);
  });

  it('keeps pins geographically continuous across the date line', () => {
    const pins = projectGlobePlaces([{ _id: 'island', name: 'Island', lat: 0, lng: -179 }], { longitude: 179, latitude: 0 }, 320);
    expect(pins).toHaveLength(1);
    expect(pins[0].x).toBeGreaterThan(160);
    expect(pins[0].x).toBeLessThan(170);
  });

  it('wraps repeated rotations and limits dragging at the poles', () => {
    expect(rotateGlobe({ longitude: 179, latitude: 70 }, 5, 30)).toEqual({ longitude: -176, latitude: 75 });
    expect(rotateGlobe({ longitude: -179, latitude: -70 }, -725, -30)).toEqual({ longitude: 176, latitude: -75 });
  });

  it('excludes invalid coordinates', () => {
    expect(projectGlobePlaces([
      { ...paris, lat: NaN }, { ...paris, lng: Infinity }, { ...paris, lat: 100 }, { ...paris, lng: 200 },
    ], { longitude: 0, latitude: 0 }, 320)).toEqual([]);
  });

  it('bundles correctly wound land and clips it at multiple orientations', () => {
    const geometry = land as GeoPermissibleObjects;
    // Land covers about 29% of Earth; reversed rings would fill the oceans.
    expect(geoArea(geometry) / (4 * Math.PI)).toBeGreaterThan(0.25);
    expect(geoArea(geometry) / (4 * Math.PI)).toBeLessThan(0.35);
    for (const longitude of [-179, -90, 0, 90, 179]) {
      const path = geoPath(globeProjection({ longitude, latitude: 20 }, 320))(geometry);
      expect(path).toBeTruthy();
      expect(path).not.toMatch(/NaN|Infinity/);
    }
  });
});
