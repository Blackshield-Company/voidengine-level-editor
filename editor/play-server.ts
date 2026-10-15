// Dev-server API used by the editor's Save / Load / Play buttons.
// Levels live in one workspace directory (VLE_LEVEL_DIR, default levels/sandbox).
import { spawn, type ChildProcess } from "node:child_process";
import { cpSync, existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import { dirname, isAbsolute, join, normalize, resolve } from "node:path";
import type { Plugin } from "vite";

const repoRoot = resolve(__dirname, "..");

export function safeJoin(base: string, rel: string): string {
  const n = normalize(rel);
  if (isAbsolute(n) || n.startsWith("..")) throw new Error(`refusing path ${rel}`);
  return join(base, n);
}

export function playServer(): Plugin {
  const levelDir = resolve(process.env.VLE_LEVEL_DIR ?? join(repoRoot, "levels/sandbox"));
  let game: ChildProcess | null = null;

  return {
    name: "voidengine-play-server",
    configureServer(server) {
      if (!existsSync(join(levelDir, "level.json"))) {
        mkdirSync(levelDir, { recursive: true });
        cpSync(join(repoRoot, "fixtures/basic"), levelDir, { recursive: true });
      }
      server.middlewares.use(async (req, res, next) => {
        if (!req.url?.startsWith("/api/")) return next();
        const send = (code: number, body: unknown) => {
          res.statusCode = code;
          res.setHeader("content-type", "application/json");
          res.end(JSON.stringify(body));
        };
        try {
          if (req.method === "GET" && req.url === "/api/level") {
            const files: Record<string, string> = {};
            for (const f of readdirSync(levelDir)) if (/\.(json|csv)$/.test(f)) files[f] = readFileSync(join(levelDir, f), "utf8");
            return send(200, { dir: levelDir, files });
          }
          if (req.method === "POST" && (req.url === "/api/save" || req.url === "/api/play")) {
            let raw = "";
            for await (const chunk of req) raw += chunk;
            const { files } = JSON.parse(raw) as { files: Record<string, string> };
            for (const [rel, text] of Object.entries(files)) {
              const p = safeJoin(levelDir, rel);
              mkdirSync(dirname(p), { recursive: true });
              writeFileSync(p, text);
            }
            if (req.url === "/api/save") return send(200, { saved: Object.keys(files), dir: levelDir });
            if (game && game.exitCode === null) return send(200, { status: "hot-reloaded" });
            game = spawn("make", ["-C", repoRoot, "play", `LEVEL=${join(levelDir, "level.json")}`], { stdio: "inherit" });
            return send(200, { status: "launched" });
          }
          send(404, { error: "not found" });
        } catch (e) {
          send(400, { error: String(e) });
        }
      });
    },
  };
}
