import { validateHrBrowserSession } from "../../service";
import { supabase } from "@/utils/supabase/client";

jest.mock("@/utils/supabase/client", () => ({
  supabase: { auth: { getSession: jest.fn(), getUser: jest.fn() } },
}));

const getSession = jest.mocked(supabase.auth.getSession);
const getUser = jest.mocked(supabase.auth.getUser);

describe("validateHrBrowserSession", () => {
  beforeEach(() => {
    getSession.mockReset();
    getUser.mockReset();
  });

  it("refuses before any HR RPC when the browser has no session", async () => {
    getSession.mockResolvedValue({ data: { session: null } });

    await expect(validateHrBrowserSession()).resolves.toMatchObject({
      ok: false,
      kind: "denied",
      reason: "no_authenticated_session",
    });
    expect(getUser).not.toHaveBeenCalled();
  });

  it("refuses a locally cached session that server validation rejects", async () => {
    getSession.mockResolvedValue({
      data: { session: { access_token: "expired" } },
    });
    getUser.mockResolvedValue({
      data: { user: null },
      error: { name: "AuthSessionMissingError" },
    });

    await expect(validateHrBrowserSession()).resolves.toMatchObject({
      ok: false,
      kind: "denied",
      reason: "no_authenticated_session",
    });
  });

  it("opens the HR context boundary only for a server-validated user", async () => {
    getSession.mockResolvedValue({
      data: { session: { access_token: "valid" } },
    });
    getUser.mockResolvedValue({ data: { user: { id: "user-1" } }, error: null });

    await expect(validateHrBrowserSession()).resolves.toEqual({
      ok: true,
      data: true,
    });
  });
});
