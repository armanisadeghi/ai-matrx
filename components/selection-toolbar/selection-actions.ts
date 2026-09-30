// components/selection-toolbar/selection-actions.ts
//
// What the ONE selection toolbar shows is registry data. Every selection
// action is an ordinary Alchemy action registered by its owner's provider
// (rich-editor formatting, annotations, a surface's passage actions); this
// file holds the two things they share:
//
//   • SELECTION_ACTION_MODES — which mode (editing / reading) shows each
//     action. One table, read by every selection provider's eligibility, so
//     "what does the reader see vs the writer" is answered in one place.
//   • the toolbar's own half of the click target (`selectionToolbar`): the
//     mode, the taste knobs and the toolbar UI a running action drives.
//
// A selection action that is not in the table is never shown in the toolbar
// (it would otherwise appear in both modes by accident).

import type { Action, ActionProvider, ClickTarget } from "@ai-matrx/alchemy/actions";
import type { SelectionMode, SelectionToolbarUi } from "./selection-zones";
import type { FeedbackSubject } from "@/features/overlays/openers/feedbackDialog";

/** The toolbar's knobs (platform.feature_knob, feature `selection_toolbar`). */
export const SELECTION_TOOLBAR_KNOB_FEATURE = "selection_toolbar";
export const HIGHLIGHT_WHILE_EDITING_KNOB = {
  feature: SELECTION_TOOLBAR_KNOB_FEATURE,
  key: "highlight_while_editing",
} as const;
/** The code default while the knob loads (and the seeded default): off. */
export const HIGHLIGHT_WHILE_EDITING_DEFAULT = false;

export interface SelectionToolbarKnobs {
  highlightWhileEditing: boolean;
}

/** The toolbar's own half of the composite host. */
export interface SelectionToolbarHost {
  kind: "selection-toolbar";
  mode: SelectionMode;
  knobs: SelectionToolbarKnobs;
  ui: SelectionToolbarUi;
  /**
   * How many buttons fit in one row (the docked phone bar), or null when the
   * strip is unbounded (desktop). Past it, the lowest-priority actions move
   * into the registry's overflow (More) so the bar never scrolls.
   */
  slots: number | null;
}

export function selectionToolbarHostOf(target: ClickTarget): SelectionToolbarHost | null {
  const half = (target.host as { selectionToolbar?: SelectionToolbarHost } | undefined)?.selectionToolbar;
  return half?.kind === "selection-toolbar" ? half : null;
}

/** Read another provider's half of the composite host. */
export function hostHalf<T>(target: ClickTarget, key: string): T | null {
  const host = target.host as Record<string, unknown> | undefined;
  return (host?.[key] as T | undefined) ?? null;
}

type ModeRule = readonly SelectionMode[] | ((knobs: SelectionToolbarKnobs) => readonly SelectionMode[]);

const HIGHLIGHT: ModeRule = (knobs) => (knobs.highlightWhileEditing ? ["read", "edit"] : ["read"]);

/**
 * THE MODE TABLE. Editing: formatting + AI + comment. Reading: highlight,
 * comment, suggest, AI, link and report. AI shows in both.
 */
export const SELECTION_ACTION_MODES: Readonly<Record<string, ModeRule>> = {
  // Formatting (rich editor)
  "selection:format-bold": ["edit"],
  "selection:format-italic": ["edit"],
  "selection:format-strike": ["edit"],
  "selection:format-code": ["edit"],
  "selection:format-link": ["edit"],
  "selection:format-h1": ["edit"],
  "selection:format-h2": ["edit"],
  "selection:format-quote": ["edit"],
  "selection:format-list": ["edit"],
  "selection:format-variable": ["edit"],
  // Annotations (the annotation sidecar)
  "selection:highlight-yellow": HIGHLIGHT,
  "selection:highlight-green": HIGHLIGHT,
  "selection:highlight-blue": HIGHLIGHT,
  "selection:highlight-pink": HIGHLIGHT,
  "selection:highlight-purple": HIGHLIGHT,
  "selection:comment": ["read", "edit"],
  "selection:suggest": ["read"],
  "selection:link-record": ["read"],
  // AI — every mode
  "selection:ai": ["read", "edit"],
  "selection:tutor-explain": ["read"],
  "selection:tutor-ask": ["read"],
  // Reporting (every annotated passage: study guides, documents in Annotate)
  "selection:report": ["read"],
  // Rich-editor tables (the caret or a selection in a table cell)
  "selection:table-row-above": ["edit"],
  "selection:table-row-below": ["edit"],
  "selection:table-col-left": ["edit"],
  "selection:table-col-right": ["edit"],
  "selection:table-align-left": ["edit"],
  "selection:table-align-center": ["edit"],
  "selection:table-align-right": ["edit"],
  "selection:table-del-row": ["edit"],
  "selection:table-del-col": ["edit"],
  "selection:table-del-table": ["edit"],
  // Every selection that has no richer home: copy it, keep it
  "selection:copy": ["read", "edit"],
  "selection:save-to-notes": ["read", "edit"],
  // A selection that reads as rows (a table, a list, Key: value lines, CSV) — SAVE-AS-TABLE-EVERYWHERE
  "selection:save-to-table": ["read", "edit"],
};

/**
 * THE HOST KINDS — what a person gets, by where the text is. Documentation that
 * the census test checks against the providers (selection-host-kinds.test.ts):
 * a host kind is the set of host halves present on the target.
 *
 *   annotated reading  (annotation + context menu)  highlight ×5, comment, suggest, link, report, AI and more —
 *                                                    the study guide, document Annotate, and EVERY saved record
 *                                                    (annotations/RecordAnnotations): a note's preview, a chat
 *                                                    answer, the studio previewing an unedited saved document.
 *                                                    Highlight/Link are absent on a kind with no association pair
 *                                                    (a chat answer until its pairs are applied).
 *   rich editor        (richEditor + context menu)   formatting, copy, AI and more; COMMENT only when the buffer
 *                                                    is a saved record (a saved document or note) — absent for an
 *                                                    unsaved buffer; table actions while the caret/selection is in
 *                                                    a table. Notes' own editor modes: pending the notes migration
 *                                                    onto the one editor (RC-A4).
 *   plain reading      (context menu only)           copy, save to notes, AI and more — unsaved content: a stream
 *                                                    in flight, raw text, an edited studio copy, window panels
 *   text field         (context menu, editable)      copy, save to notes, AI and more
 */
export const SELECTION_HOST_KINDS = {
  annotatedReading: ["annotation", "contextMenuSelection"],
  richEditor: ["richEditor", "contextMenuSelection"],
  plainReading: ["contextMenuSelection"],
} as const;

/** Does the toolbar show `actionId` for this target's mode? */
export function shownInSelectionMode(actionId: string, target: ClickTarget): boolean {
  const toolbar = selectionToolbarHostOf(target);
  if (!toolbar) return false;
  const rule = SELECTION_ACTION_MODES[actionId];
  if (!rule) return false;
  const modes = typeof rule === "function" ? rule(toolbar.knobs) : rule;
  return modes.includes(toolbar.mode);
}

// ── The common pair: copy, save to notes ───────────────────────────────────

export const SELECTION_COMMON_HOST_KEY = "selectionCommon";

/** Set by the root on every target: the selected text and the app's doors. */
export interface SelectionCommonHost {
  kind: "selection-common";
  text: string;
  saveToNotes(content: string): void;
  /** The one "Save to a table" (SAVE-AS-TABLE-EVERYWHERE) for a selection that reads as rows. */
  saveToTable(content: string): void;
  /**
   * The selection written back as the shapes it was drawn from (`shapeTextOfNode` over the
   * selected DOM): a rendered table's rows as a markdown table, a list's bullets as bullets. The
   * flattened `text` loses both. Null where the selection is not over rendered content.
   */
  shapeText: string | null;
  /** The app's feedback window (a passage report). */
  openFeedback(report: { title: string; subject: FeedbackSubject }): void;
}

// ── Fitting the bar: priority, then the registry's overflow ─────────────────

/**
 * Which actions keep a button when the bar cannot show them all (a phone).
 * Everything else — including "AI and more" when space is tight — moves into
 * the registry's overflow (the layout's More), so the bar never scrolls.
 */
export const SELECTION_PRIORITY: Readonly<Record<SelectionMode, readonly string[]>> = {
  edit: [
    "selection:format-bold",
    "selection:format-italic",
    "selection:format-link",
    "selection:ai",
    "selection:comment",
    "selection:table-row-below",
    "selection:table-col-right",
    "selection:copy",
    "selection:format-strike",
    "selection:format-code",
    "selection:format-h1",
    "selection:format-h2",
    "selection:format-quote",
    "selection:format-list",
    "selection:format-variable",
    "selection:highlight-yellow",
    "selection:highlight-green",
    "selection:highlight-blue",
    "selection:highlight-pink",
    "selection:highlight-purple",
    "selection:table-row-above",
    "selection:table-col-left",
    "selection:table-align-left",
    "selection:table-align-center",
    "selection:table-align-right",
    "selection:table-del-row",
    "selection:table-del-col",
    "selection:table-del-table",
    "selection:save-to-notes",
    "selection:save-to-table",
  ],
  read: [
    "selection:highlight-yellow",
    "selection:comment",
    "selection:ai",
    "selection:suggest",
    "selection:tutor-explain",
    "selection:highlight-green",
    "selection:highlight-blue",
    "selection:highlight-pink",
    "selection:highlight-purple",
    "selection:tutor-ask",
    "selection:link-record",
    "selection:report",
    "selection:copy",
    "selection:save-to-notes",
    "selection:save-to-table",
  ],
};

/** The host half an action needs (an action whose provider is absent cannot take a slot). */
function hostKeyOf(id: string): string {
  if (id.startsWith("selection:format-") || id.startsWith("selection:table-")) return "richEditor";
  if (id === "selection:copy" || id === "selection:save-to-notes" || id === "selection:save-to-table") return SELECTION_COMMON_HOST_KEY;
  if (id === "selection:ai") return "contextMenuSelection";
  if (id.startsWith("selection:tutor-")) return PASSAGE_ACTIONS_HOST_KEY;
  return "annotation";
}

function presentAt(id: string, target: ClickTarget): boolean {
  const key = hostKeyOf(id);
  // The common pair shows only where nothing richer owns the passage: an annotation host that can
  // pin THIS selection. One that cannot (a figure or other island in the Visual editor, text the
  // record's source does not hold) offers nothing, so Copy and Save to notes stay.
  // Save to a table is not one of the pair the annotation host replaces: an annotated answer or note
  // (Read mode) offers highlights, never rows-as-a-table, so it stays wherever the text reads as rows
  // (VERIFIER-30 #1).
  if (key === SELECTION_COMMON_HOST_KEY && id !== "selection:save-to-table") {
    const annotation = hostHalf<{ capture?: (o: { silent?: boolean }) => unknown }>(target, "annotation");
    if (annotation && (!annotation.capture || annotation.capture({ silent: true }))) return false;
  }
  if (id.startsWith("selection:table-")) {
    const editor = hostHalf<{ inTable?: () => boolean }>(target, "richEditor");
    if (!editor?.inTable?.()) return false;
  }
  const half = hostHalf<unknown>(target, key);
  if (!half) return false;
  if (key === PASSAGE_ACTIONS_HOST_KEY) return (half as readonly Action[]).some((a) => a.id === id);
  return shownInSelectionMode(id, target);
}

/** "primary" (a button) or "overflow" (a More row) for this action at this target. */
export function selectionPlacement(id: string, target: ClickTarget): "primary" | "overflow" {
  const toolbar = selectionToolbarHostOf(target);
  if (!toolbar || toolbar.slots === null) return "primary";
  const shown = SELECTION_PRIORITY[toolbar.mode].filter((x) => presentAt(x, target));
  if (shown.length <= toolbar.slots) return "primary";
  // One slot goes to the More button itself.
  const rank = shown.indexOf(id);
  return rank >= 0 && rank < Math.max(1, toolbar.slots - 1) ? "primary" : "overflow";
}

/** A provider's actions, placed for this target (every selection provider returns through this). */
export function placeSelectionActions(actions: readonly Action[], target: ClickTarget): Action[] {
  // An action that always lives under More (a destructive table action) stays there.
  return actions.map((a) => (a.placement === "overflow" ? a : { ...a, placement: selectionPlacement(a.id, target) }));
}

// ── A surface's own passage actions ─────────────────────────────────────────

/**
 * A surface adds passage actions (the study guide's "I don't get this") by
 * putting ordinary Alchemy actions on its zone's `passageActions` host half;
 * this provider yields them, gated by the mode table like every other
 * selection action. One provider, so a surface never hand-renders buttons.
 */
export const PASSAGE_ACTIONS_HOST_KEY = "passageActions";

export const passageActionsProvider: ActionProvider = {
  id: "selection-passage",
  tier: "T0",
  actions: (target) => {
    const list = hostHalf<readonly Action[]>(target, PASSAGE_ACTIONS_HOST_KEY) ?? [];
    return placeSelectionActions(list, target).map((a) => ({
      ...a,
      eligible: (t: ClickTarget) => (shownInSelectionMode(a.id, t) ? a.eligible(t) : { status: "absent" as const }),
    }));
  },
};

// ── Declaring a selection provider ──────────────────────────────────────────

/**
 * A selection provider DECLARES itself when its module loads (the rich
 * editor's formatting, the annotation actions, the context menu's entry); the
 * toolbar root registers every declared provider into the app's one Alchemy
 * registry. Hosts therefore never need the registry themselves, and a host
 * rendered without the app shell (a unit test) simply has no toolbar.
 */
const declared = new Map<string, ActionProvider>();
const declaredListeners = new Set<() => void>();

export function declareSelectionProvider(provider: ActionProvider): void {
  const existing = declared.get(provider.id);
  if (existing === provider) return;
  // A second module under the same id is a wiring defect, never a silent overwrite.
  if (existing && process.env.NODE_ENV !== "development") {
    throw new Error(`Selection provider "${provider.id}" was declared twice by different modules.`);
  }
  declared.set(provider.id, provider);
  for (const l of [...declaredListeners]) l();
}

export function declaredSelectionProviders(): readonly ActionProvider[] {
  return [...declared.values()];
}

export function subscribeDeclaredSelectionProviders(listener: () => void): () => void {
  declaredListeners.add(listener);
  return () => {
    declaredListeners.delete(listener);
  };
}

declareSelectionProvider(passageActionsProvider);

const REGISTERED = new WeakMap<object, Map<string, () => void>>();

/** Register a provider into a registry, once per registry (the root calls this). */
export function ensureProvider(registry: { register(p: ActionProvider): () => void }, provider: ActionProvider): void {
  let seen = REGISTERED.get(registry);
  if (!seen) {
    seen = new Map();
    REGISTERED.set(registry, seen);
  }
  if (seen.has(provider.id)) return;
  seen.set(provider.id, registry.register(provider));
}
