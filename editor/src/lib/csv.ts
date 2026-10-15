// VoidEngine tilemap CSV: rows separated by newlines, ids separated by commas.
// Tile id 0 is empty. We keep the line ending and trailing newline of the
// source so that load -> save is byte-for-byte lossless for canonical files.

export interface Grid {
  width: number;
  height: number;
  tiles: Int32Array; // row-major
}

export interface CsvFormat {
  eol: "\n" | "\r\n";
  trailingNewline: boolean;
}

export const DEFAULT_FORMAT: CsvFormat = { eol: "\n", trailingNewline: true };

export function createGrid(width: number, height: number, fill = 0): Grid {
  return { width, height, tiles: new Int32Array(width * height).fill(fill) };
}

export function parseCsv(text: string): { grid: Grid; format: CsvFormat } {
  const eol = text.includes("\r\n") ? "\r\n" : "\n";
  const rows = text
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter((l) => l !== "")
    .map((l) => l.split(","));
  if (rows.length === 0) throw new Error("CSV has no tile data");
  // Same rule as the engine: width comes from the first row, extra cells are
  // dropped, missing cells and non-numbers are 0.
  const width = rows[0].length;
  const grid = createGrid(width, rows.length);
  rows.forEach((cells, y) => {
    for (let x = 0; x < Math.min(cells.length, width); x++) {
      const v = Number.parseInt(cells[x].trim(), 10);
      grid.tiles[y * width + x] = Number.isFinite(v) ? v : 0;
    }
  });
  return { grid, format: { eol, trailingNewline: /\n\s*$/.test(text) } };
}

export function serializeCsv(grid: Grid, format: CsvFormat = DEFAULT_FORMAT): string {
  const lines: string[] = [];
  for (let y = 0; y < grid.height; y++) {
    lines.push(Array.from(grid.tiles.subarray(y * grid.width, (y + 1) * grid.width)).join(","));
  }
  return lines.join(format.eol) + (format.trailingNewline ? format.eol : "");
}

export function getTile(g: Grid, x: number, y: number): number {
  if (x < 0 || y < 0 || x >= g.width || y >= g.height) return 0;
  return g.tiles[y * g.width + x];
}

export function resizeGrid(g: Grid, width: number, height: number): Grid {
  const out = createGrid(width, height);
  for (let y = 0; y < Math.min(height, g.height); y++)
    for (let x = 0; x < Math.min(width, g.width); x++) out.tiles[y * width + x] = g.tiles[y * g.width + x];
  return out;
}
