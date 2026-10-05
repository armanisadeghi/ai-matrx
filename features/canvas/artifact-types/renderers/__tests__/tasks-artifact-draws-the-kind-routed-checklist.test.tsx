/**
 * A ```json fence holding a task_list (captured from the live bakery-plan
 * answer, conversation 63aba4e5) is routed to a `tasks` block whose checklist
 * markdown arrives as `serverData { content }`. TasksArtifact once read only
 * `data`/`raw`, so the toolbar drew "Main: 0 of 0 / All: 0 of 0" with no rows.
 * It must draw the routed checklist — from `serverData`, and from a stored
 * `__kind` task_list value through the registry bridge.
 */
import React, { act } from "react";
import { createRoot } from "react-dom/client";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

jest.mock("@/features/tasks/components/ImportTasksModal", () => () => null);
jest.mock("@/features/tasks/utils/importConverters", () => ({ convertTimelineToTasks: () => [] }));

import { TooltipProvider } from "@/components/ui/tooltip";
import { ArtifactRender } from "../../artifact-renderers";

const BRIDGED =
  "## Foundation\n- [ ] Finalize core bread menu (8-12 items)\n- [ ] Open business bank account\n\n" +
  "## Location & Compliance\n- [ ] Sign lease\n  - [ ] Confirm oven venting requirements before signing\n" +
  "- [ ] **Apply for health department permit (longest lead time — start ASAP)**";

const KIND_VALUE = {
  __kind: "task_list",
  items: [
    { __kind: "task_item", title: "Foundation", item_type: "section", children: [
      { __kind: "task_item", title: "Finalize core bread menu (8-12 items)" },
      { __kind: "task_item", title: "Open business bank account" },
    ] },
    { __kind: "task_item", title: "Location & Compliance", item_type: "section", children: [
      { __kind: "task_item", title: "Sign lease", children: [
        { __kind: "task_item", title: "Confirm oven venting requirements before signing", item_type: "subtask" },
      ] },
      { __kind: "task_item", title: "Apply for health department permit (longest lead time — start ASAP)", bold: true },
    ] },
  ],
};

async function draw(props: Record<string, unknown>): Promise<string> {
  const host = document.createElement("div");
  document.body.appendChild(host);
  const root = createRoot(host);
  await act(async () => {
    root.render(
      <TooltipProvider>
        <ArtifactRender canvasType="tasks" mode="artifact" {...props} />
      </TooltipProvider>,
    );
  });
  const text = host.textContent ?? "";
  act(() => root.unmount());
  host.remove();
  return text;
}

describe("tasks block drawn from the kind route", () => {
  it("draws the checklist handed as serverData { content }", async () => {
    const text = await draw({ raw: "```json …```", serverData: { content: BRIDGED } });
    expect(text).toContain("Open business bank account");
    expect(text).toContain("Main: 0 of 4");
    expect(text).not.toContain("0 of 0");
  });

  it("draws a stored task_list kind value through the registry bridge", async () => {
    const text = await draw({ data: KIND_VALUE });
    expect(text).toContain("Sign lease");
    expect(text).not.toContain("0 of 0");
  });
});
