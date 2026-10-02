import type { ToolLifecycleEntry } from "@/features/agents/types/request.types";

import { selectCorrectedToolCallIds } from "@/features/agents/redux/execution-system/observability/observability.selectors";
import type { RootState } from "@/lib/redux/store";

import { withoutCorrectedFailures } from "./correctedFailures";

function entry(callId: string, toolName: string, status: ToolLifecycleEntry["status"]): ToolLifecycleEntry {
  return {
    callId,
    toolName,
    displayName: toolName,
    status,
    arguments: {},
    startedAt: "2026-09-26T14:44:40.000Z",
    completedAt: null,
    latestMessage: null,
    latestData: null,
    result: null,
    resultPreview: null,
    errorType: status === "error" ? "validation" : null,
    errorMessage: status === "error" ? "bad arguments" : null,
    isDelegated: false,
    events: [],
  };
}

describe("withoutCorrectedFailures — a group is labelled by what the agent ended up doing", () => {
  it("drops a failed call the agent retried successfully (the live 'Couldn't ask' header)", () => {
    const refused = entry("a", "ask_person", "error");
    const asked = entry("b", "ask_person", "completed");
    expect(withoutCorrectedFailures([refused, asked])).toEqual([asked]);
  });

  it("drops it while the retry is still running too", () => {
    const refused = entry("a", "ask_person", "error");
    const asking = entry("b", "ask_person", "started");
    expect(withoutCorrectedFailures([refused, asking])).toEqual([asking]);
  });

  it("keeps a failure nothing corrected — the last word, or a different tool", () => {
    const ok = entry("a", "ask_person", "completed");
    const failedLast = entry("b", "ask_person", "error");
    expect(withoutCorrectedFailures([ok, failedLast])).toEqual([ok, failedLast]);

    const failedSearch = entry("c", "web_search", "error");
    const other = entry("d", "ask_person", "completed");
    expect(withoutCorrectedFailures([failedSearch, other])).toEqual([failedSearch, other]);
  });

  it("keeps a failure followed only by another failure", () => {
    const first = entry("a", "ask_person", "error");
    const second = entry("b", "ask_person", "error");
    expect(withoutCorrectedFailures([first, second])).toEqual([first, second]);
  });
});


describe("selectCorrectedToolCallIds — a reloaded turn, one group per iteration", () => {
  // The rows of the live 2026-09-26 check (conversation 49df6e0c-…): two
  // refused asks, then the ask that went through, all in one user request.
  const row = (id: string, status: string, startedAt: string, userRequestId = "ur-1") => ({
    id,
    callId: `call-${id}`,
    conversationId: "conv-1",
    userRequestId,
    toolName: "ask_person",
    status,
    startedAt,
    deletedAt: null,
  });
  const stateWith = (rows: ReturnType<typeof row>[]) =>
    ({
      observability: { toolCalls: Object.fromEntries(rows.map((r) => [r.id, r])) },
    }) as unknown as RootState;

  it("marks both refused calls as corrected once a later ask went through", () => {
    const ids = selectCorrectedToolCallIds("conv-1")(
      stateWith([
        row("a", "error", "2026-09-26T14:55:25Z"),
        row("b", "error", "2026-09-26T14:55:29Z"),
        row("c", "completed", "2026-09-26T14:55:33Z"),
      ]),
    );
    expect([...ids].sort()).toEqual(["call-a", "call-b"]);
  });

  it("never marks a failure that nothing later in the same request fixed", () => {
    const ids = selectCorrectedToolCallIds("conv-1")(
      stateWith([
        row("a", "completed", "2026-09-26T14:55:25Z"),
        row("b", "error", "2026-09-26T14:55:29Z"),
        row("c", "completed", "2026-09-26T14:56:00Z", "ur-2"),
      ]),
    );
    expect(ids.size).toBe(0);
  });
});
