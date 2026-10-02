// features/context-menu-v3/designs/round2.ts
//
// Round 2 of the right-click demo (Arman's A–E structure, 2026-10-02):
//   A) icon strip(s) — the menu's own verbs, bound to the table's handlers (verbs.ts)
//   B) "Type to filter…"
//   C) 4 table rows one icon cannot tell
//   D) "More table options" — the rest of the table's rows
//   E) Intelligence — every AI row
//   then the platform utilities as a footer icon row.
// Built FROM the verb contract, never hand-listed. V1–V3 differ only where the
// spec leaves room. Pure: nothing renders here. Demo-only.

import { I, TODAY_ALL_GENERIC_IDS, TODAY_ROW_IDS, obj, type DNode } from "./catalog";
import { INTELLIGENCE, assertFeature, resolveVerbs, utilities, verbStrip, type FeatureMenu, type StripIcon } from "./verbs";

export type Round2Key = "v1" | "v2" | "v3";

export const ROUND2_TABS: { key: Round2Key; label: string }[] = [
  { key: "v1", label: "V1" },
  { key: "v2", label: "V2" },
  { key: "v3", label: "V3" },
];

/** A row, optionally with one secondary line (V2's Intelligence row). */
export interface R2Node extends DNode {
  description?: string;
}

export interface R2Section {
  /** "Intelligence" (Arman's name for the AI group) or none. */
  heading?: string;
  nodes: R2Node[];
}

export interface R2Menu {
  key: Round2Key;
  /** A tiny kind word over the strip ("Table"), or null — Arman prefers nothing. */
  kindLabel: string | null;
  /** One or more icon strips at the top; a gap before an icon marks a group. */
  strips: StripIcon[][];
  sections: R2Section[];
  footer: StripIcon[];
}

export interface Round2Options {
  name: string;
  selection: string | null;
  viewer: boolean;
  kindLabel: boolean;
}

// ── The table, as a feature declares itself ───────────────────────────────────

const noop = () => undefined;

function tableFeature(viewer: boolean): FeatureMenu {
  const t = obj(viewer);
  const greyed = (reason: string) => (viewer ? { unavailable: reason } : {});
  const rowGrey = (reason: string) => (viewer ? { viewerReason: reason } : {});
  return assertFeature({
    noun: "table",
    bind: {
      "open-new-tab": { run: noop },
      copy: { run: noop, label: "Copy rows" },
      "copy-link": { run: noop },
      share: { run: noop },
      duplicate: { run: noop },
      favorite: { run: noop },
      move: { run: noop },
      rename: { run: noop, ...greyed("Only editors can rename") },
      export: {
        run: noop,
        label: "Export table",
        menu: [
          { id: "table-export-csv", label: "CSV" },
          { id: "table-export-xlsx", label: "Excel" },
        ],
      },
      import: { run: noop, ...greyed("Only editors can import") },
      history: { run: noop },
      settings: { run: noop, ...greyed("Only editors can change settings") },
      archive: { run: noop, label: "Archive table", ...greyed("Only editors can archive") },
    },
    rows: [
      t.open,
      { id: "new-record", label: "New record", icon: I.SquarePlus, ...rowGrey("Only editors can add records") },
      { id: "edit-fields", label: "Edit fields…", icon: I.ClipboardList, ...rowGrey("Only editors can edit fields") },
      t.builtOn,
    ],
    more: [
      { id: "open-public-link", label: "Open public link", icon: I.SquareArrowOutUpRight },
      { id: "members-access", label: "Members & access…", icon: I.Building2 },
      { id: "automations", label: "Automations", icon: I.Zap },
      { id: "record-templates", label: "Record templates", icon: I.Layers },
      { id: "sync-sheet", label: "Sync from a sheet…", icon: I.Database, ...rowGrey("Only editors can sync") },
    ],
  });
}

function featureRows(f: FeatureMenu): R2Section {
  const rows = f.rows.filter((r): r is DNode => Boolean(r));
  return { nodes: [...rows, { id: `more-${f.noun}`, label: `More ${f.noun} options`, icon: I.Table2, children: f.more }] };
}

/** Archive always closes the strip, after a gap. */
function withArchiveGap(icons: StripIcon[]): StripIcon[] {
  return icons.map((i) => (i.verb === "archive" ? { ...i, gapBefore: true } : i));
}

/** One strip's order: go · copy · share · organize · data · read · archive (most used first). */
const USE_ORDER = ["open-new-tab", "copy", "copy-link", "share", "duplicate", "favorite", "move", "rename", "export", "import", "history", "settings", "read-aloud", "find", "select-all", "archive"];

function byUse(verbs: StripIcon[]): StripIcon[] {
  return USE_ORDER.map((id) => verbs.find((v) => v.id === id)).filter((v): v is StripIcon => Boolean(v));
}

// ── V1–V3 ─────────────────────────────────────────────────────────────────────

export function buildRound2(key: Round2Key, o: Round2Options): R2Menu {
  const f = tableFeature(o.viewer);
  const verbs = resolveVerbs(f, { name: o.name, selection: o.selection });
  const kindLabel = o.kindLabel ? "Table" : null;
  const rows = featureRows(f);
  switch (key) {
    case "v1":
      // One strip (it wraps), Intelligence as a heading with 3 rows + More AI, split utility footer.
      return {
        key,
        kindLabel,
        strips: [withArchiveGap(byUse(verbs))],
        sections: [rows, { heading: "Intelligence", nodes: [...INTELLIGENCE.inline, { id: "more-ai", label: "More AI", icon: I.Layers, children: INTELLIGENCE.more }] }],
        footer: utilities("split"),
      };
    case "v2":
      // Two strips: the object's verbs, then the content verbs. Intelligence is one rich row.
      return {
        key,
        kindLabel,
        strips: [withArchiveGap(verbs.filter((v) => verbStrip(v.verb) === "object")), verbs.filter((v) => verbStrip(v.verb) === "content")],
        sections: [
          rows,
          {
            nodes: [{ id: "intelligence", label: "Intelligence", icon: I.Cpu, description: "AI actions, agents, chat", children: INTELLIGENCE.all }],
          },
        ],
        footer: utilities("split"),
      };
    case "v3": {
      // Champion pick: one strip grouped by meaning (go · share · organize · data · read · archive),
      // Intelligence heading + 3 rows + More AI, and a 5-icon footer with Save to folded.
      const groupStarts = new Set(["share", "duplicate", "export", "read-aloud", "archive"]);
      const strip = byUse(verbs).map((v) => (groupStarts.has(v.id) ? { ...v, gapBefore: true } : v));
      return {
        key,
        kindLabel,
        strips: [strip],
        sections: [rows, { heading: "Intelligence", nodes: [...INTELLIGENCE.inline, { id: "more-ai", label: "More AI", icon: I.Layers, children: INTELLIGENCE.more }] }],
        footer: utilities("grouped"),
      };
    }
  }
}

// ── Counts, walked from the menu ──────────────────────────────────────────────

export interface Round2Metrics {
  topRows: number;
  icons: number;
  featureRows: number;
  clicksToArchive: number | null;
  reachable: number;
  total: number;
  lossless: boolean;
  missing: string[];
}

export function measureRound2(m: R2Menu): Round2Metrics {
  const ids = new Set<string>();
  let archive: number | null = null;
  const walk = (nodes: readonly DNode[], depth: number) => {
    for (const n of nodes) {
      ids.add(n.id);
      if (n.id === "archive" && (archive === null || depth < archive)) archive = depth;
      if (n.children) walk(n.children, depth + 1);
    }
  };
  const icons = [...m.strips.flat(), ...m.footer];
  for (const i of icons) {
    ids.add(i.id);
    if (i.id === "archive") archive = 1;
    if (i.menu) walk(i.menu, 2);
  }
  for (const s of m.sections) walk(s.nodes, 1);
  const missing = TODAY_ALL_GENERIC_IDS.filter((id) => !ids.has(id));
  return {
    topRows: m.sections.reduce((n, s) => n + s.nodes.length, 0),
    icons: icons.length,
    featureRows: m.sections[0]?.nodes.length ?? 0,
    clicksToArchive: archive,
    reachable: TODAY_ROW_IDS.filter((id) => ids.has(id)).length,
    total: TODAY_ROW_IDS.length,
    lossless: missing.length === 0,
    missing,
  };
}

/** Used by the filter: every leaf with its path. */
export function round2Leaves(m: R2Menu): { id: string; label: string; path: string[]; icon?: string; unavailable?: string }[] {
  const out: { id: string; label: string; path: string[]; icon?: string; unavailable?: string }[] = [];
  const walk = (nodes: readonly DNode[], path: string[]) => {
    for (const n of nodes) {
      if (n.children) walk(n.children, [...path, n.label]);
      else out.push({ id: n.id, label: n.label, path, ...(n.icon ? { icon: n.icon } : {}), ...(n.viewerReason ? { unavailable: n.viewerReason } : {}) });
    }
  };
  for (const i of [...m.strips.flat(), ...m.footer]) {
    if (i.runLabel) out.push({ id: i.id, label: i.label, path: [], icon: i.icon, ...(i.unavailable ? { unavailable: i.unavailable } : {}) });
    if (i.menu) walk(i.menu, [i.label]);
  }
  for (const s of m.sections) walk(s.nodes, s.heading ? [s.heading] : []);
  return out;
}
