// Post-build guard: no server function may trace repo tooling into its deployment bundle.
//
// 2026-10-09: the admin check-findings page imported the CLI findings registry, which imports a
// dozen filesystem-scanning check scripts. Turbopack's file tracing then shipped ~22,000 repo
// files (migrations/, docs/, scripts/, all feature source, typescript, eslint) inside that one
// page's function — gigabytes of output Vercel had to write and upload on every build.
// App code reads DATA (JSON, a pure module); it never imports a CLI script.
// Usage: node scripts/check-server-trace-scope.mjs [distDir]   (also exported for the self-test)
import { readFileSync, readdirSync } from "node:fs";
import { dirname, join, relative, resolve } from "node:path";
import { pathToFileURL } from "node:url";

export const FORBIDDEN = [
  { label: "migrations/", test: (p) => p.startsWith("migrations/") },
  { label: "docs/", test: (p) => p.startsWith("docs/") },
  { label: "scripts/ (non-JSON)", test: (p) => p.startsWith("scripts/") && !p.endsWith(".json") },
  { label: "typescript", test: (p) => /(^|\/)node_modules\/(\.pnpm\/typescript@[^/]+\/node_modules\/)?typescript\//.test(p) },
  { label: "eslint", test: (p) => /(^|\/)node_modules\/(\.pnpm\/eslint@[^/]+\/node_modules\/)?eslint\//.test(p) },
];
// Repo source files in one trace beyond this mean a dynamic filesystem root is tracing the tree.
export const MAX_SOURCE_FILES = 400;

export function inspectTraces(traces, root) {
  const problems = [];
  for (const { file, files } of traces) {
    const hits = new Map();
    let source = 0;
    for (const rel of files) {
      const p = relative(root, resolve(dirname(file), rel)).split("\\").join("/");
      if (/\.(tsx?|mjs|cjs|sql|md)$/.test(p) && !p.includes("node_modules/") && !p.startsWith(".next/")) source++;
      for (const f of FORBIDDEN) if (f.test(p)) hits.set(f.label, (hits.get(f.label) ?? 0) + 1);
    }
    if (hits.size || source > MAX_SOURCE_FILES) {
      const what = [...hits].map(([k, n]) => `${n} ${k}`);
      if (source > MAX_SOURCE_FILES) what.push(`${source} repo source files`);
      problems.push(`${relative(root, file)}: ${what.join(", ")}`);
    }
  }
  return problems;
}

function walk(dir, out = []) {
  for (const e of readdirSync(dir, { withFileTypes: true })) {
    const p = join(dir, e.name);
    if (e.isDirectory()) walk(p, out);
    else if (e.name.endsWith(".nft.json")) out.push(p);
  }
  return out;
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  const dist = resolve(process.argv[2] || process.env.NEXT_DISTDIR || ".next");
  const root = resolve(dist, "..");
  const traces = walk(join(dist, "server")).map((file) => ({ file, files: JSON.parse(readFileSync(file, "utf8")).files ?? [] }));
  const problems = inspectTraces(traces, root);
  if (problems.length) {
    console.error(`[server-trace-scope] ${problems.length} server bundle(s) trace repo tooling into the deployment:`);
    for (const p of problems.slice(0, 20)) console.error(`  ${p}`);
    console.error("  Cause: app code imports a script/CLI module (or a dynamic fs root). Import the DATA instead (see scripts/findings/accept-info.mjs).");
    process.exitCode = 1;
  } else {
    console.log(`[server-trace-scope] ${traces.length} server bundles trace no repo tooling.`);
  }
}
