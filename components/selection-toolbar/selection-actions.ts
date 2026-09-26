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
  // Reporting
  "selection:report": ["read"],
};

/** Does the toolbar show `actionId` for this target's mode? */
export function shownInSelectionMode(actionId: string, target: ClickTarget): boolean {
  const toolbar = selectionToolbarHostOf(target);
  if (!toolbar) return false;
  const rule = SELECTION_ACTION_MODES[actionId];
  if (!rule) return false;
  const modes = typeof rule === "function" ? rule(toolbar.knobs) : rule;
  return modes.includes(toolbar.mode);
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
    return list.map((a) => ({
      ...a,
      eligible: (t: ClickTarget) => (shownInSelectionMode(a.id, t) ? a.eligible(t) : { status: "absent" as const }),
    }));
  },
};

const REGISTERED = new WeakMap<object, Set<string>>();

/** Register a provider into the app's one registry, once per registry. */
export function ensureProvider(registry: { register(p: ActionProvider): () => void }, provider: ActionProvider): void {
  let seen = REGISTERED.get(registry);
  if (!seen) {
    seen = new Set();
    REGISTERED.set(registry, seen);
  }
  if (seen.has(provider.id)) return;
  seen.add(provider.id);
  registry.register(provider);
}
