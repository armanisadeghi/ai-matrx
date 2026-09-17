import { act } from "react";
import { createRoot, type Root } from "react-dom/client";

// Guard for the 2026-09-17 live defect: on an in-place run the durable
// agent_run id is unknown when the panel first opens and arrives mid-stream.
// The panel must (a) say the record isn't assigned instead of rendering empty
// records beside "Nothing is hidden", and (b) re-read the moment the id lands.

type Query = { schema: string; table: string; eq: Record<string, unknown> };
const queries: Query[] = [];

const RUN_ID = "e24c4b68-98ff-44c8-a4b9-dce2a751ce68";
const STUDIO_ID = "f1f932d7-0d0f-4955-b9fd-1d5229c0509c";

function rowsFor(q: Query): unknown {
  if (q.table === "pc_studio_runs") {
    return { id: STUDIO_ID, backend_run_id: null };
  }
  if (q.table === "agent_run" && q.eq.id === RUN_ID) {
    return { id: RUN_ID, status: "completed", request: { topic: "x" } };
  }
  if (q.table === "agent_run_stage" && q.eq.run_id === RUN_ID) {
    return [
      { id: "s1", stage_key: "prepare_content", status: "completed" },
      { id: "s2", stage_key: "post_prep", status: "completed" },
    ];
  }
  return q.table === "agent_run_stage" ? [] : null;
}

jest.mock("@/utils/supabase/client", () => ({
  supabase: {
    schema: (schema: string) => ({
      from: (table: string) => {
        const q: Query = { schema, table, eq: {} };
        queries.push(q);
        const result = () => Promise.resolve({ data: rowsFor(q), error: null });
        const builder = {
          select: () => builder,
          eq: (col: string, value: unknown) => {
            q.eq[col] = value;
            return builder;
          },
          order: () => result(),
          maybeSingle: () => result(),
        };
        return builder;
      },
    }),
  },
}));

jest.mock("@/lib/toast", () => ({
  toast: { success: jest.fn(), error: jest.fn() },
}));

import { RunTruthInspector } from "./RunTruthInspector";

globalThis.IS_REACT_ACT_ENVIRONMENT = true;

async function flush() {
  for (let i = 0; i < 5; i++) {
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 0));
    });
  }
}

describe("RunTruthInspector keying", () => {
  let container: HTMLDivElement;
  let root: Root;

  beforeEach(() => {
    queries.length = 0;
    container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);
  });

  afterEach(() => {
    act(() => root.unmount());
    container.remove();
  });

  it("re-reads the run the moment its durable id arrives on an open panel", async () => {
    act(() => {
      root.render(
        <RunTruthInspector agentRunId={null} studioRunId={STUDIO_ID} episodeId={null} />,
      );
    });
    const header = container.querySelector("button");
    if (!header) throw new Error("inspector header button did not render");
    act(() => header.dispatchEvent(new MouseEvent("click", { bubbles: true })));
    await flush();

    // No id yet: honest, not empty records.
    expect(container.textContent).toContain("hasn't assigned this run its durable record");
    expect(container.textContent).not.toContain("No stage records found");

    // The stream announces the durable run id — no reload, no click.
    act(() => {
      root.render(
        <RunTruthInspector agentRunId={RUN_ID} studioRunId={STUDIO_ID} episodeId={null} />,
      );
    });
    await flush();

    expect(
      queries.some((q) => q.table === "agent_run_stage" && q.eq.run_id === RUN_ID),
    ).toBe(true);
    expect(container.textContent).toContain(`run: ${RUN_ID}`);
    expect(container.textContent).toContain("completed");
    expect(container.textContent).toContain("Stages (2)");
  });

  it("resolves the id from the scratch row's backend_run_id when the page has none", async () => {
    const { resolveTruthAgentRunId } = await import("./RunTruthInspector");
    expect(
      resolveTruthAgentRunId({
        agentRunId: null,
        studioRunId: STUDIO_ID,
        studioRun: { backend_run_id: RUN_ID },
      }),
    ).toBe(RUN_ID);
    expect(
      resolveTruthAgentRunId({ agentRunId: null, studioRunId: STUDIO_ID, studioRun: { backend_run_id: null } }),
    ).toBeNull();
    // No scratch row: the URL id is the agent_run id (manage-list links).
    expect(
      resolveTruthAgentRunId({ agentRunId: null, studioRunId: RUN_ID, studioRun: null }),
    ).toBe(RUN_ID);
  });
});
