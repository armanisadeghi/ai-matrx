import { act } from "react";
import { createRoot } from "react-dom/client";
import type { ResearchActivityEntry } from "@/features/podcasts/studio/runs/useStudioRun";
import {
  activityVisualStates,
  ResearchActivityFeed,
} from "./ResearchActivityFeed";

(
  globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }
).IS_REACT_ACT_ENVIRONMENT = true;

function entry(
  id: string,
  event: ResearchActivityEntry["event"],
  message: string,
): ResearchActivityEntry {
  return {
    id,
    callId: "research-call",
    toolName: "research_web",
    event,
    message,
    at: 1,
  };
}

describe("ResearchActivityFeed", () => {
  it("settles every historical row when its tool call completes", () => {
    const entries = [
      entry("start", "tool_started", "Executing Research Web"),
      entry("progress", "tool_progress", "Reading the strongest sources"),
      entry("complete", "tool_completed", "Scraped 12 pages"),
    ];

    const states = activityVisualStates(entries, true);

    expect(states.get("start")).toBe("complete");
    expect(states.get("progress")).toBe("complete");
    expect(states.get("complete")).toBe("complete");
  });

  it("animates only the newest genuinely active row", () => {
    const entries = [
      entry("start", "tool_started", "Executing Research Web"),
      entry("progress", "tool_progress", "Reading the strongest sources"),
    ];
    const container = document.createElement("div");
    document.body.appendChild(container);
    const root = createRoot(container);

    act(() =>
      root.render(<ResearchActivityFeed entries={entries} streaming />),
    );

    const startRow = Array.from(container.querySelectorAll("span")).find(
      (node) => node.textContent === "Executing Research Web",
    )?.parentElement;
    const progressRow = Array.from(container.querySelectorAll("span")).find(
      (node) => node.textContent === "Reading the strongest sources",
    )?.parentElement;

    expect(startRow?.querySelector("svg")?.getAttribute("class")).not.toContain(
      "animate-spin",
    );
    expect(progressRow?.querySelector("svg")?.getAttribute("class")).toContain(
      "animate-spin",
    );

    act(() => root.unmount());
    container.remove();
  });
});
