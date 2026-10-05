/**
 * check-no-data-v2 — the record store lives at /data (Arman, 2026-10-04: "if we're live, then we
 * need to use 'data' instead of data-v2"). Two rules, both red on any hit:
 *
 *  1. No tracked source file names the route "/data-v2" except the permanent redirect rule in
 *     next.config.js (saved links and DB-built hrefs keep landing). Historical SQL under
 *     migrations/ and prose (*.md) are history, not links, and are not scanned. A file path that
 *     merely contains "data-v2-" (e.g. scripts/data-v2-views-1-walk.mjs) is not the route.
 *  2. No file under app/(core)/data reads a retired table of the old data system (the deprecated
 *     schema, udt_datasets / udt_dataset_*, udt_structured_list*, udt_bulk_write).
 *
 * Usage: pnpm check:no-data-v2   ·   pnpm check:no-data-v2 --self-test
 */
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";

const ROUTE = /(?:^|[^A-Za-z0-9_])(?:\/|%2F)data-v2(?![A-Za-z0-9_-])/;
const RETIRED = /udt_dataset|udt_structured_list|udt_bulk_write|schema\(\s*["'`]deprecated["'`]\s*\)|["'`]deprecated\./;
const REDIRECT_FILE = "next.config.js";
const DATA_ROUTES = "app/(core)/data/";
const SELF = "scripts/check-no-data-v2.ts";

export type Finding = { file: string; line: number; rule: "data-v2-route" | "retired-table"; text: string };

export function scan(files: ReadonlyArray<{ path: string; text: string }>): Finding[] {
  const out: Finding[] = [];
  for (const { path, text } of files) {
    if (path === SELF) continue;
    const lines = text.split("\n");
    lines.forEach((ln, i) => {
      if (ROUTE.test(ln)) {
        const allowed = path === REDIRECT_FILE && /source:\s*["']\/data-v2|data-v2/.test(ln) && isRedirectBlock(lines, i);
        if (!allowed) out.push({ file: path, line: i + 1, rule: "data-v2-route", text: ln.trim() });
      }
      if (path.startsWith(DATA_ROUTES) && RETIRED.test(ln)) {
        out.push({ file: path, line: i + 1, rule: "retired-table", text: ln.trim() });
      }
    });
  }
  return out;
}

/** In next.config.js only the redirect rule (and its own comment block) may say "/data-v2". */
function isRedirectBlock(lines: string[], i: number): boolean {
  for (let j = i; j >= Math.max(0, i - 6); j--) {
    if (/source:\s*["']\/data-v2/.test(lines[j]) || /THE ONLY place "\/data-v2"/.test(lines[j])) return true;
  }
  for (let j = i; j < Math.min(lines.length, i + 6); j++) {
    if (/source:\s*["']\/data-v2/.test(lines[j])) return true;
  }
  return false;
}

function trackedFiles(): string[] {
  return execFileSync("git", ["ls-files"], { encoding: "utf8", maxBuffer: 64 * 1024 * 1024 })
    .split("\n")
    .filter((f) => f && !f.startsWith("migrations/") && !f.endsWith(".md") && /\.(tsx?|m?jsx?|cjs|json|sql|sh|ya?ml|py|parked|patch)$/.test(f));
}

function selfTest(): void {
  const red = scan([
    { path: "features/x/link.ts", text: 'const href = `/data-v2/${id}`;' },
    { path: "scripts/walk.mjs", text: "page.goto(`${O}/login?next=%2Fdata-v2`)" },
    { path: "next.config.js", text: 'const elsewhere = "/data-v2";' },
    { path: "app/(core)/data/[tableId]/page.tsx", text: 'supabase.from("udt_datasets").select()' },
    { path: "app/(core)/data/page.tsx", text: 'supabase.schema("deprecated").from("x")' },
  ]);
  const green = scan([
    { path: "next.config.js", text: '      { source: "/data-v2/:path*", destination: "/data/:path*", permanent: true },' },
    { path: "scripts/data-v2-views-1-walk.mjs", text: "// scripts/data-v2-views-1-walk.mjs" },
    { path: "features/x/link.ts", text: "const href = `/data/${id}`; const key = `data-v2:${id}`;" },
    { path: "features/documents/svc.ts", text: 'supabase.from("udt_datasets")' },
  ]);
  const ok = red.length === 5 && green.length === 0;
  console.log(ok ? "self-test: PASS (5 red, 0 green)" : `self-test: FAIL red=${red.length} green=${JSON.stringify(green)}`);
  process.exit(ok ? 0 : 1);
}

if (process.argv.includes("--self-test")) selfTest();
else {
  const files = trackedFiles().flatMap((path) => {
    try {
      return [{ path, text: readFileSync(path, "utf8") }];
    } catch {
      return [];
    }
  });
  const findings = scan(files);
  for (const f of findings) console.log(`${f.file}:${f.line}  [${f.rule}]  ${f.text.slice(0, 160)}`);
  if (findings.length) {
    console.error(`\ncheck-no-data-v2: ${findings.length} finding(s). The record store lives at /data; "/data-v2" exists only as the redirect in next.config.js.`);
    process.exit(1);
  }
  console.log(`check-no-data-v2: clean (${files.length} files).`);
}
