// 🚨 D7 — A SHARED RECORD LINK IS A CLOSED DOOR, NOT A BROKEN RECORD.
//
// `/detail/<type>/<id>` is the shape a record link takes when it is shared.
// It was missing from `routeRequiresAuthentication`, so a signed-out visitor
// following one got the app shell, an invented title and a load failure
// (VERIFY-U-P1, D7) — the record read as broken. Stopping the route sends them
// through the ONE login primitive, which keeps the record as their destination
// (utils/auth/FEATURE.md).

import { routeRequiresAuthentication } from "../protected-routes";

describe("routeRequiresAuthentication", () => {
  it("stops a guest on a shared detail deep link", () => {
    expect(routeRequiresAuthentication("/detail/file/11111111-2222-3333-4444-555555555555")).toBe(
      true,
    );
    expect(routeRequiresAuthentication("/detail/task/abc")).toBe(true);
    // The primitive's own surface, and the bare path, are the same door.
    expect(routeRequiresAuthentication("/detail")).toBe(true);
  });

  it("does not swallow unrelated paths that merely start with the letters", () => {
    expect(routeRequiresAuthentication("/details")).toBe(false);
    expect(routeRequiresAuthentication("/p/detail")).toBe(false);
  });

  it("still stops the families it always did", () => {
    expect(routeRequiresAuthentication("/chat")).toBe(true);
    expect(routeRequiresAuthentication("/administration/reporting")).toBe(true);
    expect(routeRequiresAuthentication("/")).toBe(false);
  });
});
