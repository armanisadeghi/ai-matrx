/**
 * The gate's status ordering — the one decision every access surface branches
 * on, and the one place a wrong answer becomes a lie told to a user.
 *
 * The regression that produced this file: `level` was tested before `deleted`,
 * so an ADMIN opening a DELETED record was told "You do have access to it —
 * something went wrong on our side. Try again." Retrying could never work; the
 * record was gone. It hid because the two commonest cases both answer
 * correctly — an admin on a live row is genuinely `ok`, a stranger on a
 * deleted row has no level to short-circuit on.
 */
import { deriveStatus } from "./deriveStatus";

describe("deriveStatus", () => {
  it("reports a deleted record as deleted even when the caller is an admin", () => {
    // The exact live payload for a soft-deleted web.site owned by the caller.
    expect(
      deriveStatus({ exists: true, deleted: true, level: "admin" }, "full"),
    ).toBe("deleted");
  });

  it("still reports deleted for a caller with no access at all", () => {
    expect(
      deriveStatus({ exists: true, deleted: true, level: "none" }, "full"),
    ).toBe("deleted");
  });

  it("calls a live record the caller can reach `ok`, not a denial", () => {
    // A surface only asks after a read failed. With real access to a live
    // record, that failure was transient — a denial screen here is its own lie.
    expect(
      deriveStatus({ exists: true, deleted: false, level: "view" }, "full"),
    ).toBe("ok");
  });

  it("denies a live record the caller cannot reach", () => {
    expect(
      deriveStatus({ exists: true, deleted: false, level: "none" }, "full"),
    ).toBe("denied");
  });

  it("reports a row that never existed as missing, not deleted", () => {
    expect(
      deriveStatus({ exists: false, deleted: false, level: "none" }, "full"),
    ).toBe("missing");
  });

  it("never blames the user's data for our own registry bug", () => {
    // An unregistered token is a bug in the CALLING surface. Reporting it as
    // "missing" would tell someone their data is gone because we misconfigured
    // a registry.
    expect(deriveStatus({ unresolvable: true, exists: false }, "full")).toBe(
      "error",
    );
  });

  it("answers anonymous before anything it cannot know", () => {
    expect(
      deriveStatus({ exists: null, deleted: null, level: "none" }, "anonymous"),
    ).toBe("anonymous");
  });
});
