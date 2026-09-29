import type { ReactNode } from "react";

import { createRouteMetadata } from "@/utils/route-metadata";
import "@/features/question-desk/question-desk.css";

/**
 * THE EDITORIAL SERIF (ruling QD-R7).
 *
 * The Question Desk is the one screen in the platform whose job is to be READ
 * — one long question at a time, in prose, by a person deciding something
 * irreversible. Its own stylesheet keeps the editorial serif scoped to
 * `.qd-editorial`; it intentionally uses the browser's local serif stack.
 *
 * `next/font/google` is not used here: current Turbopack's Google-font asset
 * replacer can fail this whole admin build while resolving Newsreader's
 * multi-file font CSS. A local system stack keeps this route independent of
 * that build-time virtual import and avoids a runtime font request.
 *
 * It is deliberately NOT a design-system token yet: promoting an editorial face
 * into `@ai-matrx/design-system` is a package wave, and this is the smallest
 * honest step. Cost if that ruling is wrong: one font move.
 */
export const metadata = createRouteMetadata("/administration", {
  title: "Question Desk",
  description:
    "Interviews that put open questions to one person and record the verdict and the verbatim answer",
  letter: "AQ",
});

export default function QuestionDeskLayout({
  children,
}: {
  children: ReactNode;
}) {
  return children;
}
