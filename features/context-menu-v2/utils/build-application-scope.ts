import type { ApplicationScope } from "@/features/agents/utils/scope-mapping";
import type { SelectionRange } from "./selection-tracking";

export function buildApplicationScopeFromMenuContext(args: {
  selectedText: string;
  selectionRange: SelectionRange | null;
  contextData: Record<string, unknown>;
}): ApplicationScope {
  const { selectedText, selectionRange, contextData: cd } = args;

  let textBefore = "";
  let textAfter = "";
  if (
    selectionRange &&
    selectionRange.type === "editable" &&
    selectionRange.element
  ) {
    const value = selectionRange.element.value ?? "";
    textBefore = value.substring(0, selectionRange.start ?? 0);
    textAfter = value.substring(selectionRange.end ?? 0);
  }

  const applicationScope: ApplicationScope = {
    selection: selectedText,
    text_before: textBefore,
    text_after: textAfter,
    content: typeof cd.content === "string" ? cd.content : "",
    context:
      typeof cd.context === "string"
        ? { raw: cd.context }
        : ((cd.context as Record<string, unknown> | undefined) ?? {}),
  };

  for (const [k, v] of Object.entries(cd)) {
    if (k === "content" || k === "context" || k === "contextFilter") continue;
    applicationScope[k] = v;
  }

  return applicationScope;
}
