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

  it("copies the persisted task organization into the run insert", async () => {
    const single = jest.fn().mockResolvedValue({
      data: { id: "44444444-4444-4444-8444-444444444444" },
      error: null,
    });
    const select = jest.fn().mockReturnValue({ single });
    const insert = jest.fn().mockReturnValue({ select });
    const from = jest.fn().mockReturnValue({ insert });
    const schema = jest.fn().mockReturnValue({ from });
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
    });

    expect(insert).toHaveBeenCalledWith(
      expect.objectContaining({
        task_id: TASK_ID,
        user_id: USER_ID,
        organization_id: ORGANIZATION_ID,
      }),
    );
  });
});
