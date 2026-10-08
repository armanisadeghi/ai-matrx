/**
 * check-server-paths-live — every server path the client COMPILES AGAINST is answered by the DEPLOYED server.
 *
 *   pnpm -s tsx scripts/check-server-paths-live.ts [--strict]
 *
 * Class F (bug desk, 2026-10-08): the frontend shipped `POST /ai/warm` while the deployed aidream (git_sha from
 * /health/version) predated the router — a 404 on every page. The client's contract is the installed
 * `@ai-matrx/agents` package: its generated `api-types` paths plus the literal paths its runtime builds by hand.
 * This diffs both against the deployed `/openapi.json` (paths are served under `/api`, matched with `{param}`
 * normalised) and names every path the client knows that the live server does not answer — a half-deployed
 * cross-repo feature. Exit 1 under --strict when any is missing; read-only, no credentials.
 */
import { readFileSync, readdirSync } from "node:fs";
import { join, resolve } from "node:path";

const SERVER = "https://server.app.matrxserver.com";
const AGENTS_DIST = resolve(process.cwd(), "node_modules/@ai-matrx/agents/dist");
// `{param}` and `${x}` normalise to `{}`; a trailing `${query}` glued onto a segment is a query string, not a path.
const norm = (p: string) => p.replace(/\$\{[^}]+\}|\{[^}]+\}/g, "{}").replace(/([^/])\{\}$/, "$1").replace(/\/+$/, "");
/** The bare base and dev-only doors are not endpoints a deployed page calls. */
const IGNORED = (p: string) => p === "/ai" || p === "" || p.startsWith("/dev/");

async function main() {
  const strict = process.argv.includes("--strict");
  const declared = new Map<string, string>();
  const types = readFileSync(join(AGENTS_DIST, "generated/api-types.d.ts"), "utf8");
  for (const m of types.matchAll(/^ {4}"(\/[^"]*)": \{/gm)) declared.set(norm(m[1]!), "api-types");
  for (const file of readdirSync(AGENTS_DIST).filter((f) => f.endsWith(".js"))) {
    const src = readFileSync(join(AGENTS_DIST, file), "utf8");
    for (const m of src.matchAll(/[`"'](\/ai\/[A-Za-z0-9_\-/${}.]*|\/warm)[`"']/g)) {
      const p = m[1]!;
      if (!declared.has(norm(p))) declared.set(norm(p), `agents/${file}`);
    }
  }
  const [health, openapi] = await Promise.all([
    fetch(`${SERVER}/health/version`).then((r) => r.json() as Promise<{ git_sha?: string; built_at?: string }>),
    fetch(`${SERVER}/openapi.json`).then((r) => r.json() as Promise<{ paths: Record<string, unknown> }>),
  ]);
  const live = new Set(Object.keys(openapi.paths).map(norm));
  // A bare "/warm" in the package is joined onto the "/ai" base by its transport.
  const answered = (p: string) => live.has(p) || live.has(norm(`/ai${p}`));
  const missing = [...declared].filter(([p]) => !IGNORED(p) && !answered(p));
  console.log(`deployed server ${health.git_sha?.slice(0, 10)} built ${health.built_at}; client declares ${declared.size} paths; live answers ${live.size}`);
  for (const [p, from] of missing) console.log(`  missing on the live server: ${p}  (${from})`);
  console.log(missing.length ? `${missing.length} client path(s) the deployed server does not answer` : "every client path is answered");
  if (strict && missing.length) process.exitCode = 1;
}

main().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
