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
 * (cheap, gameable) from "plumbed" (the wrapper is passing the props that let
 * the built-in verbs resolve a record).
 *
 * 🚨 WHAT THE GRADE IS NOT. `wired`/`shell` grades the WRAPPER's props —
 * surfaceName, contentSource, entity. It says nothing about whether the items
 * a surface contributes do anything. That gap was itself the defect (found
 * 2026-09-11): an item declared with `onSelect: () => {}`, or with no handler
 * at all, scored exactly the same as one that acts, so "no dead controls" read
 * as certified when it had only ever been walked by hand. The `dead-item` law
 * below closes it — see `deadItemFindings`.
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
 *   form-fields — a SHORT input collecting a value inside a dialog/form, as
 *               opposed to a content body. TRACKED, NOT WAVE ONE: wrapping an
 *               invite field to satisfy a counter is padding, not coverage.
 *   bespoke   — a hand-rolled onContextMenu / DropdownMenu-as-context-menu to
 *               COLLAPSE into v3. Different risk class from adding one: it is
 *               delete-and-replace and needs live proof the old items survived.
 *
 * TWO WAYS A FILE LEAVES A POPULATION WITHOUT BEING WIRED, both recorded in the
 * file itself so the decision survives the next agent and the next census:
 *   // context-menu: deliberately-absent — <reason>
 *       A considered REFUSAL. The HR complaints list carries one: the menu
 *       grants Copy/Export/AI, and a CSV of complaints must not exist by
 *       accident.
 *   // context-menu: covered-by <path>
 *       The menu is real but more than one hop away (the net walks one hop).
 *
 * AND the law checks that make the 2026-08-25 rulings enforceable:
 *   dead-item — THE LIVE-ITEM LAW (2026-09-11): a menu item that LOOKS
 *               clickable and cannot act. Parsed from the TS AST, not grepped:
 *               an item is conformant only when it carries an action that can
 *               act (a handler whose function body is non-empty, or that
 *               resolves to one; a real `href`; a non-empty submenu), or when
 *               it is honestly `disabled: true`. `onSelect: () => {}`,
 *               `onSelect: () => undefined`, `onSelect: noop`, `href: ""`,
 *               `children: []`, and a missing handler are all violations.
 *               Waivable ONLY with `// context-menu: inert-ok — <reason>` on
 *               or just above the item.
 *   density   — THE DENSITY LAW: a menu item carrying `description` that is
 *               not a disabled-reason. Labels only, macOS-terse.
 *   registry  — features/context-menu-v3/SECTIONS.md drift: a registered
 *               shared builder whose file/export vanished, or whose Consumers
 *               column no longer matches who actually imports it.
 *   naming    — THE NAMING LAW: `use*` calls hooks, `build*` is pure. A
 *               `use<Identity>MenuSection` that calls NO React hook is a plain
 *               builder wearing a hook's name: it lies to the hook linter and
 *               drags every call site into hook position (real
 *               `rules-of-hooks` errors on code that has no hooks). The mirror
 *               defect is a `build<Identity>MenuSection` that DOES call a hook
 *               — a hook whose name tells the linter to stop checking it.
 *               The third defect is a BARE `<identity>MenuSection` with no
 *               prefix at all (20 of them survived the 2026-09-09 rename):
 *               a third convention, off which no reader or linter can tell
 *               whether the call site is hook position. All three are
 *               violations; the guard names the correct rename for each.
 *               Renamed 2026-09-09; this guard is why it cannot come back.
 *   attribution — a `sourceFeature` value that is not in the generated
 *               SOURCE_FEATURES allow-list. That list comes from the Python
 *               server and cannot be extended here, so an invented value
 *               silently misattributes every agent run the menu launches.
 *               Checked directly against the generated file because tsc only
 *               speaks once the whole tree compiles — and during a fleet run
 *               the tree is often red from another session, which is exactly
 *               when an agent decides an error is "not mine".
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
import ts from "typescript";

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
  | "form-fields"
  | "windows"
  | "overlays"
  | "bespoke"
  | "density"
  | "dead-item"
  | "attribution"
  | "registry"
  | "naming";

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
  {
    match: /^features\/overlays\/boundary\//,
    reason:
      "error/loading FALLBACKS and the lazyOverlay helper — a fallback shows a failure, it renders no record, and lazyOverlay is not a component at all",
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

/**
 * 🚨 NOT EVERY TEXTAREA IS A CONTENT SURFACE.
 *
 * A first pass lumped 395 files together and the sample was a mixed bag: a real
 * SQL editor beside a one-line invite field in a sheet, a shared form-control
 * PRIMITIVE, and a clipboard-fallback dialog whose entire job is displaying
 * text to copy. Sending a fleet at that list produces menus on invite fields to
 * satisfy a counter — padding, not coverage, and on a shared primitive it would
 * put a menu inside every consumer and nest them.
 *
 * So the population splits. A CONTENT SURFACE holds a body worth acting on: an
 * editor, a document, a composer, a pad, a note. It genuinely wants
 * `EditableContextMenu`, and gets the WidgetHandle with it. A FORM FIELD is a
 * short input collecting a value inside a dialog — it is tracked, reported, and
 * NOT wave-one work.
 *
 * The split is a heuristic and says so; a worker who opens a "form-field" file
 * and finds a real editor should wire it and say the classifier was wrong.
 */
const CONTENT_SURFACE_NAME =
  /(editor|composer|pad|document|note|markdown|code|transcript|workspace|canvas|writer|draft|body|content)/i;
const FORM_SHELL_NAME = /(dialog|sheet|modal|form|picker|prompt|invite|control|input|field)/i;

/** Roughly how many editable regions the file mounts. */
function editableCount(src: string): number {
  return [...src.matchAll(/<textarea[\s>]|<Textarea[\s>]|<ProTextarea[\s>]|contentEditable/g)]
    .length;
}

/**
 * A content surface, or a form field? Name first (it is what the author called
 * it), then weight of evidence: several editable regions, or an explicit
 * ProTextarea (the Tier-2 rich field), reads as a real surface.
 */
function isContentSurface(path: string, src: string): boolean {
  const base = basename(path);
  if (CONTENT_SURFACE_NAME.test(base)) return true;
  if (FORM_SHELL_NAME.test(base) && editableCount(src) <= 1) return false;
  if (/<ProTextarea[\s>]/.test(src)) return true;
  return editableCount(src) > 1;
}
const IS_BESPOKE = /onContextMenu\s*=/;

function classify(path: string, src: string): Population | null {
  if (path.startsWith("features/overlays/") && /export\s+(default\s+)?function/.test(src))
    return "overlays";
  if (/^features\/window-panels\/windows\/.*Window\.tsx$/.test(path)) return "windows";
  if (IS_TABLE.test(src)) return "tables";
  if (IS_EDITABLE.test(src))
    return isContentSurface(path, src) ? "editables" : "form-fields";
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

/**
 * 🚨 DELIBERATE ABSENCE — a surface that must NEVER get a menu.
 *
 * Some surfaces are built to withhold exactly what this menu grants. The
 * employee-relations case list (`features/hr/people/relations/`) states it in
 * its own header: a CSV of complaints "is exactly the artifact that should not
 * exist by accident", so Copy/Export/AI are switched off on purpose. A fleet
 * worker read that, understood it, and correctly refused to wire the file.
 *
 * Without a marker, that judgement survives exactly until the next agent is
 * handed the file by a census that still lists it — and that agent may not
 * read the header. So a deliberate refusal must be RECORDED where the census
 * looks, not just honoured once. A file declaring:
 *
 *   // context-menu: deliberately-absent — a CSV of complaints must not exist by accident
 *
 * leaves every population, and the reason is printed so the decision stays
 * visible and reviewable rather than becoming invisible.
 */
/**
 * VERIFIED DELEGATION — the menu is real, it just lives more than one hop away.
 *
 * The delegation net walks ONE hop: this file renders <X>, and X mounts a menu.
 * Real trees are deeper. `ListManagerWindow` renders
 * `ListManagerFloatingWorkspace`, which renders `ListDetailClient`, which
 * mounts four menus; `MarkdownEditorWindow` reaches `MarkdownInput` the same
 * way. Both were reported menu-less and both are genuinely covered.
 *
 * Widening the net to a transitive closure would credit any page that renders
 * anything that eventually contains a menu — over-crediting hides real gaps,
 * which is worse than a false alarm. So the claim is recorded per-file instead,
 * and it names the carrier so the next reader can check it in one grep:
 *
 *   // context-menu: covered-by features/user-lists/components/ListDetailClient.tsx
 */
const COVERED_BY_RE = /context-menu:\s*covered-by\s+(\S+)/;

function coveredBy(src: string): string | null {
  return src.match(COVERED_BY_RE)?.[1] ?? null;
}

const DELIBERATELY_ABSENT_RE =
  /context-menu:\s*deliberately-absent\s*[—-]\s*(.+)/;

function deliberateAbsence(src: string): string | null {
  return src.match(DELIBERATELY_ABSENT_RE)?.[1]?.trim() ?? null;
}

function exemptSlots(src: string): Set<string> {
  const out = new Set<string>();
  for (const m of src.matchAll(EXEMPT_RE)) out.add(m[1]);
  return out;
}

/**
 * 🚨 A SHARED BUILDER SUPPLIES SLOTS ON THE CONSUMER'S BEHALF.
 *
 * A file that ADOPTS a registered section builder (the behaviour this whole
 * rollout exists to produce) gets its `entity` from that builder, not from its
 * own text. Grading only the consuming file therefore marked every correct
 * adopter a SHELL — penalising the right answer and rewarding inlining, which
 * is precisely backwards. If the fleet optimised for the grade it would stop
 * adopting builders. So: follow the import, and credit what the builder gives.
 */
function slotsFromImportedBuilders(
  src: string,
  files: Map<string, string>,
): Set<string> {
  const provided = new Set<string>();
  // Local imports whose module name looks like a menu/action builder.
  for (const m of src.matchAll(
    /import\s+\{([^}]*)\}\s+from\s+["']([^"']+)["']/g,
  )) {
    const spec = m[2];
    const named = m[1];
    if (!/(menu|action)/i.test(spec) && !/(MenuSection|RowMenu|EntityRef)/.test(named))
      continue;
    const rel = spec.replace(/^@\//, "");
    for (const [path, body] of files) {
      const noExt = path.replace(/\.tsx?$/, "");
      if (noExt !== rel && !noExt.endsWith(`/${rel.split("/").pop()}`)) continue;
      if (!/(menu|action)/i.test(path)) continue;
      if (/entity[=:]|CONTEXT_MENU_ENTITY_KEY|EntityRef/.test(body))
        provided.add("entity");
      if (/surfaceName[=:]/.test(body)) provided.add("surfaceName");
      if (/contentSource[=:]/.test(body)) provided.add("contentSource");
      provided.add("extraSections");
    }
  }
  return provided;
}

function gradeMenu(src: string, files?: Map<string, string>): string {
  const has = (re: RegExp) => (re.test(src) ? 1 : 0);
  const fromBuilder = files
    ? slotsFromImportedBuilders(src, files)
    : new Set<string>();
  const waived = exemptSlots(src);
  const parts: string[] = [];
  const need = (slot: string, present: number) => {
    if (present || waived.has(slot) || fromBuilder.has(slot)) return;
    parts.push(`no ${slot}`);
  };
  // THE PLUMBING — without these the menu opens and every verb is dark.
  need("surfaceName", has(/surfaceName[=:]/));
  need("contentSource", has(/contentSource[=:]/));
  need("entity", has(/entity[=:]|CONTEXT_MENU_ENTITY_KEY/));

  // `extraSections` is DOMAIN GARNISH, not plumbing. A surface with no
  // genuine page-local action beyond what its own toolbar already exposes is
  // CORRECT to omit it — and grading that as a shell pushes agents to invent a
  // menu item purely to satisfy the counter, which is padding, not coverage.
  // So it is reported, never counted as a shell.
  const noExtras =
    !has(/extraSections[=:]/) &&
    !waived.has("extraSections") &&
    !fromBuilder.has("extraSections");

  if (parts.length > 0) return `shell — ${parts.join(", ")}`;
  const notes: string[] = [];
  if (noExtras) notes.push("no extraSections");
  if (waived.size) notes.push("waivers");
  return notes.length ? `wired (${notes.join(", ")})` : "wired";
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

/**
 * 🚨 AN INVENTED `sourceFeature` MISATTRIBUTES EVERY AGENT RUN IT LAUNCHES.
 *
 * `SOURCE_FEATURES` is AUTO-GENERATED from the Python server's provenance
 * allow-list — it cannot be extended from this repo, so a value that is not in
 * it is always wrong, never a missing entry to add. Two fleet workers invented
 * one anyway ("admin-relationships", "hr") because the prop reads like free
 * text. It is not: it is how a run launched from this menu is attributed to
 * its true caller, so a wrong value silently files runs under the wrong
 * feature and a suppressed one does the same thing quietly.
 *
 * tsc catches this too, but only once the whole tree compiles — and during a
 * fleet run the tree is often red from someone else's in-flight work, which is
 * exactly when an agent decides the error is "not mine" and moves on.
 */
function attributionFindings(files: Map<string, string>): Finding[] {
  const out: Finding[] = [];
  const gen = files.get("types/python-generated/source-attribution.ts") ??
    (() => {
      try {
        return readFileSync(join(ROOT, "types/python-generated/source-attribution.ts"), "utf8");
      } catch {
        return "";
      }
    })();
  if (!gen) return out;
  const block = gen.slice(gen.indexOf("SOURCE_FEATURES"));
  const allowed = new Set([...block.matchAll(/"([^"]+)"/g)].map((m) => m[1]));
  if (allowed.size === 0) return out;

  for (const [path, src] of files) {
    for (const m of src.matchAll(/sourceFeature=\{?"([^"]+)"/g)) {
      if (!allowed.has(m[1]))
        out.push({
          population: "attribution",
          file: path,
          detail: `sourceFeature="${m[1]}" is not in the generated SOURCE_FEATURES allow-list — pick an existing value, never invent one`,
        });
    }
  }
  return out;
}

/**
 * THE NAMING LAW (2026-09-09) — `use*` calls hooks, `build*` is pure.
 *
 * Functions named `use*` are React hooks BY CONTRACT: the hook linter and
 * every reader assume it. Three shared section builders (`useFlashcard…`,
 * `useDatasetTable…`, `useCaptureItem…`) called no hook at all, which produced
 * FALSE `react-hooks/rules-of-hooks` errors at call sites and forced hosts to
 * hoist pure code above early returns for no reason. Renamed to `build*`; this
 * guard makes the class unrepeatable in BOTH directions.
 *
 * Textual, like the rest of this script: brace-balanced body extraction with
 * comments and string literals stripped before the scan, so a hook name inside
 * a doc comment or a label never counts.
 */
function namingFindings(): Finding[] {
  const out: Finding[] = [];
  const SECTION_SCAN = [
    "features/**/*.ts",
    "features/**/*.tsx",
    "app/**/*.ts",
    "app/**/*.tsx",
    "components/**/*.tsx",
    "lib/**/*.ts",
  ];
  /**
   * A section-builder DECLARATION — exported or not, prefixed or not. Shapes:
   *   `function xMenuSection(`         — the common one
   *   `const xMenuSection = (a) => …`  — arrow builder, params on one line
   *   `const xMenuSection = (`         — arrow builder, params wrapped
   * A `const` whose right-hand side is a CALL (`const s = useKeywordMenuSection({…})`)
   * or an object literal (`const s: ContextMenuExtraSection = {…}`) holds a
   * VALUE, not a builder, and is deliberately NOT matched — renaming those is
   * the host's business, and hundreds of them exist.
   */
  const FN_DEF =
    /^\s*(?:export\s+)?(?:async\s+)?function\s+([A-Za-z_$][A-Za-z0-9_$]*MenuSection)\b/;
  const CONST_DEF =
    /^\s*(?:export\s+)?const\s+([A-Za-z_$][A-Za-z0-9_$]*MenuSection)\s*(?::[^=]*)?=\s*(?:async\s*)?(?:function\b|(?:<[^>]*>\s*)?\((?=[^()]*\)\s*(?::[^=]*)?=>)|\(\s*$)/;
  /** A hook call: `useX(` or `useX<`, not preceded by a dot or word char. */
  const HOOK_CALL = /(?<![A-Za-z0-9_$.])(use[A-Z][A-Za-z0-9_]*)\s*[(<]/g;

  const seen = new Set<string>();
  for (const pattern of SECTION_SCAN) {
    for (const rel of globSync(pattern, { cwd: ROOT })) {
      const path = rel.replace(/\\/g, "/");
      if (seen.has(path)) continue;
      seen.add(path);
      if (/\.(test|spec)\.tsx?$/.test(path)) continue;
      let src: string;
      try {
        src = readFileSync(join(ROOT, path), "utf8");
      } catch {
        continue;
      }
      if (!src.includes("MenuSection")) continue;
      const lines = src.split("\n");
      for (let i = 0; i < lines.length; i++) {
        const m = FN_DEF.exec(lines[i]) ?? CONST_DEF.exec(lines[i]);
        if (!m) continue;
        const name = m[1];
        const prefix = /^use[A-Z]/.test(name)
          ? "use"
          : /^build[A-Z]/.test(name)
            ? "build"
            : "none";
        const body = stripNoise(extractBody(lines, i));
        const unique = [
          ...new Set(
            [...body.matchAll(HOOK_CALL)]
              .map((h) => h[1])
              .filter((h) => h !== name),
          ),
        ];
        if (prefix === "none") {
          const stem = name[0].toUpperCase() + name.slice(1);
          const suggested = (unique.length > 0 ? "use" : "build") + stem;
          out.push({
            population: "naming",
            file: `${path}:${i + 1}`,
            detail: `\`${name}\` carries NO \`use\`/\`build\` prefix — a third convention, so nobody can tell from the name whether calling it is hook position. Rename to \`${suggested}\` (${unique.length > 0 ? `it calls ${unique.join(", ")}` : "it calls no React hook"}) (THE NAMING LAW — SECTIONS.md).`,
          });
          continue;
        }
        if (prefix === "use" && unique.length === 0)
          out.push({
            population: "naming",
            file: `${path}:${i + 1}`,
            detail: `\`${name}\` calls NO React hook — a pure builder wearing \`use\`. Rename to \`${name.replace(/^use/, "build")}\` (THE NAMING LAW — SECTIONS.md).`,
          });
        if (prefix === "build" && unique.length > 0)
          out.push({
            population: "naming",
            file: `${path}:${i + 1}`,
            detail: `\`${name}\` calls ${unique.join(", ")} — a hook wearing \`build\`. Rename to \`${name.replace(/^build/, "use")}\` so the hook linter checks it (THE NAMING LAW — SECTIONS.md).`,
          });
      }
    }
  }
  return out;
}

/** Lines `start`..end of the brace-balanced block opened on/after `start`. */
function extractBody(lines: string[], start: number): string {
  let depth = 0;
  let opened = false;
  for (let j = start; j < lines.length; j++) {
    for (const ch of stripNoise(lines[j])) {
      if (ch === "{") {
        depth++;
        opened = true;
      } else if (ch === "}") depth--;
    }
    if (opened && depth <= 0) return lines.slice(start, j + 1).join("\n");
  }
  return lines.slice(start).join("\n");
}

/**
 * Remove comments and string/template literals — braces and hook-shaped words
 * inside prose must not count.
 */
function stripNoise(src: string): string {
  return src
    .replace(/\/\*[\s\S]*?\*\//g, " ")
    .replace(/\/\/[^\n]*/g, " ")
    .replace(/`(?:\\.|[^`\\])*`/g, '""')
    .replace(/"(?:\\.|[^"\\])*"/g, '""')
    .replace(/'(?:\\.|[^'\\])*'/g, '""');
}

// ---------------------------------------------------------------------------
// THE LIVE-ITEM LAW — a menu item that looks clickable must be able to act
// ---------------------------------------------------------------------------

/**
 * 🚨 THE DEFECT THIS EXISTS FOR (2026-09-11).
 *
 * Everything above this line grades PLUMBING: does the wrapper receive
 * `surfaceName`, `contentSource`, `entity`. None of it ever opened an item and
 * asked the only question a user asks — *does clicking this do anything?* So a
 * surface could contribute
 *
 *     { kind: "item", id: "export", label: "Export as PDF", onSelect: () => {} }
 *
 * and the census would call the file `wired`. "No dead controls" then read as
 * CERTIFIED when the only thing that had ever checked it was a human walking
 * the UI once. A guard you cannot demonstrate failing is not a guard; this one
 * fails on a planted dead item (`--self-test`, and the RED proof recorded in
 * the resolution register).
 *
 * WHAT CONFORMANT MEANS, per item kind:
 *   item      — `onSelect` that resolves to a function with a non-empty body
 *   checkbox  — `onCheckedChange`, same test
 *   link      — an `href` that is not `""` or `"#"`
 *   submenu   — `children` that is not an empty array
 *   separator — nothing (it is not a control)
 *
 * THE HONEST EXIT. `disabled: true` (the literal) is always conformant: the row
 * renders greyed and unclickable, so the screen is not lying — that is the
 * "absent or honest" half of law 4, and the codebase already uses it for
 * informational rows (`FileTreeNode`'s fixed-height summary) and for real
 * refusals (`crm-member-no-party`, which pairs it with a `description` reason).
 * A CONDITIONAL `disabled` (`disabled: !target?.href`) is NOT an exit: the item
 * is live in the other branch and must be able to act there.
 *
 * THE ALLOW-LIST. One marker, reason mandatory, written next to the code:
 *
 *   // context-menu: inert-ok — the row is a heading; the parent handles selection
 *
 * on the item's own lines or the three above it. The regex requires text after
 * the dash, for the reason this file already gives about its SKIP list: an
 * allowlist without a reason is how a law rots into a formality.
 *
 * Spread-built items (`{ ...base, kind: "item" }`) are SKIPPED, not flagged —
 * the handler may come from `base`, and a false alarm in a LAW section is how a
 * guard trains people to ignore it.
 */

const ITEM_KINDS = new Set(["item", "checkbox", "link", "submenu"]);
/** Identifiers whose NAME is a promise of doing nothing. */
const NOOP_NAME = /^(noop|noOp|NOOP|no_op|noopFn|doNothing)$/;
const INERT_OK_RE = /context-menu:\s*inert-ok\s*[—-]\s*(\S.*)/;

interface DeadItem {
  line: number;
  label: string;
  reason: string;
}

/** `{ ... }` property lookup that ignores computed/spread noise. */
function prop(
  obj: ts.ObjectLiteralExpression,
  name: string,
): ts.Expression | undefined {
  for (const p of obj.properties) {
    if (ts.isPropertyAssignment(p) && !ts.isComputedPropertyName(p.name)) {
      if (p.name.getText(p.getSourceFile()).replace(/["']/g, "") === name)
        return p.initializer;
    } else if (ts.isShorthandPropertyAssignment(p) && p.name.text === name) {
      return p.name;
    }
  }
  return undefined;
}

function hasSpread(obj: ts.ObjectLiteralExpression): boolean {
  return obj.properties.some((p) => ts.isSpreadAssignment(p));
}

function stringOf(node: ts.Expression | undefined): string | null {
  if (!node) return null;
  if (ts.isStringLiteral(node) || ts.isNoSubstitutionTemplateLiteral(node))
    return node.text;
  return null;
}

/**
 * Is this expression a function that actually runs something? Returns the
 * reason it is dead, or null when it is live.
 */
function deadHandlerReason(
  expr: ts.Expression,
  locals: Map<string, ts.Expression>,
  seen = new Set<string>(),
): string | null {
  // `onSelect: () => {}` / `function () {}` — an empty body is the whole defect.
  if (ts.isArrowFunction(expr) || ts.isFunctionExpression(expr)) {
    const body = expr.body;
    if (ts.isBlock(body)) {
      if (body.statements.length === 0) return "its handler body is empty";
      return null;
    }
    // Concise body: `() => undefined`, `() => void 0`, `() => null`.
    if (ts.isIdentifier(body) && body.text === "undefined")
      return "its handler returns `undefined` and does nothing else";
    if (ts.isVoidExpression(body) || body.kind === ts.SyntaxKind.NullKeyword)
      return "its handler evaluates to nothing";
    return null;
  }
  // `onSelect: noop`
  if (ts.isIdentifier(expr)) {
    if (NOOP_NAME.test(expr.text)) return `its handler is \`${expr.text}\``;
    // A local `const handleX = () => {}` referenced by name is the same defect
    // wearing an indirection — follow it once.
    const local = locals.get(expr.text);
    if (local && !seen.has(expr.text)) {
      seen.add(expr.text);
      const why = deadHandlerReason(local, locals, seen);
      if (why) return `\`${expr.text}\` is dead — ${why}`;
    }
    return null;
  }
  // Anything else (a call, a conditional, a member access) can act.
  return null;
}

/** Top-level-ish `const x = <fn>` bindings, for one hop of handler resolution. */
function localFunctions(sf: ts.SourceFile): Map<string, ts.Expression> {
  const out = new Map<string, ts.Expression>();
  const walk = (node: ts.Node): void => {
    if (
      ts.isVariableDeclaration(node) &&
      ts.isIdentifier(node.name) &&
      node.initializer &&
      (ts.isArrowFunction(node.initializer) ||
        ts.isFunctionExpression(node.initializer))
    ) {
      // Shadowing would make this wrong, so only the FIRST binding of a name
      // counts and a second one removes the entry entirely.
      if (out.has(node.name.text)) out.delete(node.name.text);
      else out.set(node.name.text, node.initializer);
    }
    ts.forEachChild(node, walk);
  };
  walk(sf);
  return out;
}

/**
 * Object literals that ARE menu items. Two independent nets, unioned:
 *   1. an explicit `kind: "item" | "checkbox" | "link" | "submenu"`;
 *   2. an element of an array that is unmistakably an item list — `items:`,
 *      `children:`, a declaration typed `…Item[]`/`…MenuEntry[]`, a function
 *      returning one, or a `push()` onto a `…Items` variable. This second net
 *      is what catches the registries whose row type carries no `kind` at all
 *      (`PageContentHeader`'s `ItemMenuEntry`).
 */
function collectItemLiterals(sf: ts.SourceFile): ts.ObjectLiteralExpression[] {
  const found = new Map<number, ts.ObjectLiteralExpression>();
  const ITEM_ARRAY_TYPE = /(?:ContextMenuExtraItem|MenuItem|MenuEntry|ItemMenuEntry)$/;

  const takeArray = (expr: ts.Expression | undefined): void => {
    if (!expr || !ts.isArrayLiteralExpression(expr)) return;
    for (const el of expr.elements)
      if (ts.isObjectLiteralExpression(el)) found.set(el.pos, el);
  };
  const isItemArrayType = (t: ts.TypeNode | undefined): boolean => {
    if (!t || !ts.isArrayTypeNode(t)) return false;
    const name = t.elementType.getText(sf).replace(/<.*/, "").trim();
    return ITEM_ARRAY_TYPE.test(name);
  };

  const walk = (node: ts.Node): void => {
    if (ts.isObjectLiteralExpression(node)) {
      const kind = stringOf(prop(node, "kind"));
      if (kind && ITEM_KINDS.has(kind)) found.set(node.pos, node);
    }
    if (
      ts.isPropertyAssignment(node) &&
      !ts.isComputedPropertyName(node.name) &&
      /^(items|children)$/.test(node.name.getText(sf).replace(/["']/g, ""))
    )
      takeArray(node.initializer);

    if (ts.isVariableDeclaration(node) && isItemArrayType(node.type))
      takeArray(node.initializer);

    if (
      (ts.isFunctionDeclaration(node) ||
        ts.isArrowFunction(node) ||
        ts.isFunctionExpression(node) ||
        ts.isMethodDeclaration(node)) &&
      isItemArrayType(node.type)
    ) {
      const inner = (n: ts.Node): void => {
        if (ts.isReturnStatement(n)) takeArray(n.expression);
        // Do not descend into a nested function — its returns are not ours.
        if (
          ts.isFunctionDeclaration(n) ||
          ts.isFunctionExpression(n) ||
          ts.isArrowFunction(n)
        )
          return;
        ts.forEachChild(n, inner);
      };
      if (node.body) {
        if (ts.isBlock(node.body)) ts.forEachChild(node.body, inner);
        else takeArray(node.body);
      }
    }

    if (
      ts.isCallExpression(node) &&
      ts.isPropertyAccessExpression(node.expression) &&
      node.expression.name.text === "push" &&
      ts.isIdentifier(node.expression.expression) &&
      /items$/i.test(node.expression.expression.text)
    ) {
      for (const arg of node.arguments)
        if (ts.isObjectLiteralExpression(arg)) found.set(arg.pos, arg);
    }

    ts.forEachChild(node, walk);
  };
  walk(sf);
  return [...found.values()];
}

/** Grade one item literal. Returns the reason it is dead, or null. */
function gradeItem(
  obj: ts.ObjectLiteralExpression,
  locals: Map<string, ts.Expression>,
): string | null {
  // `{ ...base, kind: "item" }` — the action may come from `base`.
  if (hasSpread(obj)) return null;

  const declared = stringOf(prop(obj, "kind"));
  if (declared === "separator") return null;

  const onSelect = prop(obj, "onSelect");
  const onCheckedChange = prop(obj, "onCheckedChange");
  const href = prop(obj, "href");
  const children = prop(obj, "children");
  const label = prop(obj, "label");
  const id = prop(obj, "id");

  // The second net can hand us any object in an `items:` array. Require it to
  // look like a control before judging it.
  if (!declared && !label) return null;
  if (!declared && !id && !onSelect && !onCheckedChange && !href) return null;

  // THE HONEST EXIT — `disabled: true` renders greyed; the screen is not lying.
  const disabled = prop(obj, "disabled");
  if (disabled && disabled.kind === ts.SyntaxKind.TrueKeyword) return null;

  const kind =
    declared ??
    (children ? "submenu" : href ? "link" : onCheckedChange ? "checkbox" : "item");

  if (kind === "submenu") {
    if (!children) return "a submenu with no `children`";
    if (ts.isArrayLiteralExpression(children) && children.elements.length === 0)
      return "a submenu whose `children` array is empty — it opens onto nothing";
    return null;
  }
  if (kind === "link") {
    if (!href) return "a link with no `href`";
    const value = stringOf(href);
    if (value !== null && (value.trim() === "" || value.trim() === "#"))
      return `its \`href\` is \`"${value}"\` — it navigates nowhere`;
    return null;
  }
  const handlerName = kind === "checkbox" ? "onCheckedChange" : "onSelect";
  const handler = kind === "checkbox" ? onCheckedChange : onSelect;
  if (!handler)
    return `it has no \`${handlerName}\`, no \`href\` and is not \`disabled\` — clicking it does nothing`;
  return deadHandlerReason(handler, locals);
}

function deadItemFindings(): Finding[] {
  const out: Finding[] = [];
  const SCAN_ITEMS = [
    "features/**/*.ts",
    "features/**/*.tsx",
    "app/**/*.ts",
    "app/**/*.tsx",
    "components/**/*.ts",
    "components/**/*.tsx",
    "lib/**/*.ts",
    "lib/**/*.tsx",
  ];
  const seen = new Set<string>();
  for (const pattern of SCAN_ITEMS) {
    for (const rel of globSync(pattern, { cwd: ROOT })) {
      const path = rel.replace(/\\/g, "/");
      if (seen.has(path)) continue;
      seen.add(path);
      if (/\.(test|spec)\.tsx?$|__tests__|\.stories\.tsx?$/.test(path)) continue;
      let src: string;
      try {
        src = readFileSync(join(ROOT, path), "utf8");
      } catch {
        continue;
      }
      // Cheap prefilter — parsing every file to find the ~150 that declare menu
      // items is wasted work.
      if (!/kind:\s*["'](item|checkbox|link|submenu)["']/.test(src)) continue;
      for (const d of deadItemsInSource(path, src))
        out.push({
          population: "dead-item",
          file: `${path}:${d.line}`,
          detail: `“${d.label}” — ${d.reason} (THE LIVE-ITEM LAW). Give it a handler that acts, an honest \`disabled: true\`, or delete it; waive with \`// context-menu: inert-ok — <reason>\`.`,
        });
    }
  }
  return out;
}

/** Exported shape of the law, so `--self-test` can drive it on planted text. */
function deadItemsInSource(path: string, src: string): DeadItem[] {
  const sf = ts.createSourceFile(
    path,
    src,
    ts.ScriptTarget.Latest,
    /* setParentNodes */ true,
    path.endsWith(".tsx") ? ts.ScriptKind.TSX : ts.ScriptKind.TS,
  );
  const locals = localFunctions(sf);
  const lines = src.split("\n");
  const out: DeadItem[] = [];
  for (const obj of collectItemLiterals(sf)) {
    const reason = gradeItem(obj, locals);
    if (!reason) continue;
    const start = sf.getLineAndCharacterOfPosition(obj.getStart(sf)).line;
    const end = sf.getLineAndCharacterOfPosition(obj.getEnd()).line;
    // The waiver may sit on the item or on the three lines above it.
    const scope = lines.slice(Math.max(0, start - 3), end + 1).join("\n");
    if (INERT_OK_RE.test(scope)) continue;
    const label =
      stringOf(prop(obj, "label")) ??
      prop(obj, "label")?.getText(sf).slice(0, 48) ??
      stringOf(prop(obj, "id")) ??
      "?";
    out.push({ line: start + 1, label, reason });
  }
  return out;
}

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
    // The scan map holds .tsx only, but a builder legitimately lives in a .ts
    // (`buildTasksContextData.ts`). Falling back to disk stops the guard from
    // reporting a healthy row as a missing file — a false alarm in a LAW
    // section is how a guard gets ignored.
    let src = files.get(filePath);
    if (src === undefined) {
      try {
        src = readFileSync(join(ROOT, filePath), "utf8");
      } catch {
        /* genuinely absent — fall through to the finding below */
      }
    }
    if (src === undefined) {
      out.push({
        population: "registry",
        file: filePath,
        detail: `registered for “${cells[1]}” but the file does not exist`,
      });
      continue;
    }
    // 🚨 A Builder cell legitimately carries PROSE alongside the name — "…
    // rendered via `rowWrapper` + `ItemContextMenu`". Treating every backticked
    // token as a builder name turned one well-documented row into four false
    // findings, which is how a guard trains people to ignore it. The row is
    // honest as long as AT LEAST ONE named symbol is really exported.
    const exported = builders.filter((b) =>
      new RegExp(`export\\s+(function|const|type)\\s+${b}\\b`).test(src),
    );
    if (exported.length === 0)
      out.push({
        population: "registry",
        file: filePath,
        detail: `registry names ${builders
          .map((b) => `\`${b}\``)
          .join(", ")} but the file exports none of them`,
      });
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

  /**
   * 🚨 A DOMAIN WRAPPER IS STILL A MENU.
   *
   * Features legitimately wrap v3 once and re-export it under their own name —
   * `FileRightClickMenu` is the files feature's per-file wrapper, and a window
   * that adopts it is CORRECTLY wired. Recognising only the two literal v3
   * component names reported those files as having no menu at all, which sends
   * the next agent to add a SECOND, nested one — and the inner trigger wins, so
   * the outer never opens. The detector's false negative would have manufactured
   * the exact defect it exists to prevent.
   *
   * So: any component exported by a file that itself mounts v3 and is named
   * like a menu counts as carrying one.
   */
  const menuCarriers = new Set<string>();
  for (const [, src] of files) {
    if (!MOUNTS_MENU.test(src)) continue;
    // NOT restricted to menu-NAMED components. A window that renders only
    // `<TextSectionsWindow>` — which mounts its own v3 menu — is covered by
    // delegation, and reporting it as menu-less sends the next agent to nest a
    // second one. The detail line names the carrier so the credit stays
    // inspectable rather than becoming a blanket pass.
    for (const name of exportedComponents(src)) menuCarriers.add(name);
  }

  const findings: Finding[] = [];
  const covered: Finding[] = [];

  for (const [path, src] of files) {
    const population = classify(path, src);

    // THE DENSITY LAW applies to every file that declares menu items.
    for (const v of densityViolations(src))
      findings.push({ population: "density", file: path, detail: v });

    if (!population) continue;

    const delegate = coveredBy(src);
    if (delegate) {
      covered.push({
        population,
        file: path,
        detail: `covered by ${delegate} (verified delegation)`,
      });
      continue;
    }

    const refusal = deliberateAbsence(src);
    if (refusal) {
      covered.push({
        population,
        file: path,
        detail: `deliberately absent — ${refusal}`,
      });
      continue;
    }

    const ownMenu = MOUNTS_MENU.test(src);
    const needsEditable = population === "editables";
    const hasRightWrapper = needsEditable ? MOUNTS_EDITABLE_MENU.test(src) : ownMenu;

    if (hasRightWrapper) {
      covered.push({ population, file: path, detail: "own menu", grade: gradeMenu(src, files) });
      continue;
    }
    const carrier = [...menuCarriers].find((n) =>
      new RegExp(`<${n}[\\s/>]`).test(src),
    );
    if (carrier) {
      covered.push({
        population,
        file: path,
        detail: `delegates to <${carrier}>, which mounts v3`,
      });
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

  findings.push(...attributionFindings(files));
  findings.push(...registryFindings(files));
  findings.push(...namingFindings());
  findings.push(...deadItemFindings());

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
    "form-fields",
    "overlays",
    "bespoke",
    "dead-item",
    "density",
    "attribution",
    "registry",
    "naming",
  ];
  for (const p of order) {
    const rows = findings.filter((f) => f.population === p);
    if (!rows.length) continue;
    const tag = WAVE_ONE.includes(p)
      ? "WAVE ONE"
      : p === "overlays" || p === "form-fields"
        ? "tracked — not wave one"
        : p === "density" ||
            p === "dead-item" ||
            p === "registry" ||
            p === "attribution" ||
            p === "naming"
          ? "LAW"
          : "collapse";
    console.log(`── ${p} (${rows.length}) — ${tag}`);
    for (const r of rows.slice(0, 12)) console.log(`   ${r.file} — ${r.detail}`);
    if (rows.length > 12) console.log(`   … and ${rows.length - 12} more (--json for all)`);
    console.log("");
  }

  const shells = covered.filter((c) => c.grade?.startsWith("shell"));
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
