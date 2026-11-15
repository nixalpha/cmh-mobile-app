import { describe, expect, it } from "vitest";
import { overrideWater } from "./layer";
import { COLORS } from "./style";

const [wr, wg, wb] = COLORS.water;
const pixels = (r: number, g: number, b: number) => new Uint8ClampedArray([r, g, b, 255]);

describe("overrideWater", () => {
  it("replaces satellite water with the vector water colour at full weight", () => {
    const out = pixels(20, 60, 90);
    overrideWater(out, pixels(wr, wg, wb), 1);
    expect([...out]).toEqual([wr, wg, wb, 255]);
  });

  it("leaves land alone and scales with the weight", () => {
    const land = pixels(200, 190, 170);
    overrideWater(land, pixels(230, 225, 214), 1);
    expect([...land]).toEqual([200, 190, 170, 255]);
    const half = pixels(100, 100, 100);
    overrideWater(half, pixels(wr, wg, wb), 0.5);
    expect(half[0]).toBe(Math.round(100 + (wr - 100) / 2));
    expect(half[3]).toBe(255);
  });
});
