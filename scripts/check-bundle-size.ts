#!/usr/bin/env npx tsx
/**
 * check-bundle-size.ts
 *
 * Local bundle-size gate for the Windows Panels modernization work (and beyond).
 *
 * Measures the client-side JS weight of a small set of representative routes
 * from the most recent `pnpm build` and compares it to a checked-in baseline.
 *
 * Usage (after a full production build):
 *   pnpm tsx scripts/check-bundle-size.ts               # verify against baseline
 *   pnpm tsx scripts/check-bundle-size.ts --capture     # first-time baseline write
 *   pnpm tsx scripts/check-bundle-size.ts --update-baseline  # intentional update
 *   pnpm tsx scripts/check-bundle-size.ts --verbose     # show every chunk
 *
 * Exit codes:
 *   0  all tracked routes within threshold (default +2 KB per route)
 *   1  at least one route exceeded threshold
 *   2  .next manifest missing or unreadable
 *
 * Baseline file: features/window-panels/_baselines/bundle-before.json
 *
 * Tracked routes and thresholds live in TRACKED_ROUTES below. Update only
 * when you've intentionally added surface area; mention the reason in the PR.
 */
import { readFileSync, existsSync, statSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";

const REPO_ROOT = resolve(__dirname, "..");
const NEXT_DIR = join(REPO_ROOT, ".next");
const BASELINE_PATH = join(
  REPO_ROOT,
  "features/window-panels/_baselines/bundle-before.json",
);

const DEFAULT_THRESHOLD_BYTES = 2 * 1024; // +2 KB per route

type Manifest = Record<string, string[]>;
interface RouteReport {
  route: string;
  chunks: number;
  bytes: number;
}
interface Baseline {
  capturedAt: string;
  nextVersion: string | null;
  routes: Record<string, { chunks: number; bytes: number }>;
}

const TRACKED_ROUTES: Array<{ manifestKey: string; label: string }> = [
  { manifestKey: "/page", label: "/" },
  { manifestKey: "/(transitional)/dashboard/page", label: "/dashboard" },
  { manifestKey: "/(core)/tasks/page", label: "/tasks" },
  { manifestKey: "/(core)/agents/page", label: "/agents" },
  { manifestKey: "/(core)/notes/page", label: "/notes" },
];

function die(code: number, msg: string): never {
  process.stderr.write(`check-bundle-size: ${msg}\n`);
  process.exit(code);
}

function loadManifest(): Manifest {
  const candidates = [
    join(NEXT_DIR, "app-build-manifest.json"),
    join(NEXT_DIR, "build-manifest.json"),
  ];
  for (const path of candidates) {
    if (existsSync(path)) {
      try {
        const raw = JSON.parse(readFileSync(path, "utf8"));
        const pages = raw.pages ?? raw;
        if (pages && typeof pages === "object") return pages as Manifest;
      } catch (e) {
        die(2, `failed to parse ${path}: ${(e as Error).message}`);
      }
    }
  }
  die(
    2,
    `no build manifest found under ${NEXT_DIR}. Run \`pnpm build\` first.`,
  );
}

function readNextVersion(): string | null {
  try {
    const pkg = JSON.parse(
      readFileSync(join(REPO_ROOT, "package.json"), "utf8"),
    );
    return pkg.dependencies?.next ?? null;
  } catch {
    return null;
  }
}

function sizeOf(chunkRelPath: string): number {
  const abs = join(NEXT_DIR, chunkRelPath);
  try {
    return statSync(abs).size;
  } catch {
    return 0;
  }
}

function measure(manifest: Manifest): RouteReport[] {
  const reports: RouteReport[] = [];
  for (const { manifestKey, label } of TRACKED_ROUTES) {
    const direct = manifest[manifestKey];
    const fallbackKeys = Object.keys(manifest).filter(
      (k) => k === manifestKey || k.endsWith(manifestKey),
    );
    const key = direct ? manifestKey : fallbackKeys[0];
    const chunks = key ? (manifest[key] ?? []) : [];
    const bytes = chunks
      .filter((c) => c.endsWith(".js"))
      .reduce((acc, c) => acc + sizeOf(c), 0);
    reports.push({
      route: label,
      chunks: chunks.length,
      bytes,
    });
  }
  return reports;
}

function fmtBytes(n: number): string {
  if (n === 0) return "0 B";
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  return `${(n / (1024 * 1024)).toFixed(2)} MB`;
}

function fmtDelta(delta: number): string {
  const sign = delta > 0 ? "+" : delta < 0 ? "−" : " ";
  return `${sign}${fmtBytes(Math.abs(delta))}`;
}

function writeBaseline(reports: RouteReport[]): void {
  const baseline: Baseline = {
    capturedAt: new Date().toISOString(),
    nextVersion: readNextVersion(),
    routes: Object.fromEntries(
      reports.map((r) => [r.route, { chunks: r.chunks, bytes: r.bytes }]),
    ),
  };
  writeFileSync(BASELINE_PATH, JSON.stringify(baseline, null, 2) + "\n");
  process.stdout.write(
    `Baseline written to ${BASELINE_PATH.replace(REPO_ROOT + "/", "")}\n`,
  );
  for (const r of reports) {
    process.stdout.write(
      `  ${r.route.padEnd(20)} ${String(r.chunks).padStart(4)} chunks   ${fmtBytes(r.bytes)}\n`,
    );
  }
}

function compare(reports: RouteReport[], verbose: boolean): number {
  if (!existsSync(BASELINE_PATH)) {
    process.stdout.write(
      "No baseline found. Run with --capture to create one.\n",
    );
    return 0;
  }
  const baseline = JSON.parse(readFileSync(BASELINE_PATH, "utf8")) as Baseline;
  let failed = 0;
  const rows: string[] = [];
  rows.push(
    `Route               Before        After         Delta          Status`,
  );
  rows.push(
    `──────────────────────────────────────────────────────────────────────`,
  );
  for (const r of reports) {
    const base = baseline.routes[r.route];
    if (!base) {
      rows.push(
        `${r.route.padEnd(20)} —             ${fmtBytes(r.bytes).padEnd(12)}  (new)          NEW`,
      );
      continue;
    }
    const delta = r.bytes - base.bytes;
    const over = delta > DEFAULT_THRESHOLD_BYTES;
    if (over) failed++;
    const status = over ? "FAIL" : delta > 0 ? "warn" : "ok";
    rows.push(
      `${r.route.padEnd(20)} ${fmtBytes(base.bytes).padEnd(12)}  ${fmtBytes(r.bytes).padEnd(12)}  ${fmtDelta(delta).padEnd(12)}   ${status}`,
    );
  }
  process.stdout.write(rows.join("\n") + "\n");
  if (verbose) {
    process.stdout.write(
      `\nThreshold: +${fmtBytes(DEFAULT_THRESHOLD_BYTES)} per route.\n`,
    );
    process.stdout.write(`Baseline captured: ${baseline.capturedAt}\n`);
  }
  if (failed > 0) {
    process.stderr.write(
      `\n${failed} route(s) exceeded the ${fmtBytes(DEFAULT_THRESHOLD_BYTES)} threshold.\n`,
    );
    process.stderr.write(
      `If the growth is intentional, rerun with --update-baseline and document the reason in the PR.\n`,
    );
    return 1;
  }
  return 0;
}

function main(): void {
  const args = new Set(process.argv.slice(2));
  const capture = args.has("--capture");
  const update = args.has("--update-baseline");
  const verbose = args.has("--verbose") || args.has("-v");

  if (!existsSync(NEXT_DIR)) {
    die(2, `${NEXT_DIR} missing. Run \`pnpm build\` first.`);
  }

  const manifest = loadManifest();
  const reports = measure(manifest);

  if (capture) {
    if (existsSync(BASELINE_PATH)) {
      die(
        2,
        `baseline already exists at ${BASELINE_PATH}. Use --update-baseline instead.`,
      );
    }
    writeBaseline(reports);
    process.exit(0);
  }

  if (update) {
    writeBaseline(reports);
    process.exit(0);
  }

  process.exit(compare(reports, verbose));
}

main();
