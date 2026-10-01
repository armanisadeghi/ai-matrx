/**
 * THE BOTTOM-LAYER REPORT — a low-level raw renderer (a markdown leaf, the
 * value grid, a JSON viewer, the JSON code card) was handed kind data. It has
 * already rendered the data as its kind; this files the CALLER in the Error
 * Inspector so the screen that skipped the value door is found and fixed
 * (Arman, 2026-09-30: a `__kind` is never drawn as raw JSON). Checklist C4:
 * `features/content-ir/docs/KIND_NEVER_RAW_CHECKLIST.md`.
 *
 * Once per component + slug per session: a render loop must not flood the
 * inspector. The owner stack (development builds) names the caller.
 */

import { captureOwnerStack, useEffect } from "react";
import { captureError } from "@/lib/diagnostics/errorCaptureStore";

const reported = new Set<string>();

export function reportKindAtRawRenderer(
  component: string,
  slug: string | null,
  ownerStack?: string | null,
): void {
  const key = `${component}:${slug ?? ""}`;
  if (reported.has(key)) return;
  reported.add(key);
  captureError({
    source: "content-ir",
    relation: slug ?? undefined,
    message: `${component} was handed kind data${slug ? ` ("${slug}")` : ""} — rendered it as its kind instead of raw.`,
    hint: "The caller should render this value through AnswerValueView (or text through MarkdownStream). The call site is in the stack.",
    callSite: ownerStack ?? undefined,
    stack: ownerStack ?? undefined,
    recoverable: true,
  });
}

/** Test seam: forget what was reported. */
export function resetKindAtRawRendererReports(): void {
  reported.clear();
}

/**
 * Report from a component's render. The owner stack is read during render
 * (the only time React has it) and filed after commit.
 */
export function useReportKindAtRawRenderer(
  component: string,
  slug: string | null,
  active: boolean,
): void {
  const ownerStack =
    active && typeof captureOwnerStack === "function"
      ? captureOwnerStack()
      : null;
  useEffect(() => {
    if (!active) return;
    reportKindAtRawRenderer(component, slug, ownerStack);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- reported once per component + slug; the stack is evidence, not identity
  }, [component, slug, active]);
}
