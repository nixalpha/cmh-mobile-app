import { describe, expect, it } from "vitest";
import { DEM_SIZE, sampleDem } from "./dem";

describe("sampleDem", () => {
  const data = new Int16Array(DEM_SIZE * DEM_SIZE);
  for (let y = 0; y < DEM_SIZE; y++) for (let x = 0; x < DEM_SIZE; x++) data[y * DEM_SIZE + x] = x * 10 + y;

  it("returns exact samples on the grid", () => {
    expect(sampleDem(data, 3, 7)).toBe(37);
  });

  it("interpolates bilinearly between samples", () => {
    expect(sampleDem(data, 3.5, 7.25)).toBeCloseTo(42.25, 9);
  });

  it("clamps outside the tile", () => {
    expect(sampleDem(data, -4, -4)).toBe(0);
    expect(sampleDem(data, 400, 400)).toBe(255 * 11);
  });
});
