#!/usr/bin/env npx tsx
/**
 * check-registry.ts
 *
 * Integrity check for the Window Panels registry. Run standalone (e.g. from
 * a pre-commit hook or CI step) to catch drift before code review:
 *
 *   pnpm check:registry
 *
 * Validates:
 *   1. Every entry has required fields (slug, overlayId, kind, componentImport, label).
 *   2. kind: "window" entries have mobilePresentation.
 *   3. slug and overlayId are each unique.
 *   4. Every urlSync.key has a matching registerPanelHydrator call in initUrlHydration.ts.
 *   5. Every toolsGridTiles tile references a registered overlayId (or has onActivate).
 *   6. Every componentImport path resolves to a real file.
 *   7. Every overlayId in STATIC_REGISTRY has a matching DYNAMIC entry (componentImport).
 *   8. No orphan windows: every *.tsx that imports `<WindowPanel>` is either
 *      (a) referenced by a registry componentImport, (b) marked
 *      `@registry-status: sub-component | inline-window`, or (c) under a
 *      demo/test/excluded path.
 *
 * Exit codes:
 *   0  all checks pass
 *   1  at least one check failed
 *   2  file read / parse error
 */
import {
  existsSync,
  readFileSync,
  readdirSync,
  statSync,
} from "node:fs";
import { join, resolve, relative, sep } from "node:path";

const REPO_ROOT = resolve(__dirname, "..");
const REGISTRY_PATH = join(
  REPO_ROOT,
  "features/window-panels/registry/windowRegistry.ts",
);
const REGISTRY_METADATA_PATH = join(
  REPO_ROOT,
  "features/window-panels/registry/windowRegistryMetadata.ts",
);
const INIT_URL_HYDRATION_PATH = join(
  REPO_ROOT,
  "features/window-panels/url-sync/initUrlHydration.ts",
);
const TOOLS_GRID_TILES_PATH = join(
  REPO_ROOT,
  "features/window-panels/tools-grid/toolsGridTiles.ts",
);
const OVERLAY_IDS_PATH = join(
  REPO_ROOT,
  "features/window-panels/registry/overlay-ids.ts",
);

// Roots scanned for orphan-window detection.
const ORPHAN_SCAN_ROOTS = ["features", "components", "app"].map((d) =>
  join(REPO_ROOT, d),
);

// Paths excluded from orphan checking (demos, tests, worktrees, etc.).
const ORPHAN_EXCLUDE_PATTERNS: RegExp[] = [
  /node_modules/,
  /\/\.claude\//,
  /\/\.next\//,
  /\/__tests__\//,
  /\.test\.tsx?$/,
  /\.stories\.tsx?$/,
  /\/ssr\/demos\//,
  /\/registry\/tray-previews\.tsx$/,
  // The shell file itself, plus the popout / mobile surfaces that re-import it.
  /\/window-panels\/WindowPanel(?:\/|\.tsx$)/,
  /\/window-panels\/popout\//,
  /\/window-panels\/mobile\//,
  // Legacy file (orphan dead code, deletion handled separately).
  /\/components\/overlays\/OverlayController\.tsx$/,
  // Agent-comparison (formerly agent-battle) uses its own internal
  // WindowPanel surfaces — they're not meant to be in the overlay
  // registry; the feature renders them directly. Excluded so they don't
  // show up as orphan-window warnings on every build log.
  /\/features\/agent-(?:battle|comparison)\//,
];

interface RegistryEntry {
  slug?: string;
  overlayId?: string;
  kind?: string;
  label?: string;
  componentPath?: string;
  mobilePresentation?: string;
  urlSyncKey?: string;
  lineStart: number;
}

function die(code: number, msg: string): never {
  process.stderr.write(`check-registry: ${msg}\n`);
  process.exit(code);
}

function readFile(path: string): string {
  try {
    return readFileSync(path, "utf8");
  } catch (e) {
    die(2, `failed to read ${path}: ${(e as Error).message}`);
  }
}

/**
 * Parse the STATIC_REGISTRY array from windowRegistryMetadata.ts. Each entry
 * is a `{ ... }` literal. Walks the file and extracts known fields.
 */
function parseStaticRegistry(src: string): RegistryEntry[] {
  const entries: RegistryEntry[] = [];
  const lines = src.split("\n");
  let inArray = false;
  let depth = 0;
  let current: RegistryEntry | null = null;
  let buffer: string[] = [];

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];

    if (!inArray) {
      if (/const STATIC_REGISTRY: WindowStaticMetadata\[\] = \[/.test(line)) {
        inArray = true;
      }
      continue;
    }

    const opens = (line.match(/\{/g) || []).length;
    const closes = (line.match(/\}/g) || []).length;

    if (depth === 0 && /^\s*\{\s*$/.test(line)) {
      current = { lineStart: i + 1 };
      buffer = [];
    }

    if (current) buffer.push(line);

    depth += opens - closes;
    if (depth < 0) depth = 0;

    if (
      current &&
      depth === 0 &&
      (/^\s*\},?\s*$/.test(line) || /^\s*\}\s*,\s*$/.test(line))
    ) {
      const text = buffer.join("\n");
      const slug = /slug:\s*"([^"]+)"/.exec(text);
      if (slug) current.slug = slug[1];
      const overlayId = /overlayId:\s*"([^"]+)"/.exec(text);
      if (overlayId) current.overlayId = overlayId[1];
      const kind = /kind:\s*"([^"]+)"/.exec(text);
      if (kind) current.kind = kind[1];
      const label = /label:\s*"([^"]+)"/.exec(text);
      if (label) current.label = label[1];
      const mobile = /mobilePresentation:\s*"([^"]+)"/.exec(text);
      if (mobile) current.mobilePresentation = mobile[1];
      const urlKey = /urlSync:\s*\{\s*key:\s*"([^"]+)"/.exec(text);
      if (urlKey) current.urlSyncKey = urlKey[1];

      if (current.slug || current.overlayId) entries.push(current);
      current = null;
      buffer = [];
    }

    if (inArray && /^\];\s*$/.test(line)) break;
  }

  return entries;
}

/**
 * Parse the DYNAMIC map from windowRegistry.ts and return a Map of
 * `overlayId → importSpecifier`. Tolerant of multi-line `import("path")` and
 * `.then((m) => ({ default: m.X }))` forms.
 */
function parseDynamicComponentImports(src: string): Map<string, string> {
  const map = new Map<string, string>();
  const lines = src.split("\n");
  let inMap = false;
  let depth = 0;
  let currentKey: string | null = null;
  let buffer: string[] = [];

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];

    if (!inMap) {
      if (/const DYNAMIC:\s*Record<string,\s*DynamicAddition>\s*=\s*\{/.test(line)) {
        inMap = true;
      }
      continue;
    }

    const opens = (line.match(/\{/g) || []).length;
    const closes = (line.match(/\}/g) || []).length;

    // Top-level keys appear at depth 1 (we're inside the outer DYNAMIC = {).
    // A new entry starts when we're at depth 1 and a line matches `<id>: {`.
    if (depth === 0 && currentKey === null) {
      const keyMatch = /^\s*([A-Za-z_$][A-Za-z0-9_$]*):\s*\{/.exec(line);
      if (keyMatch) {
        currentKey = keyMatch[1];
        buffer = [];
      }
    }

    if (currentKey !== null) buffer.push(line);

    depth += opens - closes;
    if (depth < 0) depth = 0;

    // Entry closed when depth returns to 0 after we entered.
    if (
      currentKey !== null &&
      depth === 0 &&
      /^\s*\},?\s*$/.test(line)
    ) {
      const text = buffer.join("\n");
      const ci = /import\(\s*"([^"]+)"/.exec(text);
      if (ci) map.set(currentKey, ci[1]);
      currentKey = null;
      buffer = [];
    }

    // Map closed.
    if (inMap && depth === 0 && currentKey === null && /^\};\s*$/.test(line))
      break;
  }

  return map;
}

/** Extract every `registerPanelHydrator("key", ...)` key from initUrlHydration.ts. */
function parseHydratorKeys(src: string): Set<string> {
  const keys = new Set<string>();
  const rx = /registerPanelHydrator\(\s*"([^"]+)"/g;
  let m: RegExpExecArray | null;
  while ((m = rx.exec(src)) !== null) keys.add(m[1]);
  return keys;
}

/** Extract every `overlayId: "..."` in toolsGridTiles.ts. */
function parseToolsGridOverlayIds(src: string): Set<string> {
  const ids = new Set<string>();
  const rx = /overlayId:\s*"([^"]+)"/g;
  let m: RegExpExecArray | null;
  while ((m = rx.exec(src)) !== null) ids.add(m[1]);
  return ids;
}

interface Failure {
  level: "error" | "warn";
  msg: string;
}

function resolveComponentPath(importSpecifier: string): string {
  const cleaned = importSpecifier.replace(/^@\//, "");
  const abs = join(REPO_ROOT, cleaned);
  for (const suffix of [".tsx", ".ts", "/index.tsx", "/index.ts", ""]) {
    if (existsSync(abs + suffix)) return abs + suffix;
  }
  return "";
}

/**
 * Walk a directory tree and collect every *.tsx file path. Skips excluded
 * patterns.
 */
function walkTsx(root: string, out: string[]): void {
  let entries: string[];
  try {
    entries = readdirSync(root);
  } catch {
    return;
  }
  for (const name of entries) {
    const full = join(root, name);
    if (ORPHAN_EXCLUDE_PATTERNS.some((rx) => rx.test(full))) continue;
    let stat;
    try {
      stat = statSync(full);
    } catch {
      continue;
    }
    if (stat.isDirectory()) {
      walkTsx(full, out);
    } else if (stat.isFile() && full.endsWith(".tsx")) {
      out.push(full);
    }
  }
}

/**
 * Find every *.tsx file that imports `<WindowPanel>` from the canonical path.
 * Returns absolute paths.
 */
function findWindowPanelImporters(): string[] {
  const candidates: string[] = [];
  for (const root of ORPHAN_SCAN_ROOTS) walkTsx(root, candidates);

  const importers: string[] = [];
  const importRx =
    /from\s+["']@\/features\/window-panels\/WindowPanel(?:["']|\/[^"']*["'])/;

  for (const file of candidates) {
    let src: string;
    try {
      src = readFileSync(file, "utf8");
    } catch {
      continue;
    }
    if (importRx.test(src)) importers.push(file);
  }
  return importers;
}

/** Read first ~30 lines of the file looking for an `@registry-status:` marker. */
function readRegistryStatusMarker(file: string): string | null {
  let src: string;
  try {
    src = readFileSync(file, "utf8").slice(0, 4000);
  } catch {
    return null;
  }
  const m = /@registry-status:\s*([a-z-]+)/.exec(src);
  return m ? m[1] : null;
}

function toRel(abs: string): string {
  return relative(REPO_ROOT, abs).split(sep).join("/");
}

function main(): void {
  const metadataSrc = readFile(REGISTRY_METADATA_PATH);
  const registrySrc = readFile(REGISTRY_PATH);
  const hydrationSrc = readFile(INIT_URL_HYDRATION_PATH);
  const toolsGridSrc = existsSync(TOOLS_GRID_TILES_PATH)
    ? readFile(TOOLS_GRID_TILES_PATH)
    : "";

  const entries = parseStaticRegistry(metadataSrc);
  const dynamicImports = parseDynamicComponentImports(registrySrc);
  for (const e of entries) {
    if (e.overlayId && dynamicImports.has(e.overlayId)) {
      e.componentPath = dynamicImports.get(e.overlayId);
    }
  }

  const hydratorKeys = parseHydratorKeys(hydrationSrc);
  const gridOverlayIds = toolsGridSrc
    ? parseToolsGridOverlayIds(toolsGridSrc)
    : new Set<string>();

  const failures: Failure[] = [];
  const seenSlugs = new Set<string>();
  const seenOverlayIds = new Set<string>();
  const registeredOverlayIds = new Set<string>();
  const registeredImportPaths = new Set<string>();

  for (const e of entries) {
    const loc = `metadata line ${e.lineStart}`;
    if (!e.slug) failures.push({ level: "error", msg: `${loc}: entry missing slug` });
    if (!e.overlayId)
      failures.push({ level: "error", msg: `${loc}: entry missing overlayId` });
    if (!e.kind) failures.push({ level: "error", msg: `${loc}: entry missing kind` });
    if (!e.label) failures.push({ level: "error", msg: `${loc}: entry missing label` });
    if (!e.componentPath)
      failures.push({
        level: "error",
        msg: `${loc}: overlayId "${e.overlayId}" has no componentImport in DYNAMIC map (windowRegistry.ts)`,
      });

    if (e.slug) {
      if (seenSlugs.has(e.slug)) {
        failures.push({
          level: "error",
          msg: `${loc}: duplicate slug "${e.slug}"`,
        });
      }
      seenSlugs.add(e.slug);
    }

    if (e.overlayId) {
      if (seenOverlayIds.has(e.overlayId)) {
        failures.push({
          level: "error",
          msg: `${loc}: duplicate overlayId "${e.overlayId}"`,
        });
      }
      seenOverlayIds.add(e.overlayId);
      registeredOverlayIds.add(e.overlayId);
    }

    if (e.kind === "window" && !e.mobilePresentation) {
      failures.push({
        level: "error",
        msg: `${loc}: kind "window" (${e.overlayId}) requires mobilePresentation`,
      });
    }

    if (e.componentPath) {
      const resolved = resolveComponentPath(e.componentPath);
      if (!resolved) {
        failures.push({
          level: "error",
          msg: `${loc}: componentImport "${e.componentPath}" does not resolve to a file`,
        });
      } else {
        registeredImportPaths.add(resolved);
      }
    }

    if (e.urlSyncKey && !hydratorKeys.has(e.urlSyncKey)) {
      failures.push({
        level: "error",
        msg: `${loc}: urlSync.key "${e.urlSyncKey}" (${e.overlayId}) has no hydrator in initUrlHydration.ts`,
      });
    }
  }

  // DYNAMIC map keys without a matching STATIC_REGISTRY entry → drift.
  for (const dynKey of dynamicImports.keys()) {
    if (!seenOverlayIds.has(dynKey)) {
      failures.push({
        level: "error",
        msg: `windowRegistry.ts DYNAMIC map: "${dynKey}" has no matching STATIC_REGISTRY entry in windowRegistryMetadata.ts`,
      });
    }
  }

  // overlay-ids.ts OVERLAY_IDS tuple must match STATIC_REGISTRY exactly.
  // The tuple powers the OverlayId compile-time string-literal union; if it
  // drifts from the registry, callers can dispatch overlayIds that don't
  // exist (or fail to dispatch ones that do).
  if (existsSync(OVERLAY_IDS_PATH)) {
    const overlayIdsSrc = readFile(OVERLAY_IDS_PATH);
    const tupleRx = /^\s+"([a-zA-Z][a-zA-Z0-9]*)",?\s*$/gm;
    const declaredIds = new Set<string>();
    let m: RegExpExecArray | null;
    while ((m = tupleRx.exec(overlayIdsSrc)) !== null) {
      declaredIds.add(m[1]);
    }

    for (const registered of registeredOverlayIds) {
      if (!declaredIds.has(registered)) {
        failures.push({
          level: "error",
          msg: `overlay-ids.ts OVERLAY_IDS tuple is missing "${registered}" — add it to keep the OverlayId type union in sync with the registry.`,
        });
      }
    }
    for (const declared of declaredIds) {
      if (!registeredOverlayIds.has(declared)) {
        failures.push({
          level: "error",
          msg: `overlay-ids.ts OVERLAY_IDS tuple has stale entry "${declared}" — no matching STATIC_REGISTRY entry. Remove it or register the overlay.`,
        });
      }
    }
  } else {
    failures.push({
      level: "error",
      msg: `expected overlay-ids.ts at ${OVERLAY_IDS_PATH} — this file declares the OverlayId compile-time union and must exist.`,
    });
  }

  // Tools-grid tiles must reference a known overlayId.
  for (const overlayId of gridOverlayIds) {
    if (!registeredOverlayIds.has(overlayId)) {
      failures.push({
        level: "error",
        msg: `toolsGridTiles.ts: overlayId "${overlayId}" is not registered`,
      });
    }
  }

  // ─── Orphan-window detection ────────────────────────────────────────────────
  // Every *.tsx that imports <WindowPanel> must be either:
  //   (a) the target of a registry componentImport, or
  //   (b) marked with `@registry-status: sub-component | inline-window`, or
  //   (c) excluded by ORPHAN_EXCLUDE_PATTERNS (demos, tests, etc.).
  const importers = findWindowPanelImporters();
  let orphanCount = 0;
  for (const file of importers) {
    if (registeredImportPaths.has(file)) continue;
    const marker = readRegistryStatusMarker(file);
    if (marker === "sub-component" || marker === "inline-window") continue;
    // Loud-but-non-blocking: orphan windows are usually feature-local
    // surfaces that haven't (yet) been brought into the registry. We want
    // them visible in every build log so they're not invisible debt, but
    // they should never gate a deploy — a real registry mismatch (broken
    // componentImport path, missing slug, etc.) still surfaces as `error`.
    failures.push({
      level: "warn",
      msg: `orphan window: ${toRel(
        file,
      )} imports <WindowPanel> but is not registered and lacks a @registry-status marker — add the marker or register the entry`,
    });
    orphanCount++;
  }

  const errors = failures.filter((f) => f.level === "error");
  const warns = failures.filter((f) => f.level === "warn");

  process.stdout.write(
    `Window Panels registry integrity check\n` +
      `  entries:                          ${entries.length}\n` +
      `  url-sync hydrators:               ${hydratorKeys.size}\n` +
      `  tools-grid tiles (w/ overlayId):  ${gridOverlayIds.size}\n` +
      `  WindowPanel importers scanned:    ${importers.length}\n` +
      `  orphan windows:                   ${orphanCount}\n` +
      `  errors:                           ${errors.length}\n` +
      `  warnings:                         ${warns.length}\n\n`,
  );

  if (warns.length > 0) {
    process.stdout.write("WARNINGS:\n");
    for (const w of warns) process.stdout.write(`  ⚠  ${w.msg}\n`);
    process.stdout.write("\n");
  }

  if (errors.length > 0) {
    process.stderr.write("ERRORS:\n");
    for (const e of errors) process.stderr.write(`  ✗  ${e.msg}\n`);
    process.stderr.write("\nregistry integrity check failed.\n");
    process.exit(1);
  }

  process.stdout.write("all checks passed.\n");
  process.exit(0);
}

main();
