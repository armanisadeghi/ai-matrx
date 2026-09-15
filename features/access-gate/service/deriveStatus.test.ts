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
      deriveStatus({ exists: true, deleted: true, level: "admin" }, "full", "access-question"),
    ).toBe("deleted");
  });

  it("still reports deleted for a caller with no access at all", () => {
    expect(
      deriveStatus({ exists: true, deleted: true, level: "none" }, "full", "access-question"),
    ).toBe("deleted");
  });

  it("calls a live record the caller can reach `ok` when the read FAULTED", () => {
    // A surface only asks after a read failed. When that read failed as a
    // fault and the caller has real access to a live record, the failure was
    // transient — a denial screen here is its own lie.
    expect(
      deriveStatus({ exists: true, deleted: false, level: "view" }, "full", "fault"),
    ).toBe("ok");
  });

  it("denies a live record the caller cannot reach", () => {
    expect(
      deriveStatus({ exists: true, deleted: false, level: "none" }, "full", "access-question"),
    ).toBe("denied");
  });

  it("reports a row that never existed as missing, not deleted", () => {
    expect(
      deriveStatus({ exists: false, deleted: false, level: "none" }, "full", "access-question"),
    ).toBe("missing");
  });

  it("never blames the user's data for our own registry bug", () => {
    // An unregistered token is a bug in the CALLING surface. Reporting it as
    // "missing" would tell someone their data is gone because we misconfigured
    // a registry.
    expect(deriveStatus({ unresolvable: true, exists: false }, "full", "access-question")).toBe(
      "error",
    );
  });

  it("answers anonymous before anything it cannot know", () => {
    expect(
      deriveStatus({ exists: null, deleted: null, level: "none" }, "anonymous", "access-question"),
    ).toBe("anonymous");
  });

  it("never claims access on a read that simply came back empty", () => {
    /*
      V-XT-2/N2, on production 2026-09-15. `admin@admin.com` opened
      /work/conversations/9e015853-… — a conversation owned by another account.
      The page's own read returned nothing, the server's reply door answered
      `404 conversation_not_found`, and the screen said:

        "We couldn't load this conversation — You do have access to it —
         something went wrong on our side. Try again."

      `access_denied_context` promotes every platform admin to `level: 'admin'`
      (the `platform_admin_all` RLS policy normally lets them read the row), and
      the gate resolved the disagreement in favour of that claim — inventing
      both a fault on our side and a retry that could never succeed.

      A read that came back EMPTY is itself an access answer. It outranks the
      claim.
    */
    expect(
      deriveStatus(
        { exists: true, deleted: false, level: "admin" },
        "full",
        "access-question",
      ),
    ).toBe("denied");
  });
});
