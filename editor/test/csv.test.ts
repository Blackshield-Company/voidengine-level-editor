import { readFileSync, readdirSync, existsSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { parseCsv, serializeCsv } from "../src/lib/csv";

const root = join(__dirname, "..", "..");
const fixtureCsvs = readdirSync(join(root, "fixtures/basic")).filter((f) => f.endsWith(".csv")).map((f) => join(root, "fixtures/basic", f));
// Also round-trip any CSV tilemaps shipped with a local VoidEngine checkout.
const engine = process.env.VOIDENGINE ?? join(root, "..", "voidengine");
function walk(d: string): string[] {
  if (!existsSync(d)) return [];
  return readdirSync(d, { withFileTypes: true }).flatMap((e) =>
    e.isDirectory() ? walk(join(d, e.name)) : e.name.endsWith(".csv") ? [join(d, e.name)] : []);
}
const engineCsvs = walk(join(engine, "examples"));

describe("tilemap CSV", () => {
  it.each([...fixtureCsvs, ...engineCsvs])("round-trips %s byte-for-byte", (p) => {
    const text = readFileSync(p, "utf8");
    const { grid, format } = parseCsv(text);
    expect(serializeCsv(grid, format)).toBe(text);
  });

  it("parses like the engine", () => {
    const { grid } = parseCsv(" 1, 2 ,3\n\n4,x,6,9\n7\n\n");
    expect(grid.width).toBe(3);
    expect(grid.height).toBe(3);
    expect(Array.from(grid.tiles)).toEqual([1, 2, 3, 4, 0, 6, 7, 0, 0]);
  });

  it("keeps CRLF and missing trailing newline", () => {
    for (const t of ["1,0\r\n0,1\r\n", "1,0\n0,1"]) {
      const { grid, format } = parseCsv(t);
      expect(serializeCsv(grid, format)).toBe(t);
    }
  });

  it("rejects empty files", () => {
    expect(() => parseCsv("\n \n")).toThrow();
  });
});
