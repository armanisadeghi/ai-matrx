import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/types/database.types";
import { schedulerDb } from "@/utils/supabase/schedulerDb";
import { claimTask } from "./claim";

jest.mock("@/utils/supabase/schedulerDb", () => ({
  schedulerDb: jest.fn(),
}));

const ORGANIZATION_ID = "33333333-3333-4333-8333-333333333333";
const USER_ID = "22222222-2222-4222-8222-222222222222";
const TASK_ID = "11111111-1111-4111-8111-111111111111";

function testClient(): SupabaseClient<Database> {
  return {} as SupabaseClient<Database>;
}

describe("scheduler claim organization provenance", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it("refuses an invalid task organization before constructing a database query", async () => {
    const task = {
      id: TASK_ID,
      user_id: USER_ID,
      organization_id: "",
      next_due_at: null,
    };

    await expect(
      claimTask(testClient(), {
        task,
        surface: "web",
        instanceId: "instance-1",
      }),
    ).rejects.toThrow("task has no valid organization_id");
    expect(schedulerDb).not.toHaveBeenCalled();
  });

  /**
   * 🚨 THIS ASSERTION CHANGED ON 2026-09-21 (SECURITY-SWEEP) AND IT GOT STRONGER.
   * It used to check that the client COPIED the task's organization into a direct INSERT —
   * an insert that also carried a `claim_token` the browser minted with `crypto.randomUUID()`.
   * Holding a run's claim token IS holding the run (`completeRun`, `failRun` and
   * `markRunRunning` all gate their UPDATE on it), so a client that chose the token could
   * write one it already knew onto somebody else's run. The claim now goes through
   * `scheduler.sch_run_claim`, which mints the token and reads `organization_id`, `user_id`,
   * `due_at` and `queue` off the PERSISTED task — so the right assertion is that the client
   * sends NONE of them.
   */
  it("claims through the door and sends no organization, no user and no token", async () => {
    const single = jest.fn().mockResolvedValue({
      data: { id: "44444444-4444-4444-8444-444444444444" },
      error: null,
    });
    const rpc = jest.fn().mockReturnValue({ single });
    const schema = jest.fn().mockReturnValue({ rpc });
    jest.mocked(schedulerDb).mockReturnValue({ schema } as never);

    await claimTask(testClient(), {
      task: {
        id: TASK_ID,
        user_id: USER_ID,
        organization_id: ORGANIZATION_ID,
        next_due_at: null,
      },
      surface: "web",
      instanceId: "instance-1",
      leaseSeconds: 600,
    });

    expect(rpc).toHaveBeenCalledWith("sch_run_claim", {
      p_task_id: TASK_ID,
      p_surface: "web",
      p_trigger_id: null,
      p_queue: null,
      p_lease_seconds: 600,
    });
    const args = rpc.mock.calls[0][1] as Record<string, unknown>;
    expect(args).not.toHaveProperty("claim_token");
    expect(args).not.toHaveProperty("p_organization_id");
    expect(args).not.toHaveProperty("p_user_id");
  });
});
