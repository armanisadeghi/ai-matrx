import { listMyPendingAssists } from "./service";
import { SessionUnavailableError } from "@/lib/supabase/authRetry";
import { createClient, supabase } from "@/utils/supabase/client";

jest.mock("@/utils/supabase/client", () => ({
  createClient: jest.fn(),
  supabase: {
    auth: { getSession: jest.fn() },
  },
}));

describe("listMyPendingAssists authenticated boundary", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    jest.mocked(supabase.auth.getSession).mockResolvedValue({
      data: { session: { access_token: "authenticated-token" } },
      error: null,
    } as never);
  });

  it("re-resolves the session and retries one anonymous RPC failure", async () => {
    let calls = 0;
    const rpc = jest.fn(async () => {
      calls += 1;
      if (calls === 1) {
        return {
          data: null,
          error: {
            code: "42501",
            message:
              "permission denied for function list_my_presentable_assists",
          },
          status: 401,
        };
      }
      return { data: [], error: null, status: 200 };
    });
    const schema = jest.fn(() => ({ rpc }));
    jest.mocked(createClient).mockReturnValue({ schema } as never);

    await expect(listMyPendingAssists("user-1")).resolves.toEqual([]);

    expect(schema).toHaveBeenCalledWith("platform");
    expect(rpc).toHaveBeenCalledTimes(2);
    expect(supabase.auth.getSession).toHaveBeenCalledTimes(2);
  });

  it("preserves an unrecoverable expired-JWT result as a lifecycle pause", async () => {
    const rpc = jest.fn(async () => ({
      data: null,
      error: { code: "PGRST301", message: "JWT expired" },
      status: 401,
    }));
    jest.mocked(createClient).mockReturnValue({
      schema: () => ({ rpc }),
    } as never);

    await expect(listMyPendingAssists("user-1")).rejects.toBeInstanceOf(
      SessionUnavailableError,
    );
    expect(rpc).toHaveBeenCalledTimes(2);
  });
});
