import type { ReactNode } from "react";
import { Newsreader } from "next/font/google";

import { createRouteMetadata } from "@/utils/route-metadata";
import "@/features/question-desk/question-desk.css";

/**
 * THE EDITORIAL SERIF (ruling QD-R7).
 *
 * The Question Desk is the one screen in the platform whose job is to be READ
 * — one long question at a time, in prose, by a person deciding something
 * irreversible. Newsreader is loaded here, in this feature's own route layout,
 * self-hosted at build time by `next/font/google` (no runtime CDN, no layout
 * shift), and exposed as `--font-editorial`, which only
 * `features/question-desk/question-desk.css`'s `.qd-editorial` consumes.
 *
 * It is deliberately NOT a design-system token yet: promoting an editorial face
 * into `@ai-matrx/design-system` is a package wave, and this is the smallest
 * honest step. Cost if that ruling is wrong: one font move.
 */
const editorial = Newsreader({
  subsets: ["latin"],
  weight: ["400", "500", "600"],
  style: ["normal", "italic"],
  display: "swap",
  variable: "--font-editorial",
});

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
  return <div className={editorial.variable}>{children}</div>;
}
