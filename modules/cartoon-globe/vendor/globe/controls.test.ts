import { PerspectiveCamera } from 'three';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { Controls, MAX_RANGE } from './controls';

const HOME = { lat: 24, lon: 10, range: MAX_RANGE, heading: 0, tilt: 0 };
const LONDON = { lat: 51.5074, lon: -0.1278, range: 1800, heading: 0, tilt: 50 };
const TOKYO = { lat: 35.6762, lon: 139.6503, range: 1800, heading: 0, tilt: 50 };

function setup(view = HOME) {
  let now = 0;
  vi.spyOn(performance, 'now').mockImplementation(() => now);
  const controls = new Controls(new EventTarget() as HTMLElement, new PerspectiveCamera(), () => 0);
  controls.setView(view);
  return {
    controls,
    advance(milliseconds: number) {
      now = milliseconds;
      controls.update(1 / 60);
      return controls.getView();
    },
  };
}

afterEach(() => vi.restoreAllMocks());

describe('cinematic location flights', () => {
  it('centers the location before the close descent and eases into its final tilt', () => {
    const { controls, advance } = setup();
    controls.flyTo(LONDON, 4, 'cinematic');
    const above = advance(2400);
    expect(above.lat).toBeCloseTo(LONDON.lat, 5);
    expect(above.lon).toBeCloseTo(LONDON.lon, 5);
    expect(above.range).toBeGreaterThan(20000);
    expect(above.tilt).toBeCloseTo(0);
    const arrived = advance(4000);
    expect(arrived.range).toBeCloseTo(LONDON.range);
    expect(arrived.tilt).toBeCloseTo(LONDON.tilt);
    expect(controls.destination).toBeNull();
    controls.dispose();
  });

  it('climbs above terrain before travelling between distant cities', () => {
    const { controls, advance } = setup(LONDON);
    controls.flyTo(TOKYO, 4, 'cinematic');
    const climbing = advance(400);
    expect(climbing.range).toBeGreaterThan(LONDON.range);
    expect(climbing.lat).toBeCloseTo(LONDON.lat, 5);
    expect(climbing.lon).toBeCloseTo(LONDON.lon, 5);
    expect(advance(1600).range).toBeGreaterThan(1e6);
    const above = advance(2720);
    expect(above.lat).toBeCloseTo(TOKYO.lat, 5);
    expect(above.lon).toBeCloseTo(TOKYO.lon, 5);
    const arrived = advance(4000);
    expect(arrived.range).toBeCloseTo(TOKYO.range);
    expect(arrived.tilt).toBeCloseTo(TOKYO.tilt);
    controls.dispose();
  });

  it('retargets from the current camera without jumping and allows manual zoom to interrupt', () => {
    const { controls, advance } = setup();
    controls.flyTo(LONDON, 4, 'cinematic');
    const current = advance(1200);
    controls.flyTo(TOKYO, 4, 'cinematic');
    const restarted = advance(1200);
    expect(restarted.lat).toBeCloseTo(current.lat, 5);
    expect(restarted.lon).toBeCloseTo(current.lon, 5);
    expect(restarted.range).toBeCloseTo(current.range);
    controls.zoomBy(0.5);
    expect(controls.destination).toBeNull();
    expect(advance(1300).range).toBeLessThan(current.range);
    controls.dispose();
  });

  it('supports the reduced-motion duration without leaving an animation running', () => {
    const { controls, advance } = setup();
    controls.flyTo(LONDON, 0.01, 'cinematic');
    const arrived = advance(16);
    expect(arrived.lat).toBeCloseTo(LONDON.lat, 5);
    expect(arrived.lon).toBeCloseTo(LONDON.lon, 5);
    expect(arrived.range).toBeCloseTo(LONDON.range);
    expect(controls.destination).toBeNull();
    controls.dispose();
  });

  it('returns from city detail to the full globe in one flight', () => {
    const { controls, advance } = setup(LONDON);
    controls.flyTo(HOME, 1.8);
    const leaving = advance(900);
    expect(leaving.range).toBeGreaterThan(LONDON.range);
    expect(leaving.range).toBeLessThan(HOME.range);
    const arrived = advance(1800);
    expect(arrived.lat).toBeCloseTo(HOME.lat, 5);
    expect(arrived.lon).toBeCloseTo(HOME.lon, 5);
    expect(arrived.range).toBeCloseTo(HOME.range);
    expect(arrived.tilt).toBeCloseTo(0);
    expect(controls.destination).toBeNull();
    controls.dispose();
  });

  it('starts descending promptly and arrives without a final camera snap', () => {
    const { controls, advance } = setup();
    controls.flyTo(LONDON, 3, 'cinematic');
    expect(advance(300).range).toBeLessThan(HOME.range * 0.95);
    const nearly = advance(2980);
    const arrived = advance(3000);
    expect(Math.abs(nearly.range - arrived.range)).toBeLessThan(1);
    expect(Math.abs(nearly.tilt - arrived.tilt)).toBeLessThan(0.01);
    controls.dispose();
  });
});
