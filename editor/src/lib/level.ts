// level.json v1 — mirrors schema/level.schema.json and odin/voidlevel.
import { type CsvFormat, type Grid, DEFAULT_FORMAT, createGrid, parseCsv, serializeCsv } from "./csv";

export const LEVEL_VERSION = 1;
export const COLLISION_LAYERS = ["None", "Player", "PlayerBullet", "Enemy", "EnemyBullet", "PowerUp", "Wall"] as const;
export type CollisionLayer = (typeof COLLISION_LAYERS)[number];

export interface SpriteDef { width: number; height: number; color?: [number, number, number, number]; frame?: number }
export interface ColliderDef {
  width: number; height: number; offset_x?: number; offset_y?: number;
  layer: CollisionLayer; mask?: CollisionLayer[];
}
export interface EntityDef {
  id: number; name: string; spawn?: boolean; x: number; y: number;
  sprite?: SpriteDef; collider?: ColliderDef;
}
export interface LayerDef { name: string; csv: string; solid_ids?: number[]; visible?: boolean }
export interface LevelDef {
  version: 1; name: string; tile_size: number; width: number; height: number;
  tileset?: { path: string; columns: number };
  layers: LayerDef[]; entities: EntityDef[];
}

/** In-editor level: the JSON def plus decoded layer grids. */
export interface Level { def: LevelDef; grids: Grid[]; formats: CsvFormat[] }

export function newLevel(name: string, width: number, height: number, tileSize: number): Level {
  return {
    def: { version: 1, name, tile_size: tileSize, width, height, layers: [{ name: "ground", csv: "ground.csv", solid_ids: [], visible: true }], entities: [] },
    grids: [createGrid(width, height)],
    formats: [DEFAULT_FORMAT],
  };
}

export function validateLevel(v: unknown): string[] {
  const e: string[] = [];
  const d = v as Partial<LevelDef>;
  if (typeof d !== "object" || d === null) return ["level must be an object"];
  if (d.version !== LEVEL_VERSION) e.push(`unsupported version ${String(d.version)}`);
  if (typeof d.name !== "string") e.push("name must be a string");
  for (const k of ["tile_size", "width", "height"] as const)
    if (!Number.isInteger(d[k]) || (d[k] as number) < 1) e.push(`${k} must be a positive integer`);
  if (!Array.isArray(d.layers) || d.layers.length === 0) e.push("layers must be a non-empty array");
  else d.layers.forEach((l, i) => {
    if (typeof l.name !== "string" || typeof l.csv !== "string") e.push(`layers[${i}] needs name and csv`);
    if (l.solid_ids?.some((n) => !Number.isInteger(n) || n < 1)) e.push(`layers[${i}].solid_ids must be ids >= 1`);
  });
  if (!Array.isArray(d.entities)) e.push("entities must be an array");
  else d.entities.forEach((en, i) => {
    if (!Number.isInteger(en.id) || typeof en.name !== "string" || typeof en.x !== "number" || typeof en.y !== "number")
      e.push(`entities[${i}] needs id, name, x, y`);
    const c = en.collider;
    if (c) {
      if (!COLLISION_LAYERS.includes(c.layer)) e.push(`entities[${i}].collider.layer "${c.layer}" is unknown`);
      c.mask?.forEach((m) => { if (!COLLISION_LAYERS.includes(m)) e.push(`entities[${i}].collider.mask "${m}" is unknown`); });
    }
    if (en.sprite && (!(en.sprite.width >= 1) || !(en.sprite.height >= 1))) e.push(`entities[${i}].sprite needs width/height >= 1`);
  });
  return e;
}

/** Load from level.json text plus a resolver for the CSVs it names. */
export async function loadLevel(json: string, readCsv: (rel: string) => Promise<string>): Promise<Level> {
  const def = JSON.parse(json) as LevelDef;
  const errors = validateLevel(def);
  if (errors.length) throw new Error(errors.join("; "));
  const grids: Grid[] = [], formats: CsvFormat[] = [];
  for (const l of def.layers) {
    const { grid, format } = parseCsv(await readCsv(l.csv));
    if (grid.width !== def.width || grid.height !== def.height)
      throw new Error(`layer ${l.name}: ${grid.width}x${grid.height} does not match level ${def.width}x${def.height}`);
    grids.push(grid); formats.push(format);
  }
  return { def, grids, formats };
}

/** Files to write, keyed by path relative to level.json. */
export function saveLevel(level: Level): Record<string, string> {
  const files: Record<string, string> = { "level.json": JSON.stringify(level.def, null, 2) + "\n" };
  level.def.layers.forEach((l, i) => { files[l.csv] = serializeCsv(level.grids[i], level.formats[i]); });
  return files;
}

export function nextEntityId(def: LevelDef): number {
  return def.entities.reduce((m, e) => Math.max(m, e.id), 0) + 1;
}

export function cloneLevel(l: Level): Level {
  return { def: structuredClone(l.def), grids: l.grids.map((g) => ({ ...g, tiles: g.tiles.slice() })), formats: l.formats.slice() };
}
