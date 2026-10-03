// features/context-menu-v3/proposed/proposed-arrangement.ts
//
// THE PROPOSED RIGHT-CLICK MENU (Arman, 2026-10-02), applied to the rows the REAL registry
// resolved for a real surface — nothing here invents a row:
//
//   [icons: ≤6 one-tap verbs, no chevrons]      Copy · Share · Duplicate · Favorite · Download · Archive
//   [Type to filter…]
//   4 rows: the clicked thing's own actions, in its own order
//   More <thing> options ▸   (every other own action)
//   Intelligence ▸           (ALL AI: agent libraries, chat, summarize — one row, every menu)
//   Copy & save ▸            (copy as, references, save to, export, compare, history)
//   Tools ▸                  (read aloud, quick actions, feedback, this page, admin)
//
// Merges a person never notices: Copy link folds into Share (the share dialog carries the link);
// a page's own Share wins over the universal one. Rename stays a row (it reads as "edit" too).
// Applied only where a MenuRegroupContext passes `transform` (the demo); production is unchanged
// until Arman approves.

import { Archive, Copy, Ellipsis, Wrench } from "lucide-react";
import { INTELLIGENCE_ICON } from "@/components/icons/domain-icons";
import type { Action, ActionCategory, ActionSection, ClickTarget, ResolvedAction } from "@ai-matrx/alchemy/actions";
import { registerAlchemyIcon } from "@/components/agent-copy/alchemy-icon-keys";
import { actionLabel } from "../regroup/grouping";

const icon = (c: unknown) => registerAlchemyIcon(c);

export const STRIP_MAX = 6;
export const OWN_ROWS_MAX = 4;

/** One strip slot: the first resolved leaf that matches fills it. */
interface StripSlot {
  key: string;
  ids?: readonly string[];
  /** Labels of the clicked thing's OWN rows (case-insensitive regex). */
  ownLabels?: readonly RegExp[];
  /** Only when the target is editable text. */
  editableOnly?: boolean;
}

const STRIP_SLOTS: readonly StripSlot[] = [
  { key: "copy", ids: ["cm:copy", "copy"], ownLabels: [/^copy( to clipboard)?$/i] },
  { key: "cut", ids: ["cm:cut"], editableOnly: true },
  { key: "paste", ids: ["cm:paste"], editableOnly: true },
  { key: "share", ownLabels: [/^share\b/i], ids: ["cm:share"] },
  { key: "duplicate", ownLabels: [/^duplicate\b/i, /^make a copy\b/i] },
  { key: "favorite", ownLabels: [/favou?rite/i, /^(un)?star\b/i, /^pin\b/i] },
  { key: "download", ownLabels: [/^(export|download)\b/i] },
  { key: "archive", ownLabels: [/^archive\b/i, /^delete\b/i, /^move to trash\b/i] },
];

/** Own rows that fold into a strip verb instead of sitting beside it. */
const FOLDS_INTO_SHARE = [/^copy link\b/i, /^share link\b/i];

const AI_ID_PREFIXES = ["cm:placement:", "cm:agents", "cm:cat:", "cm:entry:"];
const AI_IDS = new Set(["cm:chat"]);
const AI_LABELS = [/^summari[sz]e\b/i, /^send to (another )?agent/i, /^custom agent/i, /^ask\b/i];

const COPY_SAVE_CATEGORIES = new Set<ActionCategory>(["clipboard", "edit", "copy", "export", "save", "share", "history", "study"]);

/**
 * The clicked thing's own rows: a surface's `extraSections` (engine ids `cm:x:<…>`, except the
 * engine's own page submenu `cm:x:surface`) or a section the surface lifted / named after itself.
 */
function isOwn(action: Action): boolean {
  if (action.id.startsWith("cm:x:") && !action.id.startsWith("cm:x:surface")) return true;
  const s = action.section as (ActionSection & { kind?: string }) | undefined;
  return Boolean(s && (s.primary || s.kind === "target"));
}

function isAi(action: Action, label: string): boolean {
  if (action.category === "ai" || action.category === "ask") return true;
  if (AI_IDS.has(action.id) || AI_ID_PREFIXES.some((p) => action.id.startsWith(p))) return true;
  return AI_LABELS.some((r) => r.test(label));
}

function submenu(
  id: string,
  label: string,
  category: ActionCategory,
  order: number,
  iconKey: string,
  children: readonly Action[],
  section?: ActionSection,
): ResolvedAction {
  const action: Action = {
    id: `proposed:${id}`,
    label,
    category,
    order,
    icon: iconKey,
    ...(section ? { section } : {}),
    pending: (t) => children.some((c) => Boolean(c.expand && c.pending?.(t))),
    eligible: () => ({ status: "available" }),
    expand: async () => children,
    run: () => undefined,
  };
  return { action, eligibility: { status: "available" } };
}

export interface ProposedOptions {
  /** The clicked thing's name for "More <noun> options" ("table", "quiz", "note"). */
  noun: string;
}

// "target": the clicked thing's own rows — a heading kind the package always allows; no label is drawn.
const OWN_SECTION: ActionSection = { id: "proposed:own", label: "", primary: true, kind: "target" };

export function proposedArrangement(
  target: ClickTarget,
  resolved: readonly ResolvedAction[],
  { noun }: ProposedOptions,
): ResolvedAction[] {
  const editable = Boolean(target.selection && target.selection.type !== "non-editable") || !target.readOnly;
  const label = (r: ResolvedAction) => actionLabel(r.action, target);
  const used = new Set<string>();

  // 1 · the icon row: one leaf per slot, at most six, no submenu ever becomes an icon.
  const strip: ResolvedAction[] = [];
  for (const slot of STRIP_SLOTS) {
    if (strip.length >= STRIP_MAX) break;
    if (slot.editableOnly && !editable) continue;
    const pick =
      resolved.find(
        (r) => !used.has(r.action.id) && !r.action.expand && isOwn(r.action) && slot.ownLabels?.some((re) => re.test(label(r))),
      ) ??
      resolved.find((r) => !used.has(r.action.id) && !r.action.expand && slot.ids?.includes(r.action.id));
    if (!pick) continue;
    used.add(pick.action.id);
    // A page's own Share wins: the universal Share is the same verb.
    if (slot.key === "share") for (const r of resolved) if (r.action.id === "cm:share") used.add(r.action.id);
    const { section: _section, ...rest } = pick.action;
    void _section;
    strip.push({
      ...pick,
      action: {
        ...rest,
        category: "clipboard",
        order: strip.length,
        ...(slot.key === "archive" ? { destructive: true, icon: rest.icon ?? icon(Archive) } : {}),
        ...(slot.key === "copy" && !rest.icon ? { icon: icon(Copy) } : {}),
      },
    });
  }

  // Copy link folds into Share when Share is on the icon row.
  const hasShare = strip.some((r) => /^share\b/i.test(label(r)));

  // 2 · the clicked thing's own rows: four at the top, the rest behind "More <noun> options".
  const own: ResolvedAction[] = [];
  const more: Action[] = [];
  for (const r of resolved) {
    if (used.has(r.action.id) || !isOwn(r.action)) continue;
    used.add(r.action.id);
    const l = label(r);
    if (hasShare && FOLDS_INTO_SHARE.some((re) => re.test(l))) {
      more.push(r.action);
      continue;
    }
    if (own.length < OWN_ROWS_MAX && !r.action.expand) {
      own.push({ ...r, action: { ...r.action, section: OWN_SECTION, order: own.length } });
    } else {
      more.push(r.action);
    }
  }
  const top: ResolvedAction[] = [...strip, ...own];
  if (more.length) {
    top.push(submenu("more", `More ${noun} options`, "edit", 999, icon(Ellipsis), more, OWN_SECTION));
  }

  // 3 · everything AI behind one row, always present.
  const ai: Action[] = [];
  const copySave: Action[] = [];
  const tools: Action[] = [];
  for (const r of resolved) {
    if (used.has(r.action.id)) continue;
    used.add(r.action.id);
    const l = label(r);
    if (isAi(r.action, l)) ai.push(r.action);
    else if (r.action.id === "cm:speak" || r.action.id === "cm:listen" || r.action.id === "cm:find") tools.push(r.action);
    else if (COPY_SAVE_CATEGORIES.has(r.action.category)) copySave.push(r.action);
    else tools.push(r.action);
  }
  top.push(submenu("intelligence", "Intelligence", "ai", 0, icon(INTELLIGENCE_ICON), ai));
  if (copySave.length) top.push(submenu("copy-save", "Copy & save", "app", 0, icon(Copy), copySave));
  if (tools.length) top.push(submenu("tools", "Tools", "feedback", 0, icon(Wrench), tools));
  return top;
}
