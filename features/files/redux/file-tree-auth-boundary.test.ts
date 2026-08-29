import { hasMatchingFileTreeSession } from "./file-tree-auth-boundary";
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
});
