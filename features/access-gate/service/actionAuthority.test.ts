/**
 * The regression behind this file: site delete asked the gate's `status` for
 * authority, and after N2 that status is `denied` for every live record whose
 * read did not fault — so an admin deleting their own site was told "We
 * couldn't verify deletion access". Authority comes from existence + level.
 */
import { deriveStatus } from "./deriveStatus";
import { actionAuthority } from "./actionAuthority";
import type { AccessDeniedContext } from "@/features/access-gate/types";

function context(
  payload: Record<string, unknown>,
  level: AccessDeniedContext["level"],
): AccessDeniedContext {
  return {
    status: deriveStatus(payload, "full", "access-question"),
    level,
  } as AccessDeniedContext;
}

describe("actionAuthority", () => {
  it("verifies an admin on a live record whose read did not fault", () => {
    const admin = context({ exists: true, deleted: false, level: "admin" }, "admin");
    // The pre-fix check was `status !== "ok"` → refuse. This is why it refused.
    expect(admin.status).not.toBe("ok");
    expect(actionAuthority(admin)).toEqual({ verified: true, level: "admin" });
  });

  it("verifies a live record the caller cannot touch as level none", () => {
    expect(
      actionAuthority(context({ exists: true, deleted: false, level: "none" }, "none")),
    ).toEqual({ verified: true, level: "none" });
  });

  it("never verifies a deleted or missing record", () => {
    expect(
      actionAuthority(context({ exists: true, deleted: true, level: "admin" }, "admin")),
    ).toEqual({ verified: false });
    expect(actionAuthority(context({ exists: false }, "none"))).toEqual({
      verified: false,
    });
  });

  it("never verifies a resolver fault", () => {
    expect(actionAuthority(context({ unresolvable: true }, "admin"))).toEqual({
      verified: false,
    });
  });
});
