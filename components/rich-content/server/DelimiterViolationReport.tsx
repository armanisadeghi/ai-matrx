"use client";

// The server level's loud-recovery channel. A server render cannot reach the
// client error store, so the server level hands its delimiter violations to
// this leaf, which reports them once on mount through the same channel every
// client level uses (reportDelimiterViolations → captureError). Renders
// nothing — the recovered text is already in the server HTML.

import { useEffect } from "react";
import {
  reportDelimiterViolations,
  type guardMarkdownDelimiters,
} from "@ai-matrx/kit/delimiter-guard";
import { captureError } from "@/lib/diagnostics/errorCaptureStore";

type Violations = ReturnType<typeof guardMarkdownDelimiters>["violations"];

export function DelimiterViolationReport({
  violations,
  renderPath,
}: {
  violations: Violations;
  renderPath: string;
}) {
  useEffect(() => {
    if (violations.length === 0) return;
    reportDelimiterViolations(violations, {
      renderPath,
      capture: captureError,
    });
  }, [violations, renderPath]);
  return null;
}

export default DelimiterViolationReport;
