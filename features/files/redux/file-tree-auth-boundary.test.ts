import {
  hasMatchingFileTreeSession,
  runFileTreeSessionOperation,
} from "./file-tree-auth-boundary";
import { supabase } from "@/utils/supabase/client";

jest.mock("@/utils/supabase/client", () => ({
  supabase: { auth: { getSession: jest.fn() } },
}));

const getSession = jest.mocked(supabase.auth.getSession);

describe("file-tree auth boundary", () => {
  beforeEach(() => getSession.mockReset());

  test("refuses a server-seeded user when the browser is anonymous", async () => {
    getSession.mockResolvedValue({ data: { session: null }, error: null });
    await expect(hasMatchingFileTreeSession("user-1")).resolves.toBe(false);
  });

  test("refuses a browser session belonging to another user", async () => {
    getSession.mockResolvedValue({
      data: { session: { access_token: "token", user: { id: "user-2" } } },
      error: null,
    } as Awaited<ReturnType<typeof supabase.auth.getSession>>);
    await expect(hasMatchingFileTreeSession("user-1")).resolves.toBe(false);
  });

  test("admits only the matching authenticated session", async () => {
    getSession.mockResolvedValue({
      data: { session: { access_token: "token", user: { id: "user-1" } } },
      error: null,
    } as Awaited<ReturnType<typeof supabase.auth.getSession>>);
    await expect(hasMatchingFileTreeSession("user-1")).resolves.toBe(true);
  });

  test("retries once when the session re-resolves after RPC auth loss", async () => {
    getSession.mockResolvedValue({
      data: { session: { access_token: "token", user: { id: "user-1" } } },
      error: null,
    } as Awaited<ReturnType<typeof supabase.auth.getSession>>);
    const run = jest
      .fn()
      .mockResolvedValueOnce({
        data: null,
        error: {
          code: "42501",
          message: "permission denied for function get_user_file_tree",
        },
        status: 401,
      })
      .mockResolvedValueOnce({ data: [], error: null, status: 200 });

    await expect(runFileTreeSessionOperation(run)).resolves.toMatchObject({
      data: [],
      error: null,
    });
    expect(run).toHaveBeenCalledTimes(2);
  });

  test("turns an unrecoverable RPC auth race into a lifecycle pause", async () => {
    getSession
      .mockResolvedValueOnce({
        data: { session: { access_token: "stale", user: { id: "user-1" } } },
        error: null,
      } as Awaited<ReturnType<typeof supabase.auth.getSession>>)
      .mockResolvedValueOnce({ data: { session: null }, error: null });
    const run = jest.fn().mockResolvedValue({
      data: null,
      error: {
        code: "42501",
        message: "permission denied for function get_user_file_tree",
      },
      status: 401,
    });

    await expect(runFileTreeSessionOperation(run)).rejects.toMatchObject({
      name: "SessionUnavailableError",
      code: "PGRST301",
    });
    expect(run).toHaveBeenCalledTimes(1);
  });
});
