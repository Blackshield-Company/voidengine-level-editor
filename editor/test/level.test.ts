import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { COLLISION_LAYERS, loadLevel, newLevel, nextEntityId, saveLevel, validateLevel } from "../src/lib/level";

const root = join(__dirname, "..", "..");
const fx = join(root, "fixtures/basic");
const schema = JSON.parse(readFileSync(join(root, "schema/level.schema.json"), "utf8"));
const read = async (rel: string) => readFileSync(join(fx, rel), "utf8");

describe("level.json", () => {
  it("loads the shared fixture and saves it back unchanged", async () => {
    const json = readFileSync(join(fx, "level.json"), "utf8");
    const lvl = await loadLevel(json, read);
    expect(lvl.grids).toHaveLength(2);
    const files = saveLevel(lvl);
    expect(JSON.parse(files["level.json"])).toEqual(JSON.parse(json));
    expect(files["ground.csv"]).toBe(await read("ground.csv"));
    expect(files["decor.csv"]).toBe(await read("decor.csv"));
  });

  it("collision layers match the schema", () => {
    expect([...COLLISION_LAYERS]).toEqual(schema.$defs.layer.enum);
  });

  it("schema required keys and version agree with the editor", () => {
    expect(schema.properties.version.const).toBe(1);
    const lvl = newLevel("x", 4, 3, 16);
    for (const k of schema.required) expect(lvl.def).toHaveProperty(k);
    expect(validateLevel(lvl.def)).toEqual([]);
  });

  const enginePath = join(process.env.VOIDENGINE ?? join(root, "..", "voidengine"), "src/core/engine.odin");
  it.skipIf(!existsSync(enginePath))("collision layers match the engine enum", () => {
    const src = readFileSync(enginePath, "utf8");
    const body = /CollisionLayer :: enum \{([^}]*)\}/.exec(src)![1];
    const names = body.split(/[,\n]/).map((s) => s.replace(/\/\/.*/, "").trim()).filter(Boolean);
    expect(names).toEqual([...COLLISION_LAYERS]);
  });

  it("reports bad levels", () => {
    expect(validateLevel({ version: 2 })).toContain("unsupported version 2");
    const d = newLevel("x", 2, 2, 8).def;
    d.entities.push({ id: 1, name: "e", x: 0, y: 0, collider: { width: 1, height: 1, layer: "Nope" as never } });
    expect(validateLevel(d).join()).toMatch(/Nope/);
  });

  it("rejects layers with the wrong size", async () => {
    const d = newLevel("x", 3, 3, 8).def;
    await expect(loadLevel(JSON.stringify(d), async () => "1,1\n1,1\n")).rejects.toThrow(/does not match/);
  });

  it("allocates entity ids", () => {
    const d = newLevel("x", 2, 2, 8).def;
    expect(nextEntityId(d)).toBe(1);
    d.entities.push({ id: 7, name: "a", x: 0, y: 0 });
    expect(nextEntityId(d)).toBe(8);
  });
});
