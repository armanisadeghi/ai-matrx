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
  loadableSections,
  pageCaptureGroomer,
  pageCaptureJson,
  pageCaptureMarkdown,
  pageCapturePayload,
  resolvePageCapture,
} from "./pageCapture";
import { getActivePageCapture, usePageCaptureVersion } from "./usePageCapture";

export function PageCaptureButton({
  size = "sm",
  className,
}: {
  size?: "xs" | "icon" | "sm" | "toolbar";
  className?: string;
}) {
  const version = usePageCaptureVersion();
  const capture = getActivePageCapture(version);
  if (!capture) return null;
  const loadable = loadableSections(capture);
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
        /* The workspace ("Prepare for AI") clones this strictly: plain JSON, loads as sentences. */
        json={() => pageCaptureJson(live())}
        agent={() => pageCapturePayload(live(), "everything")}
        agentVariant={{ id: "everything", label: "Everything on this page", position: "first" }}
        aiVariants={[
          ...(loadable.length > 0
            ? [
                {
                  id: "everything-loaded",
                  label: `Everything, with ${loadable.map((s) => s.title.toLowerCase()).join(" and ")}`,
                  hint: "Reads them from the store now",
                  build: async () => pageCapturePayload(await resolvePageCapture(live()), "everything"),
                },
              ]
            : []),
          {
            id: "data-only",
            label: "Only the data",
            hint:
              loadable.length > 0
                ? `The page, your choices and ${loadable.map((s) => s.title.toLowerCase()).join(" and ")}, without the request log`
                : "The page and your choices, without the request log",
            build: async () => pageCapturePayload(await resolvePageCapture(live()), "data"),
          },
        ]}
        groomer={() => pageCaptureGroomer(live())}
      />
    </span>
  );
}
