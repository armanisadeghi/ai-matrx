// features/context-menu-v3/proposed/proposed-arrangement.ts
//
// THE PROPOSED RIGHT-CLICK MENU (Arman, 2026-10-02), applied to the rows the REAL registry
// resolved for a real surface — nothing here invents a row. It merges two designs: the object-first
// layout (icons, four rows, one Intelligence row, large and header-less) and the regroup demo's
// "what you get" categories (`../regroup/proposed-grouping.ts`, reused here, not copied).
//
//   [icons: ≤6, one action each, never a submenu — chosen by WHAT was clicked]
//       a thing (row, card)   Copy · Share · Duplicate · Favorite · Download · Archive (red)
//       editable text         Cut · Copy · Paste · Undo · Redo · Find
//       read-only text        Copy · Read aloud · Find · Share
//   [Type to filter…]
//   4 rows: the clicked thing's own actions (editable text: its edit actions)
//   More <thing> options ▸
//   Intelligence ▸   every AI entry, one row, on every menu
//   Save & share ▸   Copy as · Download · Convert to · Publish · Share — one block each
//   Organize ▸       Attach · Pin · History · Compare
//   Tools ▸          Read aloud · Quick Actions · Feedback · This page · Admin
//
// A page's own row that does what a universal row does merges into it (regroup's merge rule):
// one Share, one Download, one Copy. Copy link folds into Share (its dialog carries the link).
// A thing that brings its own Download/Export owns that verb outright: the universal page-text
// file rows (PDF, Word, HTML, Markdown, print — regroup's "download" group) are dropped for it,
// because they would save the menu's text, not the thing (a table exports CSV/XLSX, never a PDF
// of its row label). `recordActionsOnly` cannot do this: it keeps Export by design. "Save as PDF
// Document" files the same page text as a PDF, so it goes with them.
// Applied only where a MenuRegroupContext passes `transform` (the demo); production is unchanged
// until Arman approves.

import { Archive, Copy, Ellipsis, FolderTree, Share2, Wrench } from "lucide-react";
import { INTELLIGENCE_ICON } from "@/components/icons/domain-icons";
import type { Action, ActionCategory, ActionSection, ClickTarget, ResolvedAction } from "@ai-matrx/alchemy/actions";
import { registerAlchemyIcon } from "@ai-matrx/rich-content/utils/alchemy-icon-keys";
import { actionLabel, matchRule } from "../regroup/grouping";
import { PROPOSED_MENU_GROUPING } from "../regroup/proposed-grouping";

const icon = (c: unknown) => registerAlchemyIcon(c);

export const STRIP_MAX = 6;
export const OWN_ROWS_MAX = 4;

export type ClickedKind = "thing" | "editable" | "text";

/** One icon slot: the first resolved leaf that matches fills it. */
interface StripSlot {
  key: string;
  ids?: readonly string[];
  /** Labels of the clicked thing's OWN rows (case-insensitive). */
  ownLabels?: readonly RegExp[];
}

const SLOT: Record<string, StripSlot> = {
  copy: { key: "copy", ids: ["cm:copy", "copy"], ownLabels: [/^copy( to clipboard)?$/i] },
  cut: { key: "cut", ids: ["cm:cut"] },
  paste: { key: "paste", ids: ["cm:paste"] },
  undo: { key: "undo", ids: ["cm:undo"] },
  redo: { key: "redo", ids: ["cm:redo"] },
  find: { key: "find", ids: ["cm:find"] },
  speak: { key: "speak", ids: ["cm:speak"] },
  share: { key: "share", ownLabels: [/^share\b/i], ids: ["cm:share"] },
  duplicate: { key: "duplicate", ownLabels: [/^duplicate\b/i, /^make a copy\b/i] },
  favorite: { key: "favorite", ownLabels: [/favou?rite/i, /^(un)?star\b/i] },
  download: { key: "download", ownLabels: [/^(export|download)\b/i] },
  archive: { key: "archive", ownLabels: [/^archive\b/i, /^delete\b/i, /^move to trash\b/i] },
};

/** The icons for each kind of click, in drawing order. */
const STRIP_FOR: Record<ClickedKind, readonly string[]> = {
  thing: ["copy", "share", "duplicate", "favorite", "download", "archive"],
  editable: ["cut", "copy", "paste", "undo", "redo", "find"],
  text: ["copy", "speak", "find", "share"],
};

/** Universal rows outside regroup's "download" group that also turn the page text into a file. */
const PAGE_TEXT_FILE_IDS = new Set(["save-as-pdf"]);

/** The object's own Open row, and the Link verb that sits right after it. */
const OPEN_ROW = /^open( record)?$/i;
const LINK_A_RECORD = /^link a record/i;
// The record's other own verbs (Merge, Split, Extract parent) are top-level beside Open and Link, outside the own-row cap.
const RECORD_VERBS = [/^merge with/i, /^split(…|\.\.\.)?$/i, /^extract parent/i];

/** Own rows that fold into a strip verb instead of sitting beside it. */
const FOLDS_INTO_SHARE = [/^copy link\b/i, /^share link\b/i];

/** Regroup's "what you get" groups → the three rows under Intelligence. */
const SAVE_SHARE_GROUPS = ["copy", "download", "convert", "publish", "share"] as const;
const ORGANIZE_GROUPS = new Set(["organize", "history", "compare"]);
const AI_ORDER: readonly (string | RegExp)[] = [
  "cm:chat",
  "cm:placement:ai-action",
  "cm:placement:bound-agent",
  "cm:agents",
  "cm:placement:user-tool",
  "cm:placement:organization-tool",
  "cm:placement:content-block",
  /^send to (another )?agent/i,
  /^custom agent/i,
];
const AI_LABELS = [/^summari[sz]e\b/i, /^send to (another )?agent/i, /^custom agent/i];

/**
 * The clicked thing's own rows: a surface's `extraSections` (engine ids `cm:x:<…>`, except the
 * engine's own page submenu `cm:x:surface`) or a section the surface lifted / named after itself.
 */
function isOwn(action: Action): boolean {
  if (action.id.startsWith("cm:x:") && !action.id.startsWith("cm:x:surface")) return true;
  const s = action.section as (ActionSection & { kind?: string }) | undefined;
  return Boolean(s && (s.primary || s.kind === "target"));
}

export function clickedKind(target: ClickTarget, resolved: readonly ResolvedAction[]): ClickedKind {
  if (!target.readOnly && resolved.some((r) => r.action.id === "cm:paste")) return "editable";
  if (resolved.some((r) => isOwn(r.action))) return "thing";
  return "text";
}

function submenu(id: string, label: string, category: ActionCategory, iconKey: string, children: readonly Action[], order = 0): ResolvedAction {
  const action: Action = {
    id: `proposed:${id}`,
    label,
    category,
    order,
    icon: iconKey,
    pending: (t) => children.some((c) => Boolean(c.expand && c.pending?.(t))),
    eligible: () => ({ status: "available" }),
    expand: async () => children,
    run: () => undefined,
  };
  return { action, eligibility: { status: "available" } };
}

/** A submenu row stripped of its old section (a heading the new home does not draw). */
function plain(action: Action, extra: Partial<Action> = {}): Action {
  const { section: _section, ...rest } = action;
  void _section;
  return { ...rest, ...extra };
}

export interface ProposedOptions {
  /** The clicked thing's name for "More <noun> options" ("table", "quiz", "note"). */
  noun: string;
}

export function proposedArrangement(
  target: ClickTarget,
  resolved: readonly ResolvedAction[],
  { noun }: ProposedOptions,
): ResolvedAction[] {
  const kind = clickedKind(target, resolved);
  const label = (r: ResolvedAction) => actionLabel(r.action, target);
  const groupOf = (r: ResolvedAction) => {
    const to = matchRule(PROPOSED_MENU_GROUPING, r.action, target)?.to;
    return to?.kind === "group" ? to.key : null;
  };
  const used = new Set<string>();

  // 0 · the thing's own Download/Export replaces the universal file rows (see header).
  const ownsDownload = resolved.some((r) => isOwn(r.action) && SLOT.download!.ownLabels!.some((re) => re.test(label(r))));
  if (ownsDownload) {
    for (const r of resolved) {
      if (!isOwn(r.action) && (groupOf(r) === "download" || PAGE_TEXT_FILE_IDS.has(r.action.id))) used.add(r.action.id);
    }
  }

  // 1 · the icon row.
  const strip: ResolvedAction[] = [];
  for (const key of STRIP_FOR[kind]) {
    if (strip.length >= STRIP_MAX) break;
    const slot = SLOT[key]!;
    const pick =
      resolved.find(
        (r) => !used.has(r.action.id) && !r.action.expand && isOwn(r.action) && slot.ownLabels?.some((re) => re.test(label(r))),
      ) ?? resolved.find((r) => !used.has(r.action.id) && !r.action.expand && slot.ids?.includes(r.action.id));
    if (!pick) continue;
    used.add(pick.action.id);
    // One verb, one icon: the page's own Share/Copy wins over the universal twin.
    if (key === "share") for (const r of resolved) if (r.action.id === "cm:share") used.add(r.action.id);
    if (key === "copy") for (const r of resolved) if (r.action.id === "cm:copy") used.add(r.action.id);
    strip.push({
      ...pick,
      action: plain(pick.action, {
        category: "clipboard",
        order: strip.length,
        ...(key === "archive" ? { destructive: true, icon: pick.action.icon ?? icon(Archive) } : {}),
        ...(key === "copy" && !pick.action.icon ? { icon: icon(Copy) } : {}),
      }),
    });
  }
  const hasShare = strip.some((r) => /^share\b/i.test(label(r)));

  // 2 · the clicked thing's own rows (editable text: its edit actions and the editor's Save).
  // An own row that does what a universal outcome does ("Export as Markdown", "Share link…") joins
  // that outcome under Save & share instead (the regroup merge rule) — unless it already became an icon.
  const ownCandidates = resolved.filter((r) => {
    if (used.has(r.action.id)) return false;
    const g = groupOf(r);
    if (g && (SAVE_SHARE_GROUPS as readonly string[]).includes(g) && !(hasShare && FOLDS_INTO_SHARE.some((re) => re.test(label(r))))) return false;
    if (isOwn(r.action)) return true;
    return kind === "editable" && (groupOf(r) === "edit" || r.action.id === "cm:save" || r.action.id === "cm:delete");
  });
  // OPEN AND "LINK A RECORD…" LEAD THE OWN ROWS (CHAIR-UI-STORE item 3, 2026-10-03): on a store
  // record's cell or row the cell's rows (Paste, Clear cell, …) and the row's (Copy row, Insert, …)
  // filled the four top rows and "Link a record…" fell under "More … options", while every CRM row
  // shows Open and Link top-level. They are the record's own verbs, so they go first, in that order.
  const lead = (re: RegExp) => {
    const at = ownCandidates.findIndex((r) => re.test(label(r)));
    return at >= 0 ? ownCandidates.splice(at, 1)[0]! : null;
  };
  const openRow = lead(OPEN_ROW);
  const linkRow = lead(LINK_A_RECORD);
  const verbRows = RECORD_VERBS.map(lead).filter((r): r is ResolvedAction => r !== null);
  const leading = [openRow, linkRow, ...verbRows].filter((r): r is ResolvedAction => r !== null);
  const verbIds = new Set(verbRows.map((r) => r.action.id));
  let counted = 0;
  ownCandidates.unshift(...leading);
  const own: ResolvedAction[] = [];
  const more: Action[] = [];
  for (const r of ownCandidates) {
    used.add(r.action.id);
    const folds = hasShare && FOLDS_INTO_SHARE.some((re) => re.test(label(r)));
    if (!folds && (verbIds.has(r.action.id) || counted < OWN_ROWS_MAX) && !r.action.expand) {
      const destructive = SLOT.archive!.ownLabels!.some((re) => re.test(label(r)));
      if (!verbIds.has(r.action.id)) counted += 1;
      own.push({ ...r, action: plain(r.action, { category: "edit", order: own.length, ...(destructive ? { destructive: true } : {}) }) });
    } else {
      more.push(plain(r.action));
    }
  }
  const top: ResolvedAction[] = [...strip, ...own];
  if (more.length) top.push(submenu("more", `More ${noun} options`, "edit", icon(Ellipsis), more, OWN_ROWS_MAX));

  // 3 · everything else, by what you get.
  const ai: Action[] = [];
  const saveShare = new Map<string, Action[]>();
  const organize: Action[] = [];
  const tools: Action[] = [];
  for (const r of resolved) {
    if (used.has(r.action.id)) continue;
    used.add(r.action.id);
    const g = groupOf(r);
    if (g === "ai" || r.action.category === "ai" || r.action.category === "ask" || AI_LABELS.some((re) => re.test(label(r)))) {
      ai.push(plain(r.action));
    } else if (g && (SAVE_SHARE_GROUPS as readonly string[]).includes(g)) {
      const list = saveShare.get(g) ?? [];
      list.push(plain(r.action));
      saveShare.set(g, list);
    } else if (g && ORGANIZE_GROUPS.has(g)) {
      organize.push(plain(r.action));
    } else {
      tools.push(plain(r.action));
    }
  }
  // Chat and the libraries first, then hand-offs, then spoken summaries.
  const aiRank = (a: Action) => {
    const i = AI_ORDER.findIndex((p) => (typeof p === "string" ? a.id === p || a.id.startsWith(p) : p.test(String(a.label))));
    return i === -1 ? AI_ORDER.length : i;
  };
  ai.sort((a, b) => aiRank(a) - aiRank(b));
  top.push(submenu("intelligence", "Intelligence", "ai", icon(INTELLIGENCE_ICON), ai));

  // Save & share: one block per outcome, a divider between blocks.
  const saveShareRows: Action[] = [];
  for (const g of SAVE_SHARE_GROUPS) {
    const rows = saveShare.get(g) ?? [];
    rows.forEach((a, i) => saveShareRows.push(i === 0 && saveShareRows.length > 0 ? { ...a, startsGroup: true } : a));
  }
  if (saveShareRows.length) top.push(submenu("save-share", "Save & share", "app", icon(Share2), saveShareRows));
  if (organize.length) top.push(submenu("organize", "Organize", "app", icon(FolderTree), organize, 1));
  if (tools.length) top.push(submenu("tools", "Tools", "feedback", icon(Wrench), tools));
  return top;
}
