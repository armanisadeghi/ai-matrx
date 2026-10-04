#!/usr/bin/env node
// scripts/check-agent-traffic-marker.mjs — `pnpm check:agent-traffic-marker`
//
// THE AGENT-TRAFFIC MARKER GUARD (advisory). Every tool WE own that makes requests to our own
// app or server must say so with the marker (lib/agent-traffic/marker.ts, twin of aidream
// matrx_ai/agent_traffic.py), or its guests are counted as visitors and only GUESSED to be bots.
//
// Fails (exit 1) when:
//   1. the two constants drift (header, cookie, fixture suite);
//   2. a tool file in matrx-frontend, aidream or matrx-extend calls our server/app over HTTP
//      (Node fetch, curl, httpx/requests/aiohttp/urllib) without the marker;
//   3. a browser tool (Playwright) drives a NON-local host of ours without the marker. A browser
//      on a local preview host is already marked by the proxy's cookie, so it is not reported;
//   4. a Playwright Test config sets no marker in `extraHTTPHeaders`.
// A file counts as marked when it names the marker itself or imports a helper file that does.
// A file that only MENTIONS our hosts (a lint rule, a fixture string) says so in one line:
//   `matrx-agent-traffic: exempt <why>` — the reason is printed with --exempt.
//
// It never blocks a release and never refuses traffic. `--self-test` proves it red on planted
// violations and green on their fixes. `--json` prints findings as JSON lines.

import { execFileSync } from "node:child_process";
import { existsSync, mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { basename, dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url));
const FRONTEND = resolve(HERE, "..");
const WORKSPACE = resolve(FRONTEND, "..");

const MARKER_TOKENS = /agentTraffic|agent_traffic|markBrowserAgentTraffic|X-Matrx-Agent-Traffic|matrx_agent_traffic/i;
const EXEMPT = /matrx-agent-traffic:\s*exempt\s+(\S.{8,})/;
const TOOL_EXT = /\.(mjs|cjs|js|ts|py|sh)$/;
const SKIP = /(^|\/)(node_modules|\.venv|\.next|dist|build|\.wt|packages\/matrx-scraper)\//;

// Our hosts. Local frontend hosts are listed separately: a browser there is marked by cookie.
const OUR_SERVER = /server\.app\.matrxserver\.com|(localhost|127\.0\.0\.1):8000|\b(AIDREAM_BASE_URL|AIDREAM_API_URL|ACCEPTANCE_BASE_URL|MATRX_LIVE_BASE_URL|SERVER_URL|BACKEND_URL|API_BASE_URL)\b/;
const OUR_PROD_APP = /(www\.|manage\.|demos\.|lab\.)?aimatrx\.com/;
const OUR_LOCAL_APP = /(localhost|127\.0\.0\.1):3001|\.localhost:\$\{?|\.localhost:3001|\bSESSION_HOST\b/;

const BROWSER = /chromium\.launch|launchPersistentContext|connectOverCDP|\.newContext\(|new_context\(|async_playwright|sync_playwright/;
const HTTP_JS = /\bfetch\(|execFile(Sync)?\(\s*["']curl["']/;
const HTTP_SH = /(^|[\s;|&(])curl\s/m;
const HTTP_PY = /\bhttpx\.|\brequests\.(get|post|put|patch|delete|Session)\b|aiohttp\.ClientSession|urllib\.request\.urlopen/;

function listFiles(root, prefixes) {
  if (!existsSync(join(root, ".git"))) return [];
  let out = "";
  try {
    out = execFileSync("git", ["-C", root, "ls-files", "-c", "-o", "--exclude-standard", "--", ...prefixes], {
      encoding: "utf8",
      maxBuffer: 64 * 1024 * 1024,
    });
  } catch {
    return [];
  }
  return out.split("\n").filter((f) => f && TOOL_EXT.test(f) && !SKIP.test(`${f}`)).map((f) => join(root, f));
}

function read(path) {
  try {
    return readFileSync(path, "utf8");
  } catch {
    return "";
  }
}

/** Module names a file imports (JS relative imports, Python dotted/relative imports, sh source). */
function importedNames(text) {
  const names = new Set();
  for (const m of text.matchAll(/(?:from\s+|import\s*\(\s*|require\(\s*|import\s+)["']([^"']+)["']/g))
    names.add(basename(m[1]).replace(/\.(mjs|cjs|js|ts)$/, ""));
  for (const m of text.matchAll(/^\s*(?:from\s+([\w.]+)\s+import|import\s+([\w.]+))/gm)) {
    const mod = (m[1] ?? m[2] ?? "").split(".").filter(Boolean);
    if (mod.length) names.add(mod.at(-1));
  }
  for (const m of text.matchAll(/^\s*(?:source|\.)\s+"?([^"\s]+)"?/gm)) names.add(basename(m[1]).replace(/\.sh$/, ""));
  return names;
}

function stem(path) {
  return basename(path).replace(/\.(mjs|cjs|js|ts|py|sh)$/, "");
}

function classify(path, text) {
  const isPy = path.endsWith(".py");
  const isSh = path.endsWith(".sh");
  const browser = BROWSER.test(text);
  const http = isPy ? HTTP_PY.test(text) : isSh ? HTTP_SH.test(text) : HTTP_JS.test(text);
  const server = OUR_SERVER.test(text);
  const prodApp = OUR_PROD_APP.test(text);
  const localApp = OUR_LOCAL_APP.test(text);
  if (http && (server || prodApp || (localApp && !browser))) return "http";
  if (browser && (server || prodApp)) return "browser-off-local";
  return null;
}

export function scan(files, { workspace = WORKSPACE } = {}) {
  const texts = new Map(files.map((f) => [f, read(f)]));
  const markedHelpers = new Set(
    [...texts].filter(([, t]) => MARKER_TOKENS.test(t)).map(([f]) => stem(f)),
  );
  const findings = [];
  for (const [file, text] of texts) {
    if (MARKER_TOKENS.test(text) || EXEMPT.test(text)) continue;
    const rel = file.startsWith(workspace) ? file.slice(workspace.length + 1) : file;
    if (/playwright[^/]*\.config\.(ts|mjs|js)$/.test(file)) {
      findings.push({ rule: "playwright-config", file: rel, why: "no marker in use.extraHTTPHeaders" });
      continue;
    }
    const kind = classify(file, text);
    if (!kind) continue;
    if ([...importedNames(text)].some((n) => markedHelpers.has(n))) continue;
    findings.push({
      rule: kind,
      file: rel,
      why:
        kind === "http"
          ? "calls our app/server over HTTP without the agent-traffic marker"
          : "drives a browser at a non-local host of ours without the marker",
    });
  }
  return findings;
}

export function parity(frontendMarker, aidreamMarker) {
  const ts = read(frontendMarker);
  const py = read(aidreamMarker);
  if (!py) return [];
  const pick = (src, key) => src.match(new RegExp(`["']?${key}["']?\\s*:\\s*["']([^"']+)["']`))?.[1] ?? null;
  return ["header", "cookie", "fixtureSuite"]
    .filter((k) => pick(ts, k) !== pick(py, k))
    .map((k) => ({
      rule: "constant-drift",
      file: "lib/agent-traffic/marker.ts <> matrx_ai/agent_traffic.py",
      why: `${k}: ${pick(ts, k)} != ${pick(py, k)}`,
    }));
}

function census() {
  const frontend = listFiles(FRONTEND, ["scripts", "tests", "config/playwright", "features", "components"]).filter(
    (f) => !/\/features\/|\/components\//.test(f.slice(FRONTEND.length)) || /__tests__|__fixtures__/.test(f),
  );
  const aidreamRoot = join(WORKSPACE, "aidream");
  const aidream = listFiles(aidreamRoot, ["scripts", "tests", "tests_trials", "apps/shared"]).filter(
    (f) => !f.includes("/apps/shared/") || /\/(demo|scripts)\//.test(f),
  );
  const extend = listFiles(join(WORKSPACE, "matrx-extend"), ["scripts", "tests/browser"]);
  return [...frontend, ...aidream, ...extend].filter((f) => !f.endsWith("check-agent-traffic-marker.mjs"));
}

function report(findings, json) {
  if (json) {
    for (const f of findings) console.log(JSON.stringify(f));
    return;
  }
  if (!findings.length) {
    console.log("[agent-traffic-marker] OK — every tool that calls our app or server carries the marker.");
    return;
  }
  const byRule = Map.groupBy(findings, (f) => f.rule);
  for (const [rule, list] of byRule) {
    console.log(`\n${rule} (${list.length})`);
    for (const f of list) console.log(`  ${f.file} — ${f.why}`);
  }
  console.log(
    `\n[agent-traffic-marker] ${findings.length} unmarked. Fix: send agentTrafficHeaders("<tool>") ` +
      `(lib/agent-traffic/marker.ts) / agent_traffic_headers("<tool>") (matrx_ai.agent_traffic), ` +
      `or extraHTTPHeaders in the browser context. Advisory: nothing is blocked.`,
  );
}

function selfTest() {
  const root = mkdtempSync(join(tmpdir(), "agent-traffic-guard-"));
  const write = (rel, text) => {
    const p = join(root, rel);
    mkdirSync(dirname(p), { recursive: true });
    writeFileSync(p, text);
    return p;
  };
  const bad = [
    write("a/walk.mjs", 'await fetch("https://server.app.matrxserver.com/ai/run");\n'),
    write("a/probe.py", 'import httpx\nhttpx.post("http://localhost:8000/x")\n'),
    write("a/prod.mjs", 'const b = await chromium.launch(); await b.newContext(); await p.goto("https://www.aimatrx.com/");\n'),
    write("a/smoke.sh", "curl -s https://server.app.matrxserver.com/health\n"),
    write("a/playwright.x.config.ts", "export default { use: { baseURL: 'http://localhost:3001' } };\n"),
  ];
  const helper = write("a/lib/http.py", 'from matrx_ai.agent_traffic import agent_traffic_headers\n');
  const good = [
    write("b/walk.mjs", 'import { agentTrafficHeaders } from "x";\nawait fetch("https://server.app.matrxserver.com/ai", { headers: agentTrafficHeaders("w") });\n'),
    write("b/uses_helper.py", 'from a.lib.http import client\nimport httpx\nhttpx.post("http://localhost:8000/x")\n'),
    write("b/local.mjs", 'const b = await chromium.launch(); await b.newContext(); await p.goto("http://s1.localhost:3001/");\n'),
    write("b/supabase.mjs", 'await fetch(`${SUPABASE_URL}/rest/v1/x`);\n'),
    write("b/lint.mjs", '// matrx-agent-traffic: exempt lint fixtures only name the host\nconst s = "fetch(server.app.matrxserver.com)";\n'),
  ];
  const red = scan([...bad, helper], { workspace: root });
  const green = scan([...good, helper], { workspace: root });
  const drift = parity(
    write("m.ts", 'header: "X-Matrx-Agent-Traffic", cookie: "matrx_agent_traffic", fixtureSuite: "agent-traffic"'),
    write("m.py", '"header": "X-Other", "cookie": "matrx_agent_traffic", "fixtureSuite": "agent-traffic"'),
  );
  rmSync(root, { recursive: true, force: true });
  const problems = [];
  if (red.length !== bad.length)
    problems.push(`expected ${bad.length} red findings, got ${red.length}: ${red.map((f) => f.file).join(", ")}`);
  if (green.length) problems.push(`expected green, got: ${green.map((f) => f.file).join(", ")}`);
  if (drift.length !== 1) problems.push(`expected 1 constant drift, got ${drift.length}`);
  if (problems.length) {
    console.error(`[agent-traffic-marker] SELF-TEST FAILED\n  ${problems.join("\n  ")}`);
    process.exit(1);
  }
  console.log(`[agent-traffic-marker] self-test OK — ${red.length} planted violations red, fixes green, drift caught.`);
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  if (process.argv.includes("--self-test")) selfTest();
  else if (process.argv.includes("--exempt")) {
    for (const f of census()) {
      const m = read(f).match(EXEMPT);
      if (m) console.log(`${f.slice(WORKSPACE.length + 1)} — ${m[1].trim()}`);
    }
  }
  else {
    const findings = [
      ...parity(
        join(FRONTEND, "lib/agent-traffic/marker.ts"),
        join(WORKSPACE, "aidream/packages/matrx-ai/matrx_ai/agent_traffic.py"),
      ),
      ...scan(census()),
    ];
    report(findings, process.argv.includes("--json"));
    process.exit(findings.length ? 1 : 0);
  }
}
