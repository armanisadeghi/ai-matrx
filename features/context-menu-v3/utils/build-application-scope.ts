import type { ApplicationScope } from "@/features/agents/utils/scope-mapping";
import type { SelectionRange } from "./selection-tracking";

const SKIP_MERGE_KEYS = new Set(["contextFilter"]);

export function buildApplicationScopeFromMenuContext(args: {
  selectedText: string;
  selectionRange: SelectionRange | null;
  contextData: Record<string, unknown>;
}): ApplicationScope {
  const { selectedText, selectionRange, contextData: cd } = args;

  let textBefore = "";
  let textAfter = "";
  let fullContent = "";
  if (
    selectionRange &&
    selectionRange.type === "editable" &&
    selectionRange.element
  ) {
    const value = selectionRange.element.value ?? "";
    fullContent = value;
    textBefore = value.substring(0, selectionRange.start ?? 0);
    textAfter = value.substring(selectionRange.end ?? 0);
  }

  const applicationScope: ApplicationScope = {};

  // Surface payload first — skip undefined so live capture is not clobbered later.
  for (const [k, v] of Object.entries(cd)) {
    if (SKIP_MERGE_KEYS.has(k) || v === undefined) continue;
    applicationScope[k] = v;
  }

  if (typeof cd.context === "string") {
    applicationScope.context = { raw: cd.context };
  } else if (cd.context !== undefined && typeof cd.context !== "string") {
    applicationScope.context = cd.context as Record<string, unknown>;
  } else if (applicationScope.context === undefined) {
    applicationScope.context = {};
  }

  // Live DOM capture wins for the baseline text-editor triad.
  applicationScope.selection = selectedText;
  applicationScope.text_before = textBefore;
  applicationScope.text_after = textAfter;

  if (typeof cd.content === "string") {
    applicationScope.content = cd.content;
  } else if (fullContent) {
    applicationScope.content = fullContent;
  } else if (applicationScope.content === undefined) {
    applicationScope.content = "";
  }

  // Notes convention: `active_text` is selection when highlighted, else full note body.
  // Bindings that map agent `content` ← surface `selection` should still work when
  // the user didn't highlight but the surface knows the acting text.
  const activeText = applicationScope.active_text;
  if (
    applicationScope.selection === "" &&
    typeof activeText === "string" &&
    activeText.length > 0
  ) {
    applicationScope.selection = activeText;
  }

  return applicationScope;
}
