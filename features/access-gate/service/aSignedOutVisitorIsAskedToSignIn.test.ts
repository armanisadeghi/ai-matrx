/**
 * @jest-environment node
 */
/**
 * 🚨 A SIGNED-OUT VISITOR IS ASKED TO SIGN IN, NEVER TOLD "SOMETHING WENT WRONG".
 * `public.access_denied_context` is closed to `anon` on purpose; asking it signed out failed, and
 * the gate read "We couldn't work out what happened" on every public-lane page whose record was
 * not published (found verifying access ladder T-40 on /p/e/record/<id>). The honest answer is
 * the stranger's: status `anonymous`, without asking.
 */

let signedIn = false;
const rpc = jest.fn(async () => ({ data: { disclosure: "full" }, error: null }));
jest.mock("@/utils/supabase/client", () => ({ createClient: () => ({ rpc }) }));
jest.mock("@/utils/supabase/claimsUser", () => ({
  getClaimsUser: async () => ({ data: { user: signedIn ? { id: "u" } : null }, error: null }),
}));
jest.mock("@/lib/organizations/fetchWithOrganization", () => ({ fetchWithOrganization: jest.fn() }));

import { fetchAccessDeniedContext } from "./accessDeniedContext";

const ID = "6a1d0c2b-3e4f-4a5b-9c6d-7e8f9a0b1c2d";

describe("the access gate for a signed-out visitor", () => {
  beforeEach(() => rpc.mockClear());

  it("answers anonymous and never asks the closed resolver", async () => {
    signedIn = false;
    const got = await fetchAccessDeniedContext("record", ID);
    expect(got.status).toBe("anonymous");
    expect(rpc).not.toHaveBeenCalled();
  });

  it("a signed-in person still asks the resolver", async () => {
    signedIn = true;
    await fetchAccessDeniedContext("record", ID);
    expect(rpc).toHaveBeenCalledWith("access_denied_context", { p_type: "record", p_id: ID });
  });
});
