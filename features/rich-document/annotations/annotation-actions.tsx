// features/rich-document/annotations/annotation-actions.tsx
//
// The annotation sidecar's passage actions — highlight (five colours),
// comment, suggest an edit, link a record — as actions of the ONE Alchemy
// registry, shown by the ONE selection toolbar (components/selection-toolbar).
// `AnnotatedContent` registers its text as a selection zone carrying the
// `annotation` half of the click target; the actions capture the selection
// into a text anchor at click time and write exactly as before (the sidecar
// API: addHighlight / postComment / link).

import type { ComponentType } from "react";
import { Link2, MessageSquarePlus, PencilLine, Send } from "lucide-react";
import type { Action, ActionProvider, ClickTarget } from "@ai-matrx/alchemy/actions";
import { registerAlchemyIcon } from "@/components/agent-copy/alchemy-icon-keys";
import {
  declareSelectionProvider,
  placeSelectionActions,
  hostHalf,
  SELECTION_COMMON_HOST_KEY,
  selectionToolbarHostOf,
  shownInSelectionMode,
  type SelectionCommonHost,
} from "@/components/selection-toolbar/selection-actions";
import { HIGHLIGHT_COLORS, type HighlightColor } from "./constants";
import type { TextAnchor } from "./anchor";
import type { AnnotationSidecarApi } from "./useAnnotationSidecar";

export const ANNOTATION_HOST_KEY = "annotation";

export type FeedbackReport = Parameters<SelectionCommonHost["openFeedback"]>[0];

/** A selection pinned to the document's own text. */
export interface CapturedSelection {
  anchor: TextAnchor;
  rect: { left: number; top: number; bottom: number; width: number };
}

/** The annotation half of the selection click target (set by AnnotatedContent). */
export interface AnnotationSelectionHost {
  kind: "annotation";
  api: AnnotationSidecarApi;
  /**
   * Pin the current selection to the source text. `silent` answers "can it be
   * pinned?" without telling the person; otherwise a selection that cannot be
   * pinned (a formula, a label) is said once through the app's toast.
   */
  capture(options?: { silent?: boolean }): CapturedSelection | null;
  /** The report about a passage (the feedback window's title + subject, quote and position filled in). */
  report(selection: CapturedSelection): FeedbackReport;
}

export function annotationHostOf(target: ClickTarget): AnnotationSelectionHost | null {
  const half = hostHalf<AnnotationSelectionHost>(target, ANNOTATION_HOST_KEY);
  return half?.kind === "annotation" ? half : null;
}

/** Panels AnnotatedContent draws inside the toolbar frame. */
export const ANNOTATION_PANELS = {
  comment: "annotation:comment",
  suggest: "annotation:suggest",
  link: "annotation:link",
  reattach: "annotation:reattach",
} as const;

export const SWATCH: Record<HighlightColor, string> = {
  yellow: "bg-yellow-300",
  green: "bg-green-300",
  blue: "bg-sky-300",
  pink: "bg-pink-300",
  purple: "bg-violet-300",
};

/** One swatch glyph per colour, resolved through the Alchemy icon port. */
function swatchIcon(color: HighlightColor): string {
  const Swatch: ComponentType<{ className?: string }> = ({ className }) => (
    <span aria-hidden className={`${className ?? ""} inline-block rounded-full border border-border ${SWATCH[color]}`} />
  );
  Swatch.displayName = `HighlightSwatch${color[0].toUpperCase()}${color.slice(1)}`;
  return registerAlchemyIcon(Swatch);
}

const absent = { status: "absent" } as const;
const available = { status: "available" } as const;

function eligibleHere(id: string, t: ClickTarget, extra?: (host: AnnotationSelectionHost) => boolean) {
  const host = annotationHostOf(t);
  if (!host || !shownInSelectionMode(id, t)) return absent;
  if (!host.capture({ silent: true })) return absent;
  if (extra && !extra(host)) return absent;
  return available;
}

const HIGHLIGHTS: Action[] = HIGHLIGHT_COLORS.map((color, index) => {
  const id = `selection:highlight-${color}`;
  return {
    id,
    label: `Highlight ${color}`,
    icon: swatchIcon(color),
    category: "save",
    order: index,
    placement: "primary",
    preserveSelection: true,
    // Absent where no annotation document may sit on this kind of record (no document → token pair).
    eligible: (t) => eligibleHere(id, t, (h) => h.api.state.capabilities.highlights),
    run: async (t) => {
      const host = annotationHostOf(t);
      const selection = host?.capture();
      if (!host || !selection) return;
      selectionToolbarHostOf(t)?.ui.close({ clearSelection: true });
      await host.api.addHighlight(selection.anchor, color);
    },
  };
});

function panelAction(
  id: string,
  label: string,
  icon: unknown,
  order: number,
  panel: string,
  only?: (host: AnnotationSelectionHost) => boolean,
): Action {
  return {
    id,
    label,
    icon: registerAlchemyIcon(icon),
    category: "share",
    order,
    placement: "primary",
    preserveSelection: true,
    eligible: (t) => eligibleHere(id, t, only),
    run: (t) => {
      const host = annotationHostOf(t);
      const selection = host?.capture();
      if (!host || !selection) return;
      selectionToolbarHostOf(t)?.ui.openPanel(panel, selection);
    },
  };
}

const REPORT: Action = {
  id: "selection:report",
  label: "Report an issue",
  icon: registerAlchemyIcon(Send),
  category: "feedback",
  order: 0,
  placement: "primary",
  preserveSelection: true,
  eligible: (t) => eligibleHere("selection:report", t),
  run: (t) => {
    const host = annotationHostOf(t);
    const selection = host?.capture();
    if (!host || !selection) return;
    const common = hostHalf<SelectionCommonHost>(t, SELECTION_COMMON_HOST_KEY);
    if (!common) return;
    selectionToolbarHostOf(t)?.ui.close({ clearSelection: true });
    common.openFeedback(host.report(selection));
  },
};

const ACTIONS: Action[] = [
  ...HIGHLIGHTS,
  REPORT,
  panelAction("selection:comment", "Comment", MessageSquarePlus, 10, ANNOTATION_PANELS.comment),
  panelAction("selection:suggest", "Suggest an edit", PencilLine, 11, ANNOTATION_PANELS.suggest),
  panelAction("selection:link-record", "Link a record…", Link2, 12, ANNOTATION_PANELS.link, (h) => h.api.state.capabilities.links),
];

/** The annotation provider (declared on load; the toolbar root registers it). */
export const annotationSelectionProvider: ActionProvider = {
  id: "annotation-selection",
  tier: "T0",
  declaredIds: () => ACTIONS.map((a) => a.id),
  actions: (target) => (annotationHostOf(target) ? placeSelectionActions(ACTIONS, target) : []),
};

declareSelectionProvider(annotationSelectionProvider);
