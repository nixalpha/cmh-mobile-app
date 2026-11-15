import { expect, test } from "vitest";

import { answer, isPlaced, maxPicks, opponentIndex, scoreForRank, startRange, type Outcome } from "./ranking";

function insert(list: number[], item: number, decide: (opponent: number) => Outcome) {
  let range = startRange(list.length);
  let picks = 0;
  while (!isPlaced(range)) {
    range = answer(range, decide(list[opponentIndex(range)]));
    picks++;
  }
  list.splice(range.lo, 0, item);
  return picks;
}

function shuffled(size: number, seed: number) {
  const items = Array.from({ length: size }, (_, i) => i);
  let state = seed;
  for (let i = size - 1; i > 0; i--) {
    state = (state * 1103515245 + 12345) % 2147483648;
    const j = state % (i + 1);
    [items[i], items[j]] = [items[j], items[i]];
  }
  return items;
}

test("answers drawn from a hidden true order rebuild that order within the pick bound", () => {
  for (const size of [1, 2, 3, 14, 100, 257]) {
    for (const seed of [1, 7, 42]) {
      const list: number[] = [];
      for (const item of shuffled(size, seed)) {
        const picks = insert(list, item, (opponent) => (item < opponent ? "new" : "existing"));
        expect(picks).toBeLessThanOrEqual(maxPicks(list.length - 1));
      }
      expect(list).toEqual(Array.from({ length: size }, (_, i) => i));
    }
  }
});

test("14 places need at most 4 picks and 100 need at most 7", () => {
  expect(maxPicks(14)).toBe(4);
  expect(maxPicks(100)).toBe(7);
  expect(maxPicks(0)).toBe(0);
});

test("too close to call places the new item directly below that opponent and stops", () => {
  const list = [10, 20, 30, 40, 50];
  const picks = insert(list, 25, () => "tie");
  expect(picks).toBe(1);
  expect(list).toEqual([10, 20, 30, 25, 40, 50]);
});

test("scores run from 10 at the top to 5 at the bottom", () => {
  expect(scoreForRank(1, 1)).toBe(10);
  expect(scoreForRank(1, 14)).toBe(10);
  expect(scoreForRank(2, 14)).toBe(9.6);
  expect(scoreForRank(14, 14)).toBe(5);
  expect(scoreForRank(2, 2)).toBe(5);
});
