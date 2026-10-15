import { describe, expect, it } from "vitest";
import { createGrid, getTile } from "../src/lib/csv";
import { erase, fill, line, paint } from "../src/lib/tools";
import { History } from "../src/lib/history";

describe("tools", () => {
  it("paints and erases in bounds only", () => {
    const g = createGrid(3, 2);
    expect(paint(g, 1, 1, 5)).toBe(true);
    expect(paint(g, 1, 1, 5)).toBe(false);
    expect(paint(g, 3, 0, 5)).toBe(false);
    expect(getTile(g, 1, 1)).toBe(5);
    expect(erase(g, 1, 1)).toBe(true);
    expect(getTile(g, 1, 1)).toBe(0);
  });

  it("flood fills a bounded region", () => {
    const g = createGrid(5, 5);
    for (let i = 0; i < 5; i++) paint(g, 2, i, 1); // wall down the middle
    expect(fill(g, 0, 0, 7)).toBe(10);
    expect(getTile(g, 1, 4)).toBe(7);
    expect(getTile(g, 3, 0)).toBe(0);
    expect(fill(g, 0, 0, 7)).toBe(0);
  });

  it("draws gap-free lines", () => {
    expect(line({ x: 0, y: 0 }, { x: 3, y: 1 })).toHaveLength(4);
    expect(line({ x: 2, y: 2 }, { x: 2, y: 2 })).toEqual([{ x: 2, y: 2 }]);
  });

  it("undoes and redoes", () => {
    const h = new History<number>();
    h.push(1); h.push(2);
    expect(h.undo(3)).toBe(2);
    expect(h.redo(2)).toBe(3);
    expect(h.canRedo).toBe(false);
  });
});

import { safeJoin } from "../play-server";
describe("play server", () => {
  it("refuses paths outside the level dir", () => {
    expect(safeJoin("/lv", "a/b.csv")).toBe("/lv/a/b.csv");
    expect(() => safeJoin("/lv", "../x")).toThrow();
    expect(() => safeJoin("/lv", "/etc/passwd")).toThrow();
  });
});
