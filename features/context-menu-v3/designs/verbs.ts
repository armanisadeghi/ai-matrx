// features/context-menu-v3/designs/verbs.ts
//
// THE VERB CONTRACT (round 2 of the right-click demo, 2026-10-02; Arman's point 3):
// a feature never adds its own "Duplicate table" next to the menu's "Duplicate".
// The menu owns ONE fixed catalog of standard verbs; a feature BINDS its handlers
// to them. A bound verb IS the object's verb (its handler, its name in the
// tooltip); an unbound content verb falls back to the platform's text/content
// behaviour; an unbound object verb is absent. The feature then declares at
// most 4 rows one icon cannot tell, plus the list behind "More <noun> options".
// AI goes in Intelligence; platform utilities go in the footer row.
// Contract notes for feature developers: VERBS.md. Demo-local.

import { G, I, type DNode } from "./catalog";

// ── The catalog ───────────────────────────────────────────────────────────────

export type VerbId =
  | "open-new-tab"
  | "copy"
  | "copy-link"
  | "share"
  | "duplicate"
  | "favorite"
  | "move"
  | "rename"
  | "export"
  | "import"
  | "history"
  | "settings"
  | "speak"
  | "find"
  | "select-all"
  | "archive";

export interface VerbDef {
  id: VerbId;
  /** The menu node id it draws as — the same in every feature's menu. */
  nodeId: string;
  label: string;
  icon: string;
  shortcut?: string;
  /**
   * "object": drawn only when a feature binds it (there is no text meaning of "Archive").
   * "content": always drawn on a target with content; unbound, the platform's text behaviour runs.
   */
  kind: "object" | "content";
  /** With text selected, the selection outranks the object (Copy copies the words, not the table). */
  selectionWins?: boolean;
  /** The platform's own options under the icon's chevron, kept whether or not the verb is bound. */
  platformMenu?: DNode[];
  destructive?: boolean;
  /** Which strip it sits in when a design draws two. */
  strip: "object" | "content";
}

const COPY_MENU: DNode[] = [
  G.copyAs,
  G.copyReference,
  { ...G.compareClipboard, startsGroup: true },
  G.compareSetBase,
  G.compareBase,
];

const EXPORT_MENU: DNode[] = [...G.export.children, { ...G.save, startsGroup: true }];

/** In draw order. Archive is last, always. */
export const VERBS: readonly VerbDef[] = [
  { id: "open-new-tab", nodeId: "open-new-tab", label: "Open in new tab", icon: I.ExternalLink, shortcut: "⌘↵", kind: "object", strip: "object" },
  { id: "copy-link", nodeId: "copy-link", label: "Copy link", icon: I.Link, shortcut: "⌘L", kind: "object", strip: "object" },
  { id: "share", nodeId: "share", label: "Share", icon: I.Share2, kind: "object", strip: "object" },
  { id: "duplicate", nodeId: "duplicate", label: "Duplicate", icon: I.CopyPlus, shortcut: "⌘D", kind: "object", strip: "object" },
  { id: "favorite", nodeId: "favorite", label: "Favorite", icon: I.Star, kind: "object", strip: "object" },
  { id: "move", nodeId: "move", label: "Move to", icon: I.FolderInput, kind: "object", strip: "object" },
  { id: "rename", nodeId: "rename", label: "Rename", icon: I.Pencil, shortcut: "F2", kind: "object", strip: "object" },
  { id: "history", nodeId: "history", label: "History", icon: I.History, kind: "object", strip: "content" },
  { id: "settings", nodeId: "settings", label: "Settings", icon: I.Settings, kind: "object", strip: "content" },
  { id: "copy", nodeId: "copy", label: "Copy", icon: I.Copy, shortcut: "⌘C", kind: "content", selectionWins: true, platformMenu: COPY_MENU, strip: "content" },
  { id: "export", nodeId: "export", label: "Export", icon: I.FileDown, kind: "content", platformMenu: EXPORT_MENU, strip: "content" },
  { id: "import", nodeId: "import", label: "Import", icon: I.Upload, kind: "object", strip: "content" },
  { id: "speak", nodeId: "read-aloud", label: "Read aloud", icon: I.Volume2, kind: "content", selectionWins: true, platformMenu: [G.voiceSettings], strip: "content" },
  { id: "find", nodeId: "find", label: "Find", icon: I.Search, shortcut: "⌘F", kind: "content", strip: "content" },
  { id: "select-all", nodeId: "select-all", label: "Select all", icon: I.TextSelect, shortcut: "⌘A", kind: "content", strip: "content" },
  { id: "archive", nodeId: "archive", label: "Archive", icon: I.Archive, shortcut: "⌘⌫", kind: "object", destructive: true, strip: "object" },
];

// ── What a feature declares ───────────────────────────────────────────────────

export interface VerbBinding {
  /** The object's handler. The demo passes the label it would run. */
  run(): void;
  /** The object's name for the verb when it says more ("Archive table"). */
  label?: string;
  /** Viewer rights: drawn greyed, this one line as the tooltip. Same shape for every seat. */
  unavailable?: string;
  /** Options the object adds above the platform's menu (Export: CSV, Excel). */
  menu?: DNode[];
}

/** At most 4 rows that one icon cannot tell. A 5th does not compile. */
export type FeatureRows = readonly [DNode?, DNode?, DNode?, DNode?];

export interface FeatureMenu {
  /** "table" — names the opener row: "More table options". */
  noun: string;
  /** The object's handlers, bound to the menu's own verbs. Never a second copy of a verb. */
  bind: Partial<Record<VerbId, VerbBinding>>;
  rows: FeatureRows;
  /** Everything else the feature offers, behind the one opener row. */
  more: DNode[];
}

/** The 4 + 1 rule, checked at run time too (a cast can dodge the tuple type). */
export function assertFeature(f: FeatureMenu): FeatureMenu {
  const rows = f.rows.filter((r): r is DNode => Boolean(r));
  if (rows.length > 4) throw new Error(`${f.noun}: ${rows.length} feature rows; the menu takes 4 plus "More ${f.noun} options".`);
  const verbLabels = new Set(VERBS.map((v) => v.label.toLowerCase()));
  for (const r of [...rows, ...f.more]) {
    const word = r.label.replace(/…$/, "").toLowerCase();
    if (verbLabels.has(word)) throw new Error(`${f.noun}: "${r.label}" is the menu's own verb — bind it (bind.${word}) instead of adding a row.`);
  }
  return f;
}

// ── What the menu draws from it ───────────────────────────────────────────────

export interface StripIcon {
  id: string;
  verb?: VerbId;
  label: string;
  icon: string;
  shortcut?: string;
  unavailable?: string;
  destructive?: boolean;
  /** Present: the icon runs this on click (and its menu, if any, sits behind a chevron). */
  runLabel?: string;
  /** Absent `runLabel`: the whole icon opens this menu. */
  menu?: DNode[];
  /** Who answers: the object's handler, or the platform's text/content fallback. */
  owner?: "object" | "platform";
  /** A small gap before it: the strip's groups. */
  gapBefore?: boolean;
}

export interface StripTarget {
  /** The object's display name ("Patient Visit Tracker"). */
  name: string;
  /** The words the person selected, or null. */
  selection: string | null;
}

/** The verbs that apply here, bound to the object where it answers, else to the platform. */
export function resolveVerbs(f: FeatureMenu, target: StripTarget): StripIcon[] {
  const out: StripIcon[] = [];
  for (const v of VERBS) {
    const b = f.bind[v.id];
    if (!b && v.kind === "object") continue; // nothing to archive: absent, never greyed
    const objectAnswers = Boolean(b) && !(v.selectionWins && target.selection);
    const runLabel = objectAnswers ? `${b?.label ?? v.label} · ${target.name}` : `${v.label} · ${target.selection ? "selected text" : "page content"}`;
    const menu = [...(objectAnswers && b?.menu ? b.menu : []), ...(v.platformMenu ?? [])];
    out.push({
      id: v.nodeId,
      verb: v.id,
      label: objectAnswers && b?.label ? b.label : v.label,
      icon: v.icon,
      ...(v.shortcut ? { shortcut: v.shortcut } : {}),
      ...(b?.unavailable && objectAnswers ? { unavailable: b.unavailable } : {}),
      ...(v.destructive ? { destructive: true } : {}),
      runLabel,
      ...(menu.length ? { menu: separateGroups(objectAnswers && b?.menu ? b.menu.length : 0, menu) } : {}),
      owner: objectAnswers ? "object" : "platform",
    });
  }
  return out;
}

/** A divider between the object's options and the platform's. */
function separateGroups(objectCount: number, menu: DNode[]): DNode[] {
  if (!objectCount || objectCount >= menu.length) return menu;
  return menu.map((n, i) => (i === objectCount ? { ...n, startsGroup: true } : n));
}

/** Which strip a verb belongs to (for designs that draw two). */
export function verbStrip(id: VerbId | undefined): "object" | "content" {
  return VERBS.find((v) => v.id === id)?.strip ?? "object";
}

// ── The platform layers every menu gets, after the feature ────────────────────

/** Intelligence: every AI row, in one place. */
export const INTELLIGENCE = {
  inline: [G.aiActions, G.agents, G.chat] as DNode[],
  more: [
    G.myItems,
    G.orgItems,
    { ...G.sendAgent, startsGroup: true },
    G.customAgent,
    { ...G.summarizeListen, startsGroup: true },
    G.summarizeSilent,
  ] as DNode[],
  /** All of it, for a design that opens Intelligence as one submenu. */
  all: [
    G.aiActions,
    G.agents,
    G.myItems,
    G.orgItems,
    { ...G.sendAgent, startsGroup: true },
    G.customAgent,
    G.chat,
    { ...G.summarizeListen, startsGroup: true },
    G.summarizeSilent,
  ] as DNode[],
};

const icon = (n: DNode, extra: Partial<StripIcon> = {}): StripIcon => ({
  id: n.id,
  label: n.label,
  icon: n.icon ?? I.Info,
  ...(n.children ? { menu: n.children } : { runLabel: n.label }),
  owner: "platform",
  ...extra,
});

/** Platform utilities: the footer icon row. `split` keeps Notes / Task / Rulebook apart; `grouped` folds them into one "Save to". */
export function utilities(style: "split" | "grouped"): StripIcon[] {
  const save =
    style === "split"
      ? [
          icon(G.saveNotes),
          { id: "family-task", label: "Task", icon: I.ListTodo, menu: [G.saveTask, G.createTask], owner: "platform" as const },
          icon(G.addRulebook),
        ]
      : [{ id: "family-save-to", label: "Save to", icon: I.StickyNote, menu: [G.saveNotes, G.saveTask, G.createTask, G.addRulebook], owner: "platform" as const }];
  return [...save, icon(G.quickActions), icon(G.feedback), icon(G.thisPage), icon(G.adminTools)];
}
