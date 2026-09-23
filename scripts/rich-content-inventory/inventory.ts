#!/usr/bin/env npx tsx
/**
 * Rich-content legacy inventory + guard.
 *
 *   pnpm rich-content:inventory              regenerate INVENTORY.md + inventory.json (tracked files)
 *   pnpm check:rich-content-legacy           guard: NEW banned sites fail; stale baseline entries fail
 *   pnpm check:rich-content-legacy:self-test plant offenders in a virtual copy → RED, then GREEN
 *   ... inventory.ts --prune-baseline        drop stale entries (the baseline only ever shrinks)
 *
 * Registry: ./registry.ts. Doc: ./FEATURE.md.
 * Plan: common-docs/projects/rich-content-unification/PLAN.md §7.
 */

import fs from "node:fs";
import path from "node:path";
import { exitAfterDrain } from "../lib/exit-after-drain";
import { LEGACY_PIECES, type LegacyPiece } from "./registry";
import { analyze, repoHost, surfacesFor, type Analysis, type Site, type SourceHost } from "./scan";

const ROOT = path.resolve(__dirname, "..", "..");
const HERE = __dirname;
const BASELINE_PATH = path.join(HERE, "baseline.json");
const SHARED_THRESHOLD = 10;

const pieceById = new Map(LEGACY_PIECES.map((p) => [p.id, p]));
const piece = (id: string): LegacyPiece => pieceById.get(id)!;

// ─── Baseline ────────────────────────────────────────────────────────────────

const keyOf = (s: Site): string => `${s.pieceId} :: ${s.file}`;

function bannedKeys(a: Analysis): Map<string, Site[]> {
  const out = new Map<string, Site[]>();
  for (const s of a.sites) {
    if (piece(s.pieceId).status !== "banned") continue;
    const k = keyOf(s);
    if (!out.has(k)) out.set(k, []);
    out.get(k)!.push(s);
  }
  return out;
}

interface BaselineFile {
  note: string;
  entries: string[];
}

function readBaseline(): string[] | null {
  if (!fs.existsSync(BASELINE_PATH)) return null;
  return (JSON.parse(fs.readFileSync(BASELINE_PATH, "utf8")) as BaselineFile).entries;
}

function writeBaseline(entries: string[]): void {
  const body: BaselineFile = {
    note:
      "Shrink-only baseline for `pnpm check:rich-content-legacy`: every existing banned legacy site, keyed " +
      "`<piece id> :: <file>`. A NEW key fails; a key that no longer exists fails until removed with " +
      "`npx tsx scripts/rich-content-inventory/inventory.ts --prune-baseline`. Never add entries by hand.",
    entries: [...entries].sort(),
  };
  fs.writeFileSync(BASELINE_PATH, `${JSON.stringify(body, null, 2)}\n`);
}

interface Verdict {
  fresh: { key: string; sites: Site[] }[];
  stale: string[];
}

function evaluate(baseline: string[], current: Map<string, Site[]>): Verdict {
  const b = new Set(baseline);
  return {
    fresh: [...current].filter(([k]) => !b.has(k)).map(([key, sites]) => ({ key, sites })),
    stale: baseline.filter((k) => !current.has(k)),
  };
}

function renderVerdict(v: Verdict): string {
  const lines: string[] = [];
  for (const { sites } of v.fresh) {
    const p = piece(sites[0].pieceId);
    lines.push(`✖ NEW legacy use: ${p.label}  —  ${sites[0].file}`);
    for (const s of sites) lines.push(`    ${s.file}:${s.line}  ${s.detail}${s.via ? `  (via ${s.via})` : ""}`);
    lines.push(`    → ${p.replacement}`);
  }
  for (const k of v.stale) {
    lines.push(`✖ STALE baseline entry (the legacy use is gone — shrink the baseline): ${k}`);
  }
  if (v.stale.length) {
    lines.push("    → npx tsx scripts/rich-content-inventory/inventory.ts --prune-baseline, and commit baseline.json");
  }
  return lines.join("\n");
}

// ─── Inventory output ────────────────────────────────────────────────────────

function generate(a: Analysis): void {
  const siteFiles = [...new Set(a.sites.map((s) => s.file))];
  const surf = surfacesFor(a, siteFiles);
  const byFile = new Map<string, Site[]>();
  for (const s of a.sites) {
    if (!byFile.has(s.file)) byFile.set(s.file, []);
    byFile.get(s.file)!.push(s);
  }
  const shared = siteFiles.filter((f) => (surf.get(f)?.size ?? 0) > SHARED_THRESHOLD).sort();
  const sharedSet = new Set(shared);
  const unreached = siteFiles.filter((f) => (surf.get(f)?.size ?? 0) === 0).sort();

  const unresolvedCode = a.unresolved.filter((u) => !/\.(css|scss|sass|less|svg|png|jpe?g|gif|webp|json|md|txt)$/.test(u.spec));

  // Surface → files.
  const bySurface = new Map<string, Set<string>>();
  for (const f of siteFiles) {
    for (const s of surf.get(f) ?? []) {
      if (!bySurface.has(s)) bySurface.set(s, new Set());
      bySurface.get(s)!.add(f);
    }
  }

  // Headline counts.
  type Row = { category: string; status: string; pieces: Set<string>; sites: number; files: Set<string> };
  const cat = new Map<string, Row>();
  for (const p of LEGACY_PIECES) {
    const k = `${p.category}|${p.status}`;
    if (!cat.has(k)) cat.set(k, { category: p.category, status: p.status, pieces: new Set(), sites: 0, files: new Set() });
    cat.get(k)!.pieces.add(p.id);
  }
  for (const s of a.sites) {
    const p = piece(s.pieceId);
    const r = cat.get(`${p.category}|${p.status}`)!;
    r.sites++;
    r.files.add(s.file);
  }

  // Per surface: sites in files only this surface (or ≤ SHARED_THRESHOLD surfaces) reaches = "own"; all = incl. shared.
  const surfaceCounts = [...bySurface].map(([s, files]) => {
    const all = { banned: 0, tracked: 0, review: 0 };
    const own = { banned: 0, tracked: 0, review: 0 };
    let ownFiles = 0;
    for (const f of files) {
      const isOwn = !sharedSet.has(f);
      if (isOwn) ownFiles++;
      for (const site of byFile.get(f)!) {
        const st = piece(site.pieceId).status;
        all[st]++;
        if (isOwn) own[st]++;
      }
    }
    return { surface: s, files: files.size, ownFiles, all, own };
  });
  surfaceCounts.sort(
    (x, y) =>
      y.own.banned - x.own.banned ||
      y.own.review + y.own.tracked - (x.own.review + x.own.tracked) ||
      x.surface.localeCompare(y.surface),
  );

  const siteLine = (s: Site): string => {
    const p = piece(s.pieceId);
    const tag = p.status === "banned" ? "BANNED" : p.status === "tracked" ? "tracked" : "review";
    return `\`${s.file}:${s.line}\` — **${p.label}** (${tag}) — \`${s.detail.replace(/`/g, "'")}\`${s.via ? ` via \`${s.via}\`` : ""}${s.typeOnly ? " (type-only)" : ""}`;
  };

  const md: string[] = [];
  md.push("# Rich content legacy inventory");
  md.push("");
  md.push(
    "GENERATED — never edit by hand. Regenerate with `pnpm rich-content:inventory` (reads the import graph through the " +
      "TypeScript compiler API; aliases and re-exports followed). Registry: `scripts/rich-content-inventory/registry.ts`. " +
      "Plan: `common-docs/projects/rich-content-unification/PLAN.md` §7. BANNED rows are guarded by " +
      "`pnpm check:rich-content-legacy` (shrink-only `baseline.json`); tracked rows are today's entry points; review rows are heuristics.",
  );
  md.push("");
  md.push("## Headline");
  md.push("");
  md.push("| Category | Status | Pieces | Sites | Files |");
  md.push("|---|---|---:|---:|---:|");
  for (const r of [...cat.values()].sort((x, y) => x.status.localeCompare(y.status) || x.category.localeCompare(y.category))) {
    md.push(`| ${r.category} | ${r.status} | ${r.pieces.size} | ${r.sites} | ${r.files.size} |`);
  }
  md.push(
    `| **total** | | ${LEGACY_PIECES.length} | ${a.sites.length} | ${siteFiles.length} |`,
  );
  md.push("");
  md.push(`Files scanned: ${a.host.files.length}. Surfaces reached: ${bySurface.size}. Unresolved local code imports (broken or generated paths the graph cannot follow): ${unresolvedCode.length}.`);
  md.push("");
  md.push("## Pieces");
  md.push("");
  md.push("| Piece | Category | Status | Files | Sites | Replacement |");
  md.push("|---|---|---|---:|---:|---|");
  for (const p of LEGACY_PIECES) {
    const ss = a.sites.filter((s) => s.pieceId === p.id);
    md.push(
      `| ${p.label.replace(/\|/g, "\\|")} | ${p.category} | ${p.status} | ${new Set(ss.map((s) => s.file)).size} | ${ss.length} | ${p.replacement.replace(/\|/g, "\\|")} |`,
    );
  }
  md.push("");
  md.push("## Top surfaces (by their OWN legacy sites — shared files excluded)");
  md.push("");
  md.push("| Surface | Own files | Own banned | Own tracked | Own review | All banned (incl. shared) |");
  md.push("|---|---:|---:|---:|---:|---:|");
  for (const s of surfaceCounts.slice(0, 50)) {
    md.push(`| ${s.surface} | ${s.ownFiles} | ${s.own.banned} | ${s.own.tracked} | ${s.own.review} | ${s.all.banned} |`);
  }
  md.push("");
  md.push(`## Shared files — reach more than ${SHARED_THRESHOLD} surfaces (convert once, every surface benefits)`);
  md.push("");
  for (const f of shared) {
    const n = surf.get(f)!.size;
    md.push(`### \`${f}\` — reaches ${n} surfaces`);
    md.push("");
    for (const s of byFile.get(f)!) md.push(`- [ ] ${siteLine(s)}`);
    md.push("");
  }
  md.push("## By surface");
  md.push("");
  md.push("Each surface lists the legacy sites it reaches, EXCLUDING the shared files above.");
  md.push("");
  for (const s of [...bySurface.keys()].sort()) {
    const files = [...bySurface.get(s)!].filter((f) => !sharedSet.has(f)).sort();
    if (!files.length) continue;
    md.push(`### ${s}`);
    md.push("");
    for (const f of files) for (const site of byFile.get(f)!) md.push(`- [ ] ${siteLine(site)}`);
    md.push("");
  }
  md.push("## Reached by no surface");
  md.push("");
  md.push("No route, overlay or opener imports these (dead code, test-only, or loaded by a string registry the graph cannot see).");
  md.push("");
  for (const f of unreached) for (const site of byFile.get(f)!) md.push(`- [ ] ${siteLine(site)}`);
  md.push("");
  fs.writeFileSync(path.join(HERE, "INVENTORY.md"), md.join("\n"));

  // inventory.json: pieces → sites; files → surface indices (one line per file keeps it diffable and small).
  const surfaceNames = [...bySurface.keys()].sort();
  const surfaceIdx = new Map(surfaceNames.map((s, i) => [s, i]));
  const head = {
    generatedBy: "pnpm rich-content:inventory",
    filesScanned: a.host.files.length,
    sharedThreshold: SHARED_THRESHOLD,
    pieces: LEGACY_PIECES.map((p) => ({
      id: p.id,
      label: p.label,
      category: p.category,
      status: p.status,
      replacement: p.replacement,
      sites: a.sites
        .filter((s) => s.pieceId === p.id)
        .map(({ file, line, detail, via, typeOnly }) => ({ file, line, detail, via, typeOnly })),
    })),
    surfaces: surfaceNames,
    unresolvedLocalImports: unresolvedCode,
  };
  const fileLines = siteFiles
    .sort()
    .map((f) => {
      const idx = [...(surf.get(f) ?? [])].map((s) => surfaceIdx.get(s)!).sort((x, y) => x - y);
      return `  ${JSON.stringify(f)}: ${JSON.stringify({ shared: sharedSet.has(f), surfaces: idx })}`;
    });
  const headText = JSON.stringify(head, null, 1);
  fs.writeFileSync(
    path.join(HERE, "inventory.json"),
    `${headText.slice(0, -2)},\n "files": {\n${fileLines.join(",\n")}\n }\n}\n`,
  );

  // Console headline.
  console.log("Rich content legacy inventory");
  for (const r of [...cat.values()].sort((x, y) => x.status.localeCompare(y.status) || x.category.localeCompare(y.category))) {
    console.log(`  ${r.status.padEnd(8)} ${r.category.padEnd(22)} sites ${String(r.sites).padStart(5)}  files ${String(r.files.size).padStart(5)}`);
  }
  console.log(`  total sites ${a.sites.length} in ${siteFiles.length} files; ${bySurface.size} surfaces; ${shared.length} shared files; ${unreached.length} unreached files`);
  console.log("  top surfaces by own sites (banned / tracked / review; shared files excluded):");
  for (const s of surfaceCounts.slice(0, 15)) {
    console.log(`    ${String(s.own.banned).padStart(3)} / ${String(s.own.tracked).padStart(3)} / ${String(s.own.review).padStart(3)}  ${s.surface}`);
  }
  console.log(`Wrote ${path.relative(ROOT, path.join(HERE, "INVENTORY.md"))} and inventory.json`);
}

// ─── Self-test ───────────────────────────────────────────────────────────────

function withVirtual(base: SourceHost, add: Record<string, string>, override: Record<string, string> = {}): SourceHost {
  return {
    root: base.root,
    files: [...base.files, ...Object.keys(add)].sort(),
    read: (rel) => add[rel] ?? override[rel] ?? base.read(rel),
  };
}

function selfTest(): never {
  const fail = (msg: string): never => {
    console.error(`✖ self-test FAILED: ${msg}`);
    return exitAfterDrain(1);
  };
  const real = repoHost(ROOT, false);
  const baseAnalysis = analyze(real);
  const current = bannedKeys(baseAnalysis);
  const syntheticBaseline = [...current.keys()];

  // 1. GREEN: the tree against its own census.
  const v0 = evaluate(syntheticBaseline, current);
  if (v0.fresh.length || v0.stale.length) fail("tree vs its own census is not green");
  console.log(`✔ GREEN  real tree vs its own census (${syntheticBaseline.length} banned keys)`);

  // 2. RED: planted offenders — direct package, @/ alias default import, a barrel re-export, a hand-rolled textarea.
  const dir = "features/__rich_content_selftest__";
  const planted: Record<string, string> = {
    [`${dir}/PlantedDirect.tsx`]:
      'import ReactMarkdown from "react-markdown";\n' +
      'import FullScreenMarkdownEditor from "@/components/mardown-display/chat-markdown/FullScreenMarkdownEditor";\n' +
      "export function Planted() { return <ReactMarkdown>{String(FullScreenMarkdownEditor)}</ReactMarkdown>; }\n" +
      "function AutoTextarea() { return <textarea />; }\n" +
      "export const keep = AutoTextarea;\n",
    [`${dir}/barrel.ts`]: 'export * from "@/components/content-refine/BasicContentEditor";\n',
    [`${dir}/PlantedViaBarrel.tsx`]:
      'import { BasicContentEditor } from "./barrel";\nexport const x = BasicContentEditor;\n',
  };
  const expected = new Set([
    `pkg:react-markdown :: ${dir}/PlantedDirect.tsx`,
    `FullScreenMarkdownEditor :: ${dir}/PlantedDirect.tsx`,
    `hand-rolled:AutoTextarea :: ${dir}/PlantedDirect.tsx`,
    `BasicContentEditor :: ${dir}/barrel.ts`,
    `BasicContentEditor :: ${dir}/PlantedViaBarrel.tsx`,
  ]);
  const v1 = evaluate(syntheticBaseline, bannedKeys(analyze(withVirtual(real, planted))));
  const got = new Set(v1.fresh.map((f) => f.key));
  const missing = [...expected].filter((k) => !got.has(k));
  const extra = [...got].filter((k) => !expected.has(k));
  if (missing.length || extra.length || v1.stale.length) {
    fail(`planted offenders: missing [${missing.join(", ")}] extra [${extra.join(", ")}] stale ${v1.stale.length}`);
  }
  const report = renderVerdict(v1);
  if (!report.includes(piece("pkg:react-markdown").replacement)) fail("NEW-site message does not name the canonical replacement");
  const viaLine = v1.fresh.find((f) => f.key.endsWith("PlantedViaBarrel.tsx"))!.sites[0];
  if (viaLine.via !== `${dir}/barrel.ts`) fail(`barrel hop not recorded (via=${viaLine.via})`);
  console.log(`✔ RED    ${expected.size} planted offenders caught (direct package, @/ alias, barrel re-export, hand-rolled textarea):`);
  console.log(report.split("\n").map((l) => `         ${l}`).join("\n"));

  // 3. RED: a baseline entry whose legacy use disappears must fail as STALE.
  const victimKey = syntheticBaseline.find((k) => k.startsWith("pkg:"));
  if (!victimKey) return fail("no package-import baseline key to remove");
  const victimFile = victimKey.split(" :: ")[1];
  const victimKeys = syntheticBaseline.filter((k) => k.endsWith(` :: ${victimFile}`));
  const v2 = evaluate(syntheticBaseline, bannedKeys(analyze(withVirtual(real, {}, { [victimFile]: "export {};\n" }))));
  if (v2.fresh.length || v2.stale.length !== victimKeys.length || !victimKeys.every((k) => v2.stale.includes(k))) {
    fail(`stale detection: expected ${victimKeys.length} stale for ${victimFile}, got ${v2.stale.length} (+${v2.fresh.length} new)`);
  }
  console.log(`✔ RED    removing the legacy imports from ${victimFile} fails as ${v2.stale.length} STALE baseline entr${v2.stale.length === 1 ? "y" : "ies"}`);

  // 4. GREEN again once the plants are gone.
  const v3 = evaluate(syntheticBaseline, bannedKeys(analyze(real)));
  if (v3.fresh.length || v3.stale.length) fail("not green after removing the plants");
  console.log("✔ GREEN  plants removed → clean");
  console.log("self-test passed: the guard goes red on new and stale entries and green on the clean tree.");
  return exitAfterDrain(0);
}

// ─── Main ────────────────────────────────────────────────────────────────────

function main(): never {
  const args = process.argv.slice(2);
  if (args.includes("--self-test")) return selfTest();

  if (args.includes("--check")) {
    const baseline = readBaseline();
    if (!baseline) {
      console.error("✖ baseline.json missing — run `pnpm rich-content:inventory -- --init-baseline` once and commit it.");
      return exitAfterDrain(1);
    }
    const a = analyze(repoHost(ROOT, true));
    const v = evaluate(baseline, bannedKeys(a));
    if (!v.fresh.length && !v.stale.length) {
      console.log(`✔ check:rich-content-legacy — no new legacy rich-content use (${baseline.length} baselined, shrinking).`);
      return exitAfterDrain(0);
    }
    console.error(renderVerdict(v));
    console.error(
      `\n✖ check:rich-content-legacy — ${v.fresh.length} new, ${v.stale.length} stale. Registry: scripts/rich-content-inventory/registry.ts`,
    );
    return exitAfterDrain(1);
  }

  const a = analyze(repoHost(ROOT, false));
  if (args.includes("--prune-baseline")) {
    const baseline = readBaseline() ?? [];
    const cur = bannedKeys(a);
    const kept = baseline.filter((k) => cur.has(k));
    writeBaseline(kept);
    console.log(`Pruned ${baseline.length - kept.length} stale entries; ${kept.length} remain. (New entries are never added here.)`);
    return exitAfterDrain(0);
  }
  if (args.includes("--init-baseline")) {
    if (readBaseline()) {
      console.error("✖ baseline.json exists — the baseline only shrinks. Use --prune-baseline.");
      return exitAfterDrain(1);
    }
    writeBaseline([...bannedKeys(a).keys()]);
    console.log("Wrote baseline.json");
  }
  generate(a);
  return exitAfterDrain(0);
}

main();
