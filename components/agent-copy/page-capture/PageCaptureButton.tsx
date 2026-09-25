"use client";

/**
 * PageCaptureButton — the page's Alchemy menu over its registered capture
 * (`usePageCapture`). Absent when no capture is registered (a control is absent
 * or honest, never dead). One icon pair, the canonical menu:
 *
 * - Copy (human): the capture as readable markdown;
 * - Copy for AI (default): everything — page, selection, errors, data, requests;
 * - "Only the data": the page and selection kept, the request log dropped;
 * - the Groomer: every section with Full / Compact / Brief / Off.
 */

import { CopyButtons } from "@/components/agent-copy/CopyButtons";
import {
  pageCaptureGroomer,
  pageCaptureMarkdown,
  pageCapturePayload,
} from "./pageCapture";
import { getActivePageCapture, usePageCaptureVersion } from "./usePageCapture";

export function PageCaptureButton({
  size = "sm",
  className,
}: {
  size?: "xs" | "icon" | "sm" | "toolbar";
  className?: string;
}) {
  usePageCaptureVersion();
  const capture = getActivePageCapture();
  if (!capture) return null;
  const live = () => {
    const c = getActivePageCapture();
    if (!c) throw new Error("This page stopped describing itself; reload it and copy again.");
    return c;
  };
  return (
    <span data-page-capture={capture.kind} className={className}>
      <CopyButtons
        size={size}
        label={capture.title}
        human={() => pageCaptureMarkdown(live())}
        json={() => live()}
        agent={() => pageCapturePayload(live(), "everything")}
        agentVariant={{ id: "everything", label: "Everything on this page", position: "first" }}
        aiVariants={[
          {
            id: "data-only",
            label: "Only the data",
            hint: "The page and your choices, without the request log",
            build: () => pageCapturePayload(live(), "data"),
          },
        ]}
        groomer={() => pageCaptureGroomer(live())}
      />
    </span>
  );
}
