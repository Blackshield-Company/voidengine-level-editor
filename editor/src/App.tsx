import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { getTile, parseCsv, resizeGrid, createGrid } from "./lib/csv";
import { erase, fill, line, paint, type Cell } from "./lib/tools";
import { History } from "./lib/history";
import {
  COLLISION_LAYERS, type CollisionLayer, type EntityDef, type Level,
  cloneLevel, loadLevel, newLevel, nextEntityId, saveLevel,
} from "./lib/level";

type Tool = "paint" | "erase" | "fill" | "entity";
const SCALE = 2;
const FALLBACK_COLORS = ["#ff2bd6", "#00f0ff", "#ffe600", "#7c4dff", "#ff6b35", "#39ff14", "#ff3860", "#4dd0e1"];

function idColor(id: number) { return FALLBACK_COLORS[(id - 1) % FALLBACK_COLORS.length]; }

export default function App() {
  const [level, setLevel] = useState<Level>(() => newLevel("untitled", 20, 12, 16));
  const [layer, setLayer] = useState(0);
  const [tool, setTool] = useState<Tool>("paint");
  const [tile, setTile] = useState(1);
  const [selected, setSelected] = useState<number | null>(null);
  const [tileset, setTileset] = useState<HTMLImageElement | null>(null);
  const [status, setStatus] = useState("Ready. Load a tileset PNG or paint with placeholder colors.");
  const [, force] = useState(0);
  const history = useMemo(() => new History<Level>(), []);
  const mapRef = useRef<HTMLCanvasElement>(null);
  const paletteRef = useRef<HTMLCanvasElement>(null);
  const drag = useRef<{ last: Cell | null; entity: number | null }>({ last: null, entity: null });

  const ts = level.def.tile_size;
  const columns = tileset ? Math.max(1, Math.floor(tileset.width / ts)) : 8;
  const tileCount = tileset ? columns * Math.max(1, Math.floor(tileset.height / ts)) : 16;

  const commit = useCallback((mut: (l: Level) => void) => {
    history.push(cloneLevel(level));
    const next = cloneLevel(level);
    mut(next);
    setLevel(next);
  }, [level, history]);

  // ---- rendering -------------------------------------------------------
  const drawTile = (ctx: CanvasRenderingContext2D, id: number, dx: number, dy: number, size: number) => {
    if (id <= 0) return;
    if (tileset) {
      const f = id - 1; // ids are 1-based into the sheet, like the engine
      ctx.drawImage(tileset, (f % columns) * ts, Math.floor(f / columns) * ts, ts, ts, dx, dy, size, size);
    } else {
      ctx.fillStyle = idColor(id);
      ctx.fillRect(dx, dy, size, size);
      ctx.fillStyle = "#120a20";
      ctx.font = `${Math.max(8, size / 3)}px monospace`;
      ctx.fillText(String(id), dx + 2, dy + size / 2);
    }
  };

  useEffect(() => {
    const c = mapRef.current; if (!c) return;
    const { width, height, entities, layers } = level.def;
    c.width = width * ts * SCALE; c.height = height * ts * SCALE;
    const ctx = c.getContext("2d")!;
    ctx.imageSmoothingEnabled = false;
    ctx.fillStyle = "#0b0614"; ctx.fillRect(0, 0, c.width, c.height);
    level.grids.forEach((g, li) => {
      if (layers[li].visible === false) return;
      ctx.globalAlpha = li === layer || tool === "entity" ? 1 : 0.55;
      for (let y = 0; y < height; y++) for (let x = 0; x < width; x++)
        drawTile(ctx, getTile(g, x, y), x * ts * SCALE, y * ts * SCALE, ts * SCALE);
    });
    ctx.globalAlpha = 1;
    ctx.strokeStyle = "rgba(124,77,255,.25)";
    for (let x = 0; x <= width; x++) { ctx.beginPath(); ctx.moveTo(x * ts * SCALE + .5, 0); ctx.lineTo(x * ts * SCALE + .5, c.height); ctx.stroke(); }
    for (let y = 0; y <= height; y++) { ctx.beginPath(); ctx.moveTo(0, y * ts * SCALE + .5); ctx.lineTo(c.width, y * ts * SCALE + .5); ctx.stroke(); }
    for (const e of entities) {
      const w = (e.sprite?.width ?? ts) * SCALE, h = (e.sprite?.height ?? ts) * SCALE;
      const [r, g, b, a] = e.sprite?.color ?? [255, 255, 255, 255];
      ctx.fillStyle = `rgba(${r},${g},${b},${a / 255})`;
      ctx.fillRect(e.x * SCALE - w / 2, e.y * SCALE - h / 2, w, h);
      if (e.collider) {
        ctx.strokeStyle = "#39ff14"; ctx.setLineDash([4, 3]);
        const cw = e.collider.width * SCALE, ch = e.collider.height * SCALE;
        ctx.strokeRect((e.x + (e.collider.offset_x ?? 0)) * SCALE - cw / 2, (e.y + (e.collider.offset_y ?? 0)) * SCALE - ch / 2, cw, ch);
        ctx.setLineDash([]);
      }
      if (e.spawn || e.id === selected) {
        ctx.strokeStyle = e.id === selected ? "#ffffff" : "#ffe600"; ctx.lineWidth = 2;
        ctx.strokeRect(e.x * SCALE - w / 2 - 2, e.y * SCALE - h / 2 - 2, w + 4, h + 4); ctx.lineWidth = 1;
      }
      ctx.fillStyle = "#e8defc"; ctx.font = "11px monospace";
      ctx.fillText(e.name, e.x * SCALE - w / 2, e.y * SCALE - h / 2 - 4);
    }
  }, [level, layer, tool, tileset, selected, ts]);

  useEffect(() => {
    const c = paletteRef.current; if (!c) return;
    const size = 24;
    c.width = columns * size; c.height = Math.ceil(tileCount / columns) * size;
    const ctx = c.getContext("2d")!;
    ctx.imageSmoothingEnabled = false;
    ctx.clearRect(0, 0, c.width, c.height);
    for (let id = 1; id <= tileCount; id++) {
      const x = ((id - 1) % columns) * size, y = Math.floor((id - 1) / columns) * size;
      drawTile(ctx, id, x, y, size);
      if (id === tile) { ctx.strokeStyle = "#fff"; ctx.lineWidth = 2; ctx.strokeRect(x + 1, y + 1, size - 2, size - 2); ctx.lineWidth = 1; }
    }
  }, [tileset, tile, columns, tileCount, ts]);

  // ---- input -----------------------------------------------------------
  const toWorld = (ev: React.MouseEvent) => {
    const r = mapRef.current!.getBoundingClientRect();
    return { x: (ev.clientX - r.left) / SCALE, y: (ev.clientY - r.top) / SCALE };
  };
  const toCell = (ev: React.MouseEvent): Cell => {
    const w = toWorld(ev); return { x: Math.floor(w.x / ts), y: Math.floor(w.y / ts) };
  };
  const hitEntity = (x: number, y: number) =>
    [...level.def.entities].reverse().find((e) => {
      const w = e.sprite?.width ?? ts, h = e.sprite?.height ?? ts;
      return Math.abs(x - e.x) <= w / 2 && Math.abs(y - e.y) <= h / 2;
    });

  const applyStroke = (l: Level, cells: Cell[]) => {
    const g = l.grids[layer];
    for (const c of cells) (tool === "erase" ? erase(g, c.x, c.y) : paint(g, c.x, c.y, tile));
  };

  const onDown = (ev: React.MouseEvent) => {
    const cell = toCell(ev);
    if (tool === "entity") {
      const w = toWorld(ev);
      const hit = hitEntity(w.x, w.y);
      if (hit) { setSelected(hit.id); history.push(cloneLevel(level)); drag.current.entity = hit.id; return; }
      const snap = (v: number) => Math.floor(v / ts) * ts + ts / 2;
      const id = nextEntityId(level.def);
      commit((l) => l.def.entities.push({
        id, name: `entity_${id}`, x: snap(w.x), y: snap(w.y),
        sprite: { width: ts, height: ts, color: [0, 240, 255, 255] },
        collider: { width: ts, height: ts, layer: "Enemy", mask: ["Player", "Wall"] },
      }));
      setSelected(id);
      return;
    }
    if (ev.button === 2) { setTile(getTile(level.grids[layer], cell.x, cell.y) || tile); return; } // eyedropper
    if (tool === "fill") { commit((l) => fill(l.grids[layer], cell.x, cell.y, tile)); return; }
    commit((l) => applyStroke(l, [cell]));
    drag.current.last = cell;
  };

  const onMove = (ev: React.MouseEvent) => {
    const cell = toCell(ev);
    setStatus(`tile ${cell.x},${cell.y}  id ${getTile(level.grids[layer], cell.x, cell.y)}`);
    if (drag.current.entity != null) {
      const w = toWorld(ev); const id = drag.current.entity;
      const next = cloneLevel(level);
      const e = next.def.entities.find((e) => e.id === id)!;
      e.x = Math.round(w.x); e.y = Math.round(w.y);
      setLevel(next);
      return;
    }
    const last = drag.current.last;
    if (!last || (last.x === cell.x && last.y === cell.y)) return;
    const next = cloneLevel(level); // same undo step as the mouse-down
    applyStroke(next, line(last, cell));
    setLevel(next);
    drag.current.last = cell;
  };
  const onUp = () => { drag.current = { last: null, entity: null }; };

  const undo = useCallback(() => { const p = history.undo(level); if (p) setLevel(p); force((n) => n + 1); }, [history, level]);
  const redo = useCallback(() => { const p = history.redo(level); if (p) setLevel(p); force((n) => n + 1); }, [history, level]);
  useEffect(() => {
    const k = (e: KeyboardEvent) => {
      if ((e.target as HTMLElement).tagName === "INPUT") return;
      if (e.ctrlKey && e.key === "z") { e.preventDefault(); undo(); }
      else if (e.ctrlKey && (e.key === "y" || e.key === "Z")) { e.preventDefault(); redo(); }
      else if (e.key === "b") setTool("paint"); else if (e.key === "e") setTool("erase");
      else if (e.key === "g") setTool("fill"); else if (e.key === "n") setTool("entity");
      else if (e.key === "Delete" && selected != null) {
        commit((l) => { l.def.entities = l.def.entities.filter((x) => x.id !== selected); }); setSelected(null);
      }
    };
    window.addEventListener("keydown", k); return () => window.removeEventListener("keydown", k);
  }, [undo, redo, selected, commit]);

  // ---- files -----------------------------------------------------------
  const loadTileset = (f: File) => {
    const img = new Image();
    img.onload = () => { setTileset(img); setStatus(`tileset ${f.name}: ${img.width}x${img.height}`); };
    img.src = URL.createObjectURL(f);
    img.decode().then(() => setLevel((l) => { const n = cloneLevel(l); n.def.tileset = { path: f.name, columns: Math.max(1, Math.floor(img.width / n.def.tile_size)) }; return n; }));
  };

  const openFiles = async (files: FileList) => {
    const byName = new Map([...files].map((f) => [f.name, f]));
    const json = byName.get("level.json");
    try {
      if (json) {
        const l = await loadLevel(await json.text(), async (rel) => {
          const f = byName.get(rel.split("/").pop()!); if (!f) throw new Error(`missing ${rel}`); return f.text();
        });
        history.push(cloneLevel(level)); setLevel(l); setLayer(0); setStatus(`opened ${l.def.name}`);
      } else {
        const f = [...files].find((f) => f.name.endsWith(".csv"));
        if (!f) throw new Error("pick level.json (+ its CSVs) or a single tilemap CSV");
        const { grid, format } = parseCsv(await f.text());
        const l = newLevel(f.name.replace(/\.csv$/, ""), grid.width, grid.height, ts);
        l.grids = [grid]; l.formats = [format]; l.def.layers[0].csv = f.name;
        history.push(cloneLevel(level)); setLevel(l); setLayer(0); setStatus(`imported ${f.name}`);
      }
    } catch (e) { setStatus(String(e)); }
  };

  const api = async (path: string, body?: unknown) => {
    const r = await fetch(path, body ? { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) } : undefined);
    const j = await r.json(); if (!r.ok) throw new Error(j.error); return j;
  };
  const loadWorkspace = async () => {
    try {
      const { files, dir } = await api("/api/level");
      const l = await loadLevel(files["level.json"], async (rel: string) => files[rel]);
      history.push(cloneLevel(level)); setLevel(l); setLayer(0); setStatus(`loaded ${dir}`);
    } catch (e) { setStatus(`load failed (dev server only): ${e}`); }
  };
  // In dev, open the workspace level on start.
  useEffect(() => { if (import.meta.env.DEV) void loadWorkspace(); }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const save = async () => {
    try { const r = await api("/api/save", { files: saveLevel(level) }); setStatus(`saved ${r.saved.join(", ")} to ${r.dir}`); }
    catch (e) { setStatus(`save failed (dev server only): ${e}`); }
  };
  const play = async () => {
    try { const r = await api("/api/play", { files: saveLevel(level) }); setStatus(`play: ${r.status}`); }
    catch (e) { setStatus(`play failed (dev server only): ${e}`); }
  };
  const download = () => {
    for (const [name, text] of Object.entries(saveLevel(level))) {
      const a = document.createElement("a");
      a.href = URL.createObjectURL(new Blob([text], { type: "text/plain" }));
      a.download = name.split("/").pop()!; a.click();
    }
  };

  const resize = (w: number, h: number) => commit((l) => {
    l.def.width = w; l.def.height = h; l.grids = l.grids.map((g) => resizeGrid(g, w, h));
  });

  const sel = level.def.entities.find((e) => e.id === selected);
  const editEntity = (mut: (e: EntityDef) => void) => commit((l) => { const e = l.def.entities.find((e) => e.id === selected); if (e) mut(e); });
  const num = (v: string) => (Number.isFinite(+v) ? +v : 0);

  return (
    <div className="app">
      <header>
        <h1>VOIDENGINE // LEVEL EDITOR</h1>
        <button onClick={() => { history.push(cloneLevel(level)); setLevel(newLevel("untitled", 20, 12, ts)); setLayer(0); }}>New</button>
        <label>Open <input type="file" multiple accept=".json,.csv" onChange={(e) => e.target.files && openFiles(e.target.files)} /></label>
        <button onClick={loadWorkspace}>Load workspace</button>
        <button onClick={save}>Save</button>
        <button onClick={download}>Download</button>
        <button onClick={play} title="Save and run examples/level_demo (hot-reloads if running)">▶ Play</button>
        <span style={{ width: 12 }} />
        {(["paint", "erase", "fill", "entity"] as Tool[]).map((t) => (
          <button key={t} className={tool === t ? "on" : ""} onClick={() => setTool(t)}>{t}</button>
        ))}
        <button onClick={undo} disabled={!history.canUndo}>Undo</button>
        <button onClick={redo} disabled={!history.canRedo}>Redo</button>
      </header>

      <aside>
        <h2>Level</h2>
        <label>name <input type="text" value={level.def.name} onChange={(e) => commit((l) => { l.def.name = e.target.value; })} /></label>
        <label>width <input type="number" min={1} value={level.def.width} onChange={(e) => resize(Math.max(1, num(e.target.value)), level.def.height)} /></label>
        <label>height <input type="number" min={1} value={level.def.height} onChange={(e) => resize(level.def.width, Math.max(1, num(e.target.value)))} /></label>
        <label>tile size <input type="number" min={1} value={ts} onChange={(e) => commit((l) => { l.def.tile_size = Math.max(1, num(e.target.value)); })} /></label>
        <h2>Tileset</h2>
        <input type="file" accept="image/png" onChange={(e) => e.target.files?.[0] && loadTileset(e.target.files[0])} />
        <h2>Palette (tile {tile})</h2>
        <div className="palette">
          <canvas ref={paletteRef} onClick={(e) => {
            const r = e.currentTarget.getBoundingClientRect();
            const id = Math.floor((e.clientY - r.top) / 24) * columns + Math.floor((e.clientX - r.left) / 24) + 1;
            if (id <= tileCount) { setTile(id); if (tool === "erase" || tool === "entity") setTool("paint"); }
          }} />
        </div>
        <h2>Layers</h2>
        {level.def.layers.map((l, i) => (
          <div key={i} className={`layer ${i === layer ? "sel" : ""}`} onClick={() => setLayer(i)}>
            <input type="checkbox" checked={l.visible !== false} onChange={(e) => commit((lv) => { lv.def.layers[i].visible = e.target.checked; })} />
            <span style={{ flex: 1 }}>{l.name}</span>
          </div>
        ))}
        <button onClick={() => commit((l) => {
          const n = l.def.layers.length + 1;
          l.def.layers.push({ name: `layer${n}`, csv: `layer${n}.csv`, solid_ids: [], visible: true });
          l.grids.push(createGrid(l.def.width, l.def.height)); l.formats.push({ eol: "\n", trailingNewline: true });
        })}>+ layer</button>
        {level.def.layers[layer] && (<>
          <label>name <input type="text" value={level.def.layers[layer].name} onChange={(e) => commit((l) => { l.def.layers[layer].name = e.target.value; })} /></label>
          <label>csv <input type="text" value={level.def.layers[layer].csv} onChange={(e) => commit((l) => { l.def.layers[layer].csv = e.target.value; })} /></label>
          <label title="tile ids that collide, comma separated">solid ids <input type="text"
            defaultValue={(level.def.layers[layer].solid_ids ?? []).join(",")} key={`${layer}-${level.def.layers[layer].csv}`}
            onBlur={(e) => commit((l) => { l.def.layers[layer].solid_ids = e.target.value.split(",").map((s) => parseInt(s, 10)).filter((n) => n >= 1); })} /></label>
        </>)}
      </aside>

      <main onContextMenu={(e) => e.preventDefault()}>
        <canvas ref={mapRef} className="map" onMouseDown={onDown} onMouseMove={onMove} onMouseUp={onUp} onMouseLeave={onUp} />
      </main>

      <aside>
        <h2>Entities</h2>
        <div className="ents">
          {level.def.entities.map((e) => (
            <div key={e.id} className={e.id === selected ? "sel" : ""} onClick={() => { setSelected(e.id); setTool("entity"); }}>
              #{e.id} {e.name}{e.spawn ? " ★" : ""}
            </div>
          ))}
        </div>
        {sel && (<>
          <h2>Inspector #{sel.id}</h2>
          <label>name <input type="text" value={sel.name} onChange={(e) => editEntity((x) => { x.name = e.target.value; })} /></label>
          <label>spawn <input type="checkbox" checked={!!sel.spawn} onChange={(e) => editEntity((x) => { x.spawn = e.target.checked || undefined; })} /></label>
          <h2>Transform</h2>
          <label>x <input type="number" value={sel.x} onChange={(e) => editEntity((x) => { x.x = num(e.target.value); })} /></label>
          <label>y <input type="number" value={sel.y} onChange={(e) => editEntity((x) => { x.y = num(e.target.value); })} /></label>
          <h2>Sprite <input type="checkbox" checked={!!sel.sprite} onChange={(e) => editEntity((x) => { x.sprite = e.target.checked ? { width: ts, height: ts, color: [255, 255, 255, 255] } : undefined; })} /></h2>
          {sel.sprite && (<>
            <label>width <input type="number" min={1} value={sel.sprite.width} onChange={(e) => editEntity((x) => { x.sprite!.width = Math.max(1, num(e.target.value)); })} /></label>
            <label>height <input type="number" min={1} value={sel.sprite.height} onChange={(e) => editEntity((x) => { x.sprite!.height = Math.max(1, num(e.target.value)); })} /></label>
            <label>color <input type="color" value={"#" + (sel.sprite.color ?? [255, 255, 255]).slice(0, 3).map((c) => c.toString(16).padStart(2, "0")).join("")}
              onChange={(e) => editEntity((x) => { const h = e.target.value; x.sprite!.color = [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16)).concat(x.sprite!.color?.[3] ?? 255) as [number, number, number, number]; })} /></label>
          </>)}
          <h2>Collider <input type="checkbox" checked={!!sel.collider} onChange={(e) => editEntity((x) => { x.collider = e.target.checked ? { width: ts, height: ts, layer: "None", mask: [] } : undefined; })} /></h2>
          {sel.collider && (<>
            <label>width <input type="number" min={0} value={sel.collider.width} onChange={(e) => editEntity((x) => { x.collider!.width = num(e.target.value); })} /></label>
            <label>height <input type="number" min={0} value={sel.collider.height} onChange={(e) => editEntity((x) => { x.collider!.height = num(e.target.value); })} /></label>
            <label>offset x <input type="number" value={sel.collider.offset_x ?? 0} onChange={(e) => editEntity((x) => { x.collider!.offset_x = num(e.target.value); })} /></label>
            <label>offset y <input type="number" value={sel.collider.offset_y ?? 0} onChange={(e) => editEntity((x) => { x.collider!.offset_y = num(e.target.value); })} /></label>
            <label>layer <select value={sel.collider.layer} onChange={(e) => editEntity((x) => { x.collider!.layer = e.target.value as CollisionLayer; })}>
              {COLLISION_LAYERS.map((c) => <option key={c}>{c}</option>)}
            </select></label>
            <div>mask</div>
            <div className="mask">
              {COLLISION_LAYERS.filter((c) => c !== "None").map((c) => (
                <label key={c} style={{ justifyContent: "flex-start" }}>
                  <input type="checkbox" checked={sel.collider!.mask?.includes(c) ?? false} onChange={(e) => editEntity((x) => {
                    const m = new Set(x.collider!.mask ?? []); if (e.target.checked) { m.add(c); } else { m.delete(c); }
                    x.collider!.mask = COLLISION_LAYERS.filter((k) => m.has(k));
                  })} />{c}
                </label>
              ))}
            </div>
          </>)}
          <button onClick={() => { commit((l) => { l.def.entities = l.def.entities.filter((x) => x.id !== sel.id); }); setSelected(null); }}>Delete entity</button>
        </>)}
      </aside>

      <footer>{status} · B paint · E erase · G fill · N entity · right-click eyedropper · Ctrl+Z/Y</footer>
    </div>
  );
}
