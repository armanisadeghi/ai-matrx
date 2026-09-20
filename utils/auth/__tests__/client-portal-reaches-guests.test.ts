// 🚨 A CLIENT FOLLOWING HER SUPPLIER'S PORTAL LINK IS A GUEST, AND MUST ARRIVE.
//
// `/portal/**` is guest-blocked for the departed-member portal, where consent to
// disclose your own income needs a signed-in subject. The CLIENT portal shares the
// prefix and has the opposite requirement: `/portal/c/<slug>` is a link a business
// sends to somebody with no AI Matrx account, and its signed-out state IS the
// product — the portal's title, the organization's name, one email field. Before
// this exception the route bounced her to `/login`, a door she cannot open.
//
// The departed-member block must stay exactly as it was, which is why both halves
// are asserted here: an exception that widened to `/portal/` would open a surface
// that must never render for a guest.

import { routeRequiresAuthentication } from "../protected-routes";

describe("routeRequiresAuthentication — the client portal", () => {
  it("lets a guest reach a client portal link", () => {
    expect(routeRequiresAuthentication("/portal/c/all-green-client-portal")).toBe(false);
    expect(
      routeRequiresAuthentication(
        "/portal/c/all-green-client-portal/r/98c17789-a650-408e-a852-3fbe993cdc90",
      ),
    ).toBe(false);
    expect(routeRequiresAuthentication("/portal/c")).toBe(false);
  });

  it("still stops a guest at the departed-member portal", () => {
    expect(routeRequiresAuthentication("/portal")).toBe(true);
    expect(routeRequiresAuthentication("/portal/")).toBe(true);
    expect(
      routeRequiresAuthentication("/portal/4352d061-ec13-4761-ae32-9c9bd52e7de3"),
    ).toBe(true);
  });

  it("does not open a path that merely starts with the same letters", () => {
    expect(routeRequiresAuthentication("/portal/customers")).toBe(true);
    expect(routeRequiresAuthentication("/portal/companies/acme")).toBe(true);
  });
});
