/**
 * @jest-environment node
 */
/**
 * 🚨 COULD NOT VERIFY IS NOT SIGNED OUT; AN EMPTY SERVER READ IS RE-ASKED BY THE BROWSER.
 * 2026-10-07: older `/chat/<id>` conversations showed "We can't tell you anything about it until
 * we know who you are" to their signed-in owner. The SSR read had gone out as `anon` (the
 * server's identity budget dropped an expired session — reproduced: a 3s token refresh turns
 * the owner's read into `42501 permission denied`), and the gate turned the browser's
 * could-not-verify into `anonymous`.
 */

let claims: { data: { user: { id: string } | null }; error: Error | null } = {
  data: { user: null },
  error: null,
};
const rpc = jest.fn(async () => ({ data: { disclosure: "full" }, error: null }));
jest.mock("@/utils/supabase/client", () => ({ createClient: () => ({ rpc }) }));
jest.mock("@/utils/supabase/claimsUser", () => ({ getClaimsUser: async () => claims }));
jest.mock("@/lib/organizations/fetchWithOrganization", () => ({ fetchWithOrganization: jest.fn() }));

import { fetchAccessDeniedContext } from "./accessDeniedContext";
import { decideServerReadRecheck } from "./serverReadRecheck";

const ID = "b6865b1b-fc56-4f58-af87-52b00ece6faa";

describe("the access gate when identity could not be verified", () => {
  beforeEach(() => {
    rpc.mockClear();
    jest.spyOn(console, "error").mockImplementation(() => {});
  });

  it("is a retry-able error, never the sign-in answer", async () => {
    const err = Object.assign(new Error("Invalid Refresh Token: Already Used"), {
      name: "AuthApiError",
      status: 400,
    });
    claims = { data: { user: null }, error: err };
    const got = await fetchAccessDeniedContext("conversation", ID);
    expect(got.status).not.toBe("anonymous");
    expect(got.status).toBe("error");
  });

  it("a confirmed signed-out visitor is still asked to sign in", async () => {
    claims = { data: { user: null }, error: null };
    const got = await fetchAccessDeniedContext("conversation", ID);
    expect(got.status).toBe("anonymous");
  });
});

describe("the browser re-read after an empty server read", () => {
  it("re-renders when the browser can read the row", () => {
    expect(
      decideServerReadRecheck({ signedIn: true, rowReadable: true, alreadyRefreshed: false }),
    ).toBe("refresh");
  });

  it("shows the gate when the browser cannot read it, or already re-rendered once", () => {
    expect(
      decideServerReadRecheck({ signedIn: true, rowReadable: false, alreadyRefreshed: false }),
    ).toBe("gate");
    expect(
      decideServerReadRecheck({ signedIn: false, rowReadable: false, alreadyRefreshed: false }),
    ).toBe("gate");
    expect(
      decideServerReadRecheck({ signedIn: true, rowReadable: true, alreadyRefreshed: true }),
    ).toBe("gate");
  });
});
