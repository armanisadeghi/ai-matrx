const rpc = jest.fn();
const getSession = jest.fn();

jest.mock("@/utils/supabase/client", () => ({
  supabase: {
    rpc: (...args: unknown[]) => rpc(...args),
    auth: { getSession: (...args: unknown[]) => getSession(...args) },
  },
}));

import type { AppDispatch, RootState } from "@/lib/redux/store";
import { fetchAgentAccessLevel } from "../thunks";

describe("fetchAgentAccessLevel session boundary", () => {
  beforeEach(() => {
    rpc.mockReset();
    getSession.mockReset();
  });

  it("retries once after an authenticated-only RPC briefly runs as anon", async () => {
    const agentId = "8915269d-1e02-4513-848f-ae3fb5a35c79";
    rpc
      .mockResolvedValueOnce({
        data: null,
        error: {
          code: "42501",
          message: "permission denied for function agx_get_access_level",
        },
        status: 401,
      })
      .mockResolvedValueOnce({
        data: [
          {
            agent_id: agentId,
            agent_name: "Owned agent",
            owner_id: "0d7ac05d-b9dc-44c4-854e-aa0af12b41c9",
            owner_email: "owner@example.com",
            access_level: "owner",
            is_owner: true,
          },
        ],
        error: null,
        status: 200,
      });
    getSession.mockResolvedValue({
      data: { session: { access_token: "restored" } },
      error: null,
    });
    const dispatch = jest.fn() as unknown as AppDispatch;
    const getState = (() => ({})) as () => RootState;
    const consoleError = jest
      .spyOn(console, "error")
      .mockImplementation(() => undefined);

    const result = await fetchAgentAccessLevel(agentId)(
      dispatch,
      getState,
      undefined,
    );

    expect(result.meta.requestStatus).toBe("fulfilled");
    expect(rpc).toHaveBeenCalledTimes(2);
    expect(getSession).toHaveBeenCalledTimes(1);
    expect(consoleError).toHaveBeenCalledWith(
      expect.stringContaining("session re-resolved"),
    );
    consoleError.mockRestore();
  });
});
