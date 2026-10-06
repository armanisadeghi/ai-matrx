/**
 * R53 rebuild mode's "baseline" step (today's version answers every proof case) has its
 * own label and row; a build that is not a rebuild never shows it.
 */
jest.mock("@/utils/supabase/client", () => ({ createClient: () => ({}), supabase: {} }));

import { buildRows } from "../components/FactoryBuildPage";
import { STEP_LABEL, type FactoryBuildDetail } from "../types";

function detail(state: FactoryBuildDetail["state"], spineStatus = "running"): FactoryBuildDetail {
  return { id: "b-1", spineStatus, createdAt: "2026-10-05T10:00:00Z", startedAt: null, endedAt: null, checkpointAt: null, state };
}

describe("the baseline step", () => {
  it("has a label", () => {
    expect(STEP_LABEL.baseline).toBe("Baseline");
  });

  it("is a running row while a rebuild's baseline runs, then done", () => {
    const running = buildRows(
      detail({ current_step: "baseline", facts: { greenfield: true } as never, request: { rebuild_of: "a-1" }, rebuild: { agent_id: "a-1", baselined: false } }),
    );
    expect(running.find((r) => r.step === "baseline")?.status).toBe("running");
    const done = buildRows(
      detail({ current_step: "goal", facts: { greenfield: true } as never, request: { rebuild_of: "a-1" }, rebuild: { agent_id: "a-1", baselined: true } }),
    );
    expect(done.filter((r) => r.step === "baseline").map((r) => r.status)).toEqual(["done"]);
  });

  it("never appears on a build that is not a rebuild", () => {
    const rows = buildRows(detail({ current_step: "intake" }));
    expect(rows.some((r) => r.step === "baseline")).toBe(false);
  });
});
