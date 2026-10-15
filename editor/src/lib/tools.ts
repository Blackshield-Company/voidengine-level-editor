import type { Grid } from "./csv";

export type Cell = { x: number; y: number };

/** Sets one tile; returns true if anything changed. */
export function paint(g: Grid, x: number, y: number, id: number): boolean {
  if (x < 0 || y < 0 || x >= g.width || y >= g.height) return false;
  const i = y * g.width + x;
  if (g.tiles[i] === id) return false;
  g.tiles[i] = id;
  return true;
}

export const erase = (g: Grid, x: number, y: number) => paint(g, x, y, 0);

/** 4-way flood fill of the region containing (x, y). Returns cells changed. */
export function fill(g: Grid, x: number, y: number, id: number): number {
  if (x < 0 || y < 0 || x >= g.width || y >= g.height) return 0;
  const target = g.tiles[y * g.width + x];
  if (target === id) return 0;
  const stack = [y * g.width + x];
  let n = 0;
  while (stack.length) {
    const i = stack.pop()!;
    if (g.tiles[i] !== target) continue;
    g.tiles[i] = id;
    n++;
    const cx = i % g.width;
    const cy = (i - cx) / g.width;
    if (cx > 0) stack.push(i - 1);
    if (cx < g.width - 1) stack.push(i + 1);
    if (cy > 0) stack.push(i - g.width);
    if (cy < g.height - 1) stack.push(i + g.width);
  }
  return n;
}

/** Bresenham line so fast drags don't leave gaps. */
export function line(a: Cell, b: Cell): Cell[] {
  const out: Cell[] = [];
  let { x, y } = a;
  const dx = Math.abs(b.x - x), dy = -Math.abs(b.y - y);
  const sx = x < b.x ? 1 : -1, sy = y < b.y ? 1 : -1;
  let err = dx + dy;
  for (;;) {
    out.push({ x, y });
    if (x === b.x && y === b.y) return out;
    const e2 = 2 * err;
    if (e2 >= dy) { err += dy; x += sx; }
    if (e2 <= dx) { err += dx; y += sy; }
  }
}
