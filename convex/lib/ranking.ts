export const MAX_LIST_SIZE = 1000;
export const MIN_LIST_FOR_AVERAGES = 3;

export type Outcome = "new" | "existing" | "tie";
export type Range = { lo: number; hi: number };

export function startRange(size: number): Range {
  return { lo: 0, hi: size };
}

export function isPlaced(range: Range) {
  return range.lo >= range.hi;
}

export function opponentIndex(range: Range) {
  return Math.floor((range.lo + range.hi) / 2);
}

export function answer(range: Range, outcome: Outcome): Range {
  const mid = opponentIndex(range);
  if (outcome === "new") return { lo: range.lo, hi: mid };
  if (outcome === "existing") return { lo: mid + 1, hi: range.hi };
  return { lo: mid + 1, hi: mid + 1 };
}

export function maxPicks(size: number) {
  return Math.ceil(Math.log2(size + 1));
}

export function scoreForRank(rank: number, size: number) {
  if (size <= 1) return 10;
  return Math.round((10 - ((rank - 1) * 5) / (size - 1)) * 10) / 10;
}
