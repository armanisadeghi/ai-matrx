/**
 * check:routes-register-page-capture — EVERY PAGE HANDS ITSELF TO THE ALCHEMY MENU (lane
 * ALCHEMY-BUTTON).
 *
 * THE OWNER'S WORDS (Arman, 2026-09-25): "you're breaking our core system rules by not
 * including the alchemy button. If you're not putting it here, then it makes me wonder if it's
 * everywhere else … it would show you what page I'm on and it would capture the exact values
 * I've set … and then it would include the data I want so there is no question."
 *
 * THE CLASS. A surface was built with no page capture, so the person could not copy what they
 * were looking at to an agent, and the admin debug context carried only the URL. The fix is one
 * helper (`components/agent-copy/page-capture/`): a page registers `usePageCapture` with one of
 * the surface-kind builders (`tablePageCapture`, `recordPageCapture`, `adminPageCapture`) or
 * mounts `<AdminPageCapture>`, and renders `<PageCaptureButton>`.
 *
 * WHAT IS SCANNED. Every `page.tsx` under `app/(core)` and `app/(admin)`. A route REGISTERS when
 * its page file, or a module it imports (followed through `@/…` and relative imports, depth 4,
 * tests excluded), calls `usePageCapture(` with a page-kind builder, or mounts
 * `<AdminPageCapture`. A dialog's capture (`dialogCapture`) does not count: a dialog the page
 * can open is not the page.
 *
 * WHAT PASSES WITHOUT REGISTERING.
 *   - A pure redirect: the page's only job is `redirect(` / `permanentRedirect(` (detected, and
 *     named in the report).
 *   - `scripts/page-capture-allowlist.json` — a route with a reason (a layout shell that renders
 *     no content of its own). A reasonless entry fails.
 *   - `scripts/page-capture-baseline.json` — THE CENSUS of routes that did not register when the
 *     guard landed (2026-09-25). It ONLY SHRINKS: a route in it that now registers fails as a
 *     stale entry until it is removed, and a route NOT in it that does not register fails. So a
 *     NEW page can never be built without its capture again, and every wired page leaves the
 *     census for good.
 *
 * `--self-test` proves both directions on planted fixtures. `--write-baseline` rewrites the
 * census from the tree (only ever to shrink it; it refuses to add a route).
 */

import { existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, statSync, writeFileSync } from "node:fs";
import { dirname, join, relative, resolve, sep } from "node:path";
import { tmpdir } from "node:os";

const REPO = join(__dirname, "..");
const GROUPS = ["app/(core)", "app/(admin)"];
const MAX_DEPTH = 4;

const REGISTERS =
  /usePageCapture\s*\(\s*\(\)\s*=>\s*(?:\(\s*\{\s*\.\.\.)?\s*(?:tablePageCapture|recordPageCapture|adminPageCapture)\s*\(|<AdminPageCapture\b/;
const REDIRECT_ONLY = /\b(?:redirect|permanentRedirect)\s*\(/;

type Classification = "registers" | "redirect" | "missing";

function walk(dir: string, out: string[] = []): string[] {
  if (!existsSync(dir)) return out;
  for (const name of readdirSync(dir)) {
    const full = join(dir, name);
    const st = statSync(full);
    if (st.isDirectory()) {
      if (name === "node_modules" || name === "__tests__") continue;
      walk(full, out);
    } else if (name === "page.tsx") out.push(full);
  }
  return out;
}

const IMPORT_RE = /(?:import\s+[^"']*?from\s*|import\s*\(\s*|export\s+[^"']*?from\s*)["']([^"']+)["']/g;

function resolveImport(root: string, from: string, spec: string): string | null {
  let base: string;
  if (spec.startsWith("@/")) base = join(root, spec.slice(2));
  else if (spec.startsWith(".")) base = resolve(dirname(from), spec);
  else return null;
  for (const candidate of [base, `${base}.tsx`, `${base}.ts`, join(base, "index.tsx"), join(base, "index.ts")]) {
    if (existsSync(candidate) && statSync(candidate).isFile()) return candidate;
  }
  return null;
}

function makeClassifier(root: string) {
  const text = new Map<string, string>();
  const read = (f: string) => {
    let t = text.get(f);
    if (t === undefined) {
      t = readFileSync(f, "utf8");
      text.set(f, t);
    }
    return t;
  };
  const reaches = new Map<string, boolean>();
  function registers(file: string, depth: number, seen: Set<string>): boolean {
    if (seen.has(file)) return false;
    seen.add(file);
    const cached = reaches.get(`${file}@${depth}`);
    if (cached !== undefined) return cached;
    const src = read(file);
    let ok = REGISTERS.test(src);
    if (!ok && depth < MAX_DEPTH) {
      for (const m of src.matchAll(IMPORT_RE)) {
        const target = resolveImport(root, file, m[1]);
        if (!target || /\.test\.tsx?$/.test(target)) continue;
        if (registers(target, depth + 1, seen)) {
          ok = true;
          break;
        }
      }
    }
    reaches.set(`${file}@${depth}`, ok);
    return ok;
  }
  return (page: string): Classification => {
    if (registers(page, 0, new Set())) return "registers";
    const src = read(page);
    // A pure redirect: it redirects, and renders no JSX of its own.
    if (REDIRECT_ONLY.test(src) && !/<[A-Za-z]/.test(src.replace(/\/\*[\s\S]*?\*\/|\/\/.*$/gm, ""))) {
      return "redirect";
    }
    return "missing";
  };
}

function routeOf(root: string, page: string): string {
  return relative(root, page).split(sep).join("/");
}

interface Report {
  total: number;
  registers: string[];
  redirects: string[];
  allowlisted: string[];
  baselined: string[];
  newMissing: string[];
  staleBaseline: string[];
  reasonless: string[];
}

function run(root: string, baseline: string[], allowlist: Record<string, string>): Report {
  const classify = makeClassifier(root);
  const pages = GROUPS.flatMap((g) => walk(join(root, g)));
  const base = new Set(baseline);
  const r: Report = {
    total: pages.length,
    registers: [],
    redirects: [],
    allowlisted: [],
    baselined: [],
    newMissing: [],
    staleBaseline: [],
    reasonless: Object.entries(allowlist)
      .filter(([, why]) => !why || why.trim().length < 12)
      .map(([k]) => k),
  };
  for (const page of pages) {
    const route = routeOf(root, page);
    const c = classify(page);
    if (c === "registers") {
      r.registers.push(route);
      if (base.has(route)) r.staleBaseline.push(route);
    } else if (c === "redirect") r.redirects.push(route);
    else if (allowlist[route]) r.allowlisted.push(route);
    else if (base.has(route)) r.baselined.push(route);
    else r.newMissing.push(route);
  }
  return r;
}

const BASELINE = join(REPO, "scripts/page-capture-baseline.json");
const ALLOWLIST = join(REPO, "scripts/page-capture-allowlist.json");

function loadJson<T>(path: string, fallback: T): T {
  return existsSync(path) ? (JSON.parse(readFileSync(path, "utf8")) as T) : fallback;
}

function selfTest(): void {
  const dir = mkdtempSync(join(tmpdir(), "page-capture-"));
  const put = (rel: string, body: string) => {
    mkdirSync(dirname(join(dir, rel)), { recursive: true });
    writeFileSync(join(dir, rel), body);
  };
  put("app/(core)/wired/page.tsx", `import { W } from "@/features/w/W";\nexport default function P(){return <W/>}`);
  put(
    "features/w/W.tsx",
    `import { usePageCapture } from "@/components/agent-copy/page-capture/usePageCapture";\nexport function W(){ usePageCapture(() => tablePageCapture({})); return <div/> }`,
  );
  put("app/(core)/bare/page.tsx", `export default function P(){return <div>hi</div>}`);
  put("app/(core)/dialog-only/page.tsx", `export default function P(){ usePageCapture(() => dialogCapture({})); return <div/> }`);
  put("app/(admin)/landing/page.tsx", `export default function P(){return <AdminPageCapture title="x"/>}`);
  put("app/(core)/go/page.tsx", `import { redirect } from "next/navigation";\nexport default function P(){ redirect("/x"); }`);
  const failures: string[] = [];
  const r = run(dir, [], {});
  const expect = (cond: boolean, what: string) => {
    if (!cond) failures.push(what);
  };
  expect(r.registers.includes("app/(core)/wired/page.tsx"), "GREEN: a page whose feature registers");
  expect(r.registers.includes("app/(admin)/landing/page.tsx"), "GREEN: <AdminPageCapture>");
  expect(r.redirects.includes("app/(core)/go/page.tsx"), "GREEN: a pure redirect");
  expect(r.newMissing.includes("app/(core)/bare/page.tsx"), "RED: a page with no capture");
  expect(r.newMissing.includes("app/(core)/dialog-only/page.tsx"), "RED: a dialog capture is not the page's");
  const withBase = run(dir, ["app/(core)/bare/page.tsx", "app/(core)/dialog-only/page.tsx", "app/(core)/wired/page.tsx"], {});
  expect(withBase.newMissing.length === 0, "GREEN: census routes pass");
  expect(withBase.staleBaseline.includes("app/(core)/wired/page.tsx"), "RED: a wired route left in the census is stale");
  const reasonless = run(dir, [], { "app/(core)/bare/page.tsx": "" });
  expect(reasonless.reasonless.length === 1, "RED: a reasonless allowlist entry");
  if (failures.length > 0) {
    console.error(`self-test FAILED:\n  ${failures.join("\n  ")}`);
    process.exit(1);
  }
  console.log("self-test passed: 8 cases (3 red, 5 green)");
}

function main(): void {
  const args = new Set(process.argv.slice(2));
  if (args.has("--self-test")) return selfTest();
  const allowlist = loadJson<Record<string, string>>(ALLOWLIST, {});
  const baseline = args.has("--no-baseline") ? [] : loadJson<string[]>(BASELINE, []);
  const argv = process.argv.slice(2);
  const rootAt = argv.indexOf("--root");
  const root = rootAt >= 0 ? resolve(argv[rootAt + 1]) : REPO;
  const r = run(root, baseline, allowlist);
  if (args.has("--list-registered")) {
    console.log(r.registers.join("\n"));
    return;
  }
  if (args.has("--write-baseline")) {
    const current = new Set(loadJson<string[]>(BASELINE, []));
    const next = [...r.baselined, ...r.newMissing].sort();
    const grown = current.size > 0 ? next.filter((x) => !current.has(x)) : [];
    if (grown.length > 0) {
      console.error(`Refusing to grow the census; these routes are new and must register:\n  ${grown.join("\n  ")}`);
      process.exit(1);
    }
    writeFileSync(BASELINE, `${JSON.stringify(next, null, 2)}\n`);
    console.log(`census written: ${next.length} routes`);
    return;
  }
  console.log(
    `page capture: ${r.registers.length} of ${r.total} routes register; ${r.redirects.length} pure redirects; ` +
      `${r.allowlisted.length} allowlisted; ${r.baselined.length} in the census; ${r.newMissing.length} new without a capture; ` +
      `${r.staleBaseline.length} stale census entries`,
  );
  let failed = false;
  if (r.newMissing.length > 0) {
    failed = true;
    console.error(
      `\nThese routes render without registering a page capture (usePageCapture with tablePageCapture / recordPageCapture / adminPageCapture, or <AdminPageCapture>), and are not in the census:\n  ${r.newMissing.join("\n  ")}`,
    );
  }
  if (r.staleBaseline.length > 0) {
    failed = true;
    console.error(`\nThese routes register now; remove them from scripts/page-capture-baseline.json:\n  ${r.staleBaseline.join("\n  ")}`);
  }
  if (r.reasonless.length > 0) {
    failed = true;
    console.error(`\nAllowlist entries need a reason:\n  ${r.reasonless.join("\n  ")}`);
  }
  if (failed) process.exit(1);
}

main();
