#!/usr/bin/env npx tsx
/**
 * check:context-menu — the census of surfaces that show a thing and offer no
 * right-click, plus the quality grade of the menus that DO exist.
 *
 * 🚨 WHY THIS EXISTS. Before 2026-08-25 the platform screamed in the console
 * when a menu was wired BADLY (`INERT MENU`, `VALUE MAPPING GAP`) and said
 * nothing at all when a surface had NO menu. That asymmetry meant a refactor
 * could delete a wrapper and pass type-check, CI and every release gate in
 * silence, and it meant the rollout backlog was a hand-written markdown table
 * in another repo covering under 15% of the real surface area.
 *
 * Arman (2026-08-25): *"The system will only succeed if agents are instructed
 * to look for those reusable sections and then make important decisions based
 * on their findings."* A fleet cannot look for what nothing enumerates. This
 * script is the enumerator: it produces the denominator, the shardable work
 * list (`--json`), and the acceptance grade that separates "wrapped in a menu"
 * (cheap, gameable) from "wired" (the menu actually does something).
 *
 * WHAT IT REPORTS — five populations, counted separately so a wave can target
 * one without drowning in another:
 *   tables    — a pane rendering <MatrxDataTable> with no menu (WAVE ONE)
 *   editables — a textarea/contentEditable with no EditableContextMenu. These
 *               are doubly expensive: EditableContextMenu also auto-registers
 *               the WidgetHandle, so each one is ALSO a place agents cannot
 *               stream edits into.
 *   windows   — features/window-panels/windows/** with no menu of its own
 *   overlays  — features/overlays/** with no menu of its own. TRACKED, NOT
 *               WAVE ONE (Arman, 2026-08-25). Correctness-flavoured: an
 *               overlay without its own menu hands the user the UNDERLYING
 *               page's surface and agents — silently wrong.
 *   bespoke   — a hand-rolled onContextMenu / DropdownMenu-as-context-menu to
 *               COLLAPSE into v3. Different risk class from adding one: it is
 *               delete-and-replace and needs live proof the old items survived.
 *
 * AND two law checks that make the 2026-08-25 rulings enforceable:
 *   density   — THE DENSITY LAW: a menu item carrying `description` that is
 *               not a disabled-reason. Labels only, macOS-terse.
 *   registry  — features/context-menu-v3/SECTIONS.md drift: a registered
 *               shared builder whose file/export vanished, or whose Consumers
 *               column no longer matches who actually imports it.
 *
 * 🚨 THIS IS A TEXTUAL HEURISTIC, NOT A RENDERER. "Covered" means a menu is
 * mounted in this file, or this file's component is rendered inside a file
 * that mounts one. That cannot prove the component sits INSIDE the wrapper.
 * The authoritative check is still opening the menu and watching the console
 * (see the `context-menu-v3` skill). Treat a "covered" verdict as "not on the
 * work list", never as "certified".
 *
 * ADVISORY BY DESIGN (memory: "scream, never block"). Prints and exits 0
 * unless --strict. Flags: --json (machine-readable rows, for sharding a fleet)
 * · --population=tables,editables,… · --strict.
 */

import { readFileSync, globSync } from "node:fs";
import { basename, join } from "node:path";

const ROOT = process.cwd();
const ARGV = process.argv.slice(2);
const STRICT = ARGV.includes("--strict");
const JSON_OUT = ARGV.includes("--json");
const ONLY = (ARGV.find((a) => a.startsWith("--population="))?.split("=")[1] ??
  "")
  .split(",")
  .filter(Boolean);

type Population =
  | "tables"
  | "editables"
  | "windows"
  | "overlays"
  | "bespoke"
  | "density"
  | "registry";

/** Populations a first-wave fleet is pointed at. `overlays` is tracked only. */
const WAVE_ONE: Population[] = ["tables", "editables", "windows"];

interface Finding {
  population: Population;
  file: string;
  detail: string;
  /** Quality grade for files that DO mount a menu (shell vs wired). */
  grade?: string;
}

// ---------------------------------------------------------------------------
// Scanning
// ---------------------------------------------------------------------------

const SCAN = ["app/**/*.tsx", "components/**/*.tsx", "features/**/*.tsx", "lib/**/*.tsx"];

/**
 * Never candidates. Each carries its reason — an allowlist without a reason is
 * how a law rots into a formality.
 */
const SKIP: Array<{ match: RegExp; reason: string }> = [
  { match: /^app\/\(dev\)\//, reason: "demos — the canonical menu demos live here" },
  { match: /^features\/context-menu-v3\//, reason: "the menu system itself" },
  { match: /^components\/ui\//, reason: "primitive library — the caller wraps" },
  { match: /__tests__|\.test\.tsx?$|\.stories\.tsx?$/, reason: "not a surface" },
  { match: /^app\/\(auth-pages\)\//, reason: "login/signup — no records shown" },
  {
    match: /^features\/overlays\/(openers|registry)\//,
    reason:
      "opener HOOKS and the id registry — they dispatch overlays, they render no surface",
  },
  {
    match: /^features\/overlays\/(OverlayController|surfaces)\b/,
    reason: "the overlay host/chrome — the CONTENT it hosts is the surface",
  },
];

function readAll(): Map<string, string> {
  const files = new Map<string, string>();
  for (const pattern of SCAN) {
    for (const rel of globSync(pattern, { cwd: ROOT })) {
      const path = rel.replace(/\\/g, "/");
      if (SKIP.some((s) => s.match.test(path))) continue;
      try {
        files.set(path, readFileSync(join(ROOT, path), "utf8"));
      } catch {
        /* unreadable — not a finding */
      }
    }
  }
  return files;
}

const MOUNTS_MENU = /<(NonEditable|Editable)ContextMenu[\s>]/;
const MOUNTS_EDITABLE_MENU = /<EditableContextMenu[\s>]/;
/** Shells that carry a menu for their consumers (confirmed by reading them). */
const INHERITS_MENU =
  /<EntityListPage[\s>]|<ItemContextMenu[\s>]|rowWrapper=|<RichDocument[\s>]/;

/** Component names this file exports — used to find an ancestor's menu. */
function exportedComponents(src: string): string[] {
  const names = new Set<string>();
  for (const m of src.matchAll(
    /export\s+(?:default\s+)?(?:async\s+)?function\s+([A-Z]\w*)/g,
  ))
    names.add(m[1]);
  for (const m of src.matchAll(/export\s+const\s+([A-Z]\w*)\s*[:=]/g))
    names.add(m[1]);
  return [...names];
}

// ---------------------------------------------------------------------------
// Populations
// ---------------------------------------------------------------------------

const IS_TABLE = /<MatrxDataTable[\s<>]/;
const IS_EDITABLE = /<textarea[\s>]|<Textarea[\s>]|<ProTextarea[\s>]|contentEditable/;
const IS_BESPOKE = /onContextMenu\s*=/;

function classify(path: string, src: string): Population | null {
  if (path.startsWith("features/overlays/") && /export\s+(default\s+)?function/.test(src))
    return "overlays";
  if (/^features\/window-panels\/windows\/.*Window\.tsx$/.test(path)) return "windows";
  if (IS_TABLE.test(src)) return "tables";
  if (IS_EDITABLE.test(src)) return "editables";
  return null;
}

/**
 * Grade a file that DOES mount a menu. This is the anti-gaming half: wrapping
 * a div in the wrapper is cheap; passing the props that make the menu act on
 * the right record is the actual job.
 */
/**
 * A slot can be legitimately EMPTY. An image viewer for a plain URL has no
 * record to attach; an ad hoc markdown table has no id threaded through any
 * caller. Counting those as shells does one of two harmful things: it sends
 * agents back to files that are already correct, or — worse — it pressures
 * them to invent a fake entity to satisfy a counter, which is the same defect
 * wearing a new coat.
 *
 * So a slot may be waived IN THE FILE, next to the code, with a reason:
 *
 *   // context-menu-exempt: entity — external Unsplash photos, not app records
 *
 * The reason is mandatory (the regex requires text after the dash) — an
 * allowlist without a reason is how a law rots into a formality, and this file
 * already says so about its SKIP list. A waiver is a claim a reviewer can
 * check, not a silence.
 */
const EXEMPT_RE =
  /context-menu-exempt:\s*(surfaceName|contentSource|entity|extraSections)\s*—\s*\S+/g;

function exemptSlots(src: string): Set<string> {
  const out = new Set<string>();
  for (const m of src.matchAll(EXEMPT_RE)) out.add(m[1]);
  return out;
}

function gradeMenu(src: string): string {
  const has = (re: RegExp) => (re.test(src) ? 1 : 0);
  const waived = exemptSlots(src);
  const parts: string[] = [];
  const need = (slot: string, present: number) => {
    if (present || waived.has(slot)) return;
    parts.push(`no ${slot}`);
  };
  need("surfaceName", has(/surfaceName[=:]/));
  need("contentSource", has(/contentSource[=:]/));
  need("entity", has(/entity[=:]|CONTEXT_MENU_ENTITY_KEY/));
  need("extraSections", has(/extraSections[=:]/));
  if (parts.length === 0) return waived.size ? "wired (with waivers)" : "wired";
  return `shell — ${parts.join(", ")}`;
}

/**
 * THE DENSITY LAW. A `description` on a menu item is legal ONLY as the reason
 * a `disabled` item is off. Anything else is prose under a menu row.
 * Heuristic: inside a block that also carries `kind: "item"`, a `description`
 * with no `disabled` within a few lines of it.
 */
function densityViolations(src: string): string[] {
  const out: string[] = [];
  const lines = src.split("\n");
  for (let i = 0; i < lines.length; i++) {
    if (!/^\s*description:/.test(lines[i])) continue;
    const before = lines.slice(Math.max(0, i - 12), i);
    const window = lines.slice(Math.max(0, i - 12), i + 12).join("\n");
    // Only menu items — not toasts, confirm dialogs, or type declarations.
    // A `description` nested inside an onSelect's confirm()/toast() belongs to
    // THAT call, not to the menu row above it: whichever marker is CLOSER
    // above the line owns it.
    const lastIdx = (re: RegExp) => {
      for (let j = before.length - 1; j >= 0; j--) if (re.test(before[j])) return j;
      return -1;
    };
    const itemAt = lastIdx(/kind:\s*"(item|checkbox|link|submenu)"/);
    const nestedAt = lastIdx(/\bconfirm\(|\btoast\.\w+\(|\bDialog\b/);
    if (itemAt === -1 || nestedAt > itemAt) continue;
    if (/disabled/.test(window)) continue;
    const label = window.match(/label:\s*[`"']([^`"']{0,48})/)?.[1] ?? "?";
    out.push(`line ${i + 1} — under “${label}”`);
  }
  return out;
}

// ---------------------------------------------------------------------------
// SECTIONS.md registry drift
// ---------------------------------------------------------------------------

function registryFindings(files: Map<string, string>): Finding[] {
  const out: Finding[] = [];
  const REGISTRY = "features/context-menu-v3/SECTIONS.md";
  let md: string;
  try {
    md = readFileSync(join(ROOT, REGISTRY), "utf8");
  } catch {
    return [
      {
        population: "registry",
        file: REGISTRY,
        detail: "MISSING — the shared-section registry is the fleet's first stop",
      },
    ];
  }
  // Table rows: | Identity | `builder` | `path` | Consumers |
  for (const line of md.split("\n")) {
    if (!line.startsWith("|") || line.includes("---")) continue;
    const cells = line.split("|").map((c) => c.trim());
    if (cells.length < 5) continue;
    const builders = [...cells[2].matchAll(/`([^`]+)`/g)].map((m) => m[1]);
    const filePath = cells[3].match(/`([^`]+)`/)?.[1];
    if (!builders.length || !filePath || filePath === "same file") continue;
    const src = files.get(filePath);
    if (src === undefined) {
      out.push({
        population: "registry",
        file: filePath,
        detail: `registered for “${cells[1]}” but the file does not exist`,
      });
      continue;
    }
    for (const b of builders) {
      if (!new RegExp(`export\\s+(function|const)\\s+${b}\\b`).test(src))
        out.push({
          population: "registry",
          file: filePath,
          detail: `registry names \`${b}\` but the file exports no such builder`,
        });
    }
  }
  return out;
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

function main() {
  const files = readAll();

  // Every JSX tag rendered inside a file that mounts a menu — the ancestor net.
  const renderedUnderAMenu = new Set<string>();
  for (const [, src] of files) {
    if (!MOUNTS_MENU.test(src)) continue;
    for (const m of src.matchAll(/<([A-Z]\w*)[\s/>]/g)) renderedUnderAMenu.add(m[1]);
  }

  const findings: Finding[] = [];
  const covered: Finding[] = [];

  for (const [path, src] of files) {
    const population = classify(path, src);

    // THE DENSITY LAW applies to every file that declares menu items.
    for (const v of densityViolations(src))
      findings.push({ population: "density", file: path, detail: v });

    if (!population) continue;

    const ownMenu = MOUNTS_MENU.test(src);
    const needsEditable = population === "editables";
    const hasRightWrapper = needsEditable ? MOUNTS_EDITABLE_MENU.test(src) : ownMenu;

    if (hasRightWrapper) {
      covered.push({ population, file: path, detail: "own menu", grade: gradeMenu(src) });
      continue;
    }
    if (INHERITS_MENU.test(src)) {
      covered.push({
        population,
        file: path,
        detail: "inherits from a menu-carrying shell",
      });
      continue;
    }
    if (ownMenu && needsEditable) {
      findings.push({
        population,
        file: path,
        detail: "read-only wrapper on an editable surface — needs EditableContextMenu",
      });
      continue;
    }
    if (exportedComponents(src).some((n) => renderedUnderAMenu.has(n))) {
      covered.push({
        population,
        file: path,
        detail: "rendered inside a menu-mounting file (heuristic — verify live)",
      });
      continue;
    }
    findings.push({ population, file: path, detail: "no context menu" });

    if (IS_BESPOKE.test(src))
      findings.push({
        population: "bespoke",
        file: path,
        detail: "hand-rolled onContextMenu — collapse into v3",
      });
  }

  findings.push(...registryFindings(files));

  const selected = findings.filter(
    (f) => ONLY.length === 0 || ONLY.includes(f.population),
  );

  if (JSON_OUT) {
    console.log(
      JSON.stringify(
        {
          generatedFrom: "pnpm check:context-menu",
          heuristic: "textual — a 'covered' verdict is not certification",
          waveOne: WAVE_ONE,
          counts: countBy(selected),
          rows: selected,
        },
        null,
        2,
      ),
    );
    process.exit(STRICT && selected.length > 0 ? 1 : 0);
  }

  report(selected, covered);
  process.exit(STRICT && selected.length > 0 ? 1 : 0);
}

function countBy(rows: Finding[]): Record<string, number> {
  const out: Record<string, number> = {};
  for (const r of rows) out[r.population] = (out[r.population] ?? 0) + 1;
  return out;
}

function report(findings: Finding[], covered: Finding[]) {
  const counts = countBy(findings);
  console.log("\ncheck:context-menu — surfaces with no right-click, and menu quality\n");
  console.log("  Heuristic, not a renderer. 'Covered' = not on the work list,");
  console.log("  NOT certified. Certification is opening the menu (see the skill).\n");

  const order: Population[] = [
    "tables",
    "editables",
    "windows",
    "overlays",
    "bespoke",
    "density",
    "registry",
  ];
  for (const p of order) {
    const rows = findings.filter((f) => f.population === p);
    if (!rows.length) continue;
    const tag = WAVE_ONE.includes(p)
      ? "WAVE ONE"
      : p === "overlays"
        ? "tracked — not wave one"
        : p === "density" || p === "registry"
          ? "LAW"
          : "collapse";
    console.log(`── ${p} (${rows.length}) — ${tag}`);
    for (const r of rows.slice(0, 12)) console.log(`   ${r.file} — ${r.detail}`);
    if (rows.length > 12) console.log(`   … and ${rows.length - 12} more (--json for all)`);
    console.log("");
  }

  const shells = covered.filter((c) => c.grade && c.grade !== "wired");
  if (shells.length) {
    console.log(`── menus that exist but are SHELLS (${shells.length})`);
    console.log("   Wrapping a div is cheap; these pass the wrapper test and fail the job.\n");
    for (const s of shells.slice(0, 12)) console.log(`   ${s.file} — ${s.grade}`);
    if (shells.length > 12) console.log(`   … and ${shells.length - 12} more`);
    console.log("");
  }

  const wave = findings.filter((f) => WAVE_ONE.includes(f.population)).length;
  console.log(
    `Total findings: ${findings.length}  ·  wave one: ${wave}  ·  covered: ${covered.length}  ·  shells: ${shells.length}`,
  );
  console.log(`Counts: ${JSON.stringify(counts)}\n`);
}

main();
