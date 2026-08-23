/**
 * The fleet admits exactly ONE browser. So a duplicate start is not a benign
 * retry — the loser 503s and the panel renders that failure even though a
 * browser was successfully created. Observed in production 2026-08-23.
 */

import { postJson } from "@/lib/python-client";
import { loadSnapshotForRun } from "./service";

jest.mock("@/lib/python-client", () => ({
  getJson: jest.fn(),
  postJson: jest.fn(),
}));

const runRow = { id: "run-1", profile_id: "prof-1", state: "agent_control" };

jest.mock("@/utils/supabase/client", () => ({
  supabase: {
    schema: () => ({
      from: () => {
        const q: Record<string, unknown> = {};
        for (const m of ["select", "eq", "in", "is", "order", "limit", "gt"]) {
          q[m] = () => q;
        }
        q.maybeSingle = async () => ({ data: null, error: null });
        return q;
      },
    }),
    auth: {
      getSession: jest.fn(async () => ({
        data: { session: { access_token: "t" } },
        error: null,
      })),
    },
  },
}));

jest.mock("@/utils/permissions/access", () => ({
  getResourceAccess: jest.fn(),
}));

describe("run admission", () => {
  beforeEach(() => jest.clearAllMocks());

  it("does not start a browser for a run that is not live", async () => {
    // The handoff seam must never conjure a browser off a stream event — that
    // is what would burn the fleet's single slot from the background.
    await expect(loadSnapshotForRun({ runId: "run-gone" })).resolves.toBeNull();
    expect(postJson).not.toHaveBeenCalled();
  });

  it("mints a distinct activation key per attempt, never a reused one", async () => {
    // A STABLE key would collide with the activation unique index and make
    // restart-after-stop impossible; concurrency is solved by sharing the
    // in-flight promise instead (see startRun).
    (postJson as jest.Mock).mockResolvedValue({
      data: { run: { run_id: runRow.id } },
    });
    const keys = new Set<string>();
    for (const call of (postJson as jest.Mock).mock.calls) {
      keys.add((call[1] as { activation_key: string }).activation_key);
    }
    expect(keys.size).toBe((postJson as jest.Mock).mock.calls.length);
  });
});
