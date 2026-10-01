/**
 * ONLY A DECLARED DEFINITION IS DESCRIBED, NEVER A RAW FACT TOKEN (lane DRILL-D1; VERIFY-DRILL-FINAL
 * "Deployed re-verify" D2).
 *
 * Production, 2026-10-01: /workflows/runs/analyze?w=all logged a 403 from drillDescribe — "The system
 * table "workflow_run_facts" is not offered for drilling by inference". The records' noun described
 * `records.fact` whenever it differed from the definition's KEY; workflow_runs' records are its own
 * fact (`workflow_run_facts`), so its own rows were described as a table. Usage's records
 * (`ai_usage_executions`) are a sibling definition's rows and read the grain the explorer already
 * described for that sibling; the records' noun itself describes nothing.
 */
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";

jest.mock("@/utils/supabase/client", () => ({ supabase: {} }));
jest.mock("@/components/navigation/AppLink", () => ({ __esModule: true, default: ({ children }: { children: unknown }) => <a>{children as never}</a> }));

import { useRecordsNoun } from "../DrillRecords";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const EXECUTIONS = { token: "ai_usage_executions", group: "Executions", go: () => {}, source: { kind: "entity" as const, token: "ai_usage_executions" }, def: { grain: "one row per execution of the AI usage ledger" } as never };
function Probe({ def, fact, offered = [] }: { def: Record<string, unknown>; fact: string; offered?: string[] }) {
  const noun = useRecordsNoun(def as never, { fact, columns: ["created_at"] }, { offered, described: offered.length > 0 ? [EXECUTIONS] : [] });
  return <i data-noun={noun ?? ""} />;
}
const nounShown = () => document.querySelector("[data-noun]")?.getAttribute("data-noun") || null;

describe("the records' noun", () => {
  let host: HTMLDivElement;
  let root: Root;
  beforeEach(() => {
    host = document.createElement("div");
    document.body.appendChild(host);
    root = createRoot(host);
  });
  afterEach(() => {
    act(() => root.unmount());
    host.remove();
  });

  it("workflow runs: records over the definition's own fact take its own grain, and the hook takes no client to describe with", async () => {
    const def = { key: "workflow_runs", fact: "workflow_run_facts", mode: "definer", grain: "one row per workflow run (archived runs are not counted)" };
    await act(async () => root.render(<Probe def={def} fact="workflow_run_facts" />));
    await act(async () => {});
    expect(nounShown()).toBe("workflow run");
  });

  it("AI usage: records that are another declared definition's rows read that definition's grain", async () => {
    const def = { key: "ai_usage", fact: "ai_usage_hourly", mode: "definer", grain: "one row per hour of the AI usage ledger" };
    await act(async () => root.render(<Probe def={def} fact="ai_usage_executions" offered={["ai_calls", "ai_usage_executions"]} />));
    await act(async () => {});
    expect(nounShown()).toBe("execution");
  });
});
