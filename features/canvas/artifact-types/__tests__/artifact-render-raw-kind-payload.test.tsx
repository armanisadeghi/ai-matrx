/**
 * A `{"__kind":"timeline",…}` body pasted into a note arrives at
 * ArtifactRender as RAW TEXT (ArtifactBlock passes `raw`, not `data`). It used
 * to render "Timeline / 0 events"; it must render the payload's title and
 * events exactly as chat does.
 */
import React, { act } from "react";
import { createRoot } from "react-dom/client";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

jest.mock("@/features/tasks/components/ImportTasksModal", () => () => null);
jest.mock("@/features/tasks/utils/importConverters", () => ({ convertTimelineToTasks: () => [] }));

import { TooltipProvider } from "@/components/ui/tooltip";
import { ArtifactRender } from "../artifact-renderers";

const PAYLOAD = JSON.stringify({
  __kind: "timeline",
  title: "Launch Plan",
  periods: [
    {
      __kind: "timeline_period",
      period: "Phase 1",
      events: [
        { __kind: "timeline_event", title: "Kickoff", date: "Jan 1", description: "Start" },
        { __kind: "timeline_event", title: "Design", date: "Jan 8", description: "Mocks" },
      ],
    },
    {
      __kind: "timeline_period",
      period: "Phase 2",
      events: [{ __kind: "timeline_event", title: "Ship", date: "Feb 1", description: "Go" }],
    },
  ],
});

async function renderRaw(raw: string): Promise<string> {
  const host = document.createElement("div");
  document.body.appendChild(host);
  const root = createRoot(host);
  await act(async () => {
    root.render(
      <TooltipProvider>
        <ArtifactRender canvasType="timeline" mode="artifact" raw={raw} />
      </TooltipProvider>,
    );
  });
  const text = host.textContent ?? "";
  act(() => root.unmount());
  host.remove();
  return text;
}

describe("ArtifactRender with a raw __kind payload (note preview path)", () => {
  it("renders the payload title and all 3 events", async () => {
    const text = await renderRaw(PAYLOAD);
    expect(text).toContain("Launch Plan");
    expect(text).toContain("0/3 events");
  });
});
