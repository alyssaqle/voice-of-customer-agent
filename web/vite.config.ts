import { defineConfig, type Plugin } from "vite";
import react from "@vitejs/plugin-react";
import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");

/**
 * Tiny dev-server API so the dashboard is a real human-in-the-loop loop with no
 * separate backend:
 *   GET  /api/results    → the pipeline's results.json (ranked themes)
 *   GET  /api/approvals  → persisted approvals (approvals.json)
 *   POST /api/approvals  → save an approve/edit/reject decision to approvals.json
 */
function vocApi(): Plugin {
  const resultsPath = join(ROOT, "results.json");
  const approvalsPath = join(ROOT, "approvals.json");
  const readJson = (p: string, fallback: unknown) =>
    existsSync(p) ? JSON.parse(readFileSync(p, "utf8")) : fallback;

  return {
    name: "voc-api",
    configureServer(server) {
      server.middlewares.use("/api/results", (_req, res) => {
        res.setHeader("Content-Type", "application/json");
        res.end(JSON.stringify(readJson(resultsPath, null)));
      });
      server.middlewares.use("/api/approvals", (req, res) => {
        res.setHeader("Content-Type", "application/json");
        if (req.method === "GET") {
          res.end(JSON.stringify(readJson(approvalsPath, {})));
          return;
        }
        if (req.method === "POST") {
          let body = "";
          req.on("data", (c) => (body += c));
          req.on("end", () => {
            const current = readJson(approvalsPath, {}) as Record<string, unknown>;
            const { theme_id, ...decision } = JSON.parse(body || "{}");
            current[theme_id] = { ...decision, saved_at: new Date().toISOString() };
            writeFileSync(approvalsPath, JSON.stringify(current, null, 2) + "\n");
            res.end(JSON.stringify({ ok: true }));
          });
          return;
        }
        res.statusCode = 405;
        res.end("{}");
      });
    },
  };
}

export default defineConfig({
  root: join(ROOT, "web"),
  plugins: [react(), vocApi()],
  server: { port: 5173, open: true },
});
