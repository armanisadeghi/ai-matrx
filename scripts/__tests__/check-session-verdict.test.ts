/**
 * @jest-environment node
 *
 * THE SESSION-VERDICT FORCING FUNCTION. Runs the guard over the REAL tree:
 * any render file that reads getServerAuth() without its third state
 * ("could not verify") fails this test by name. Before lane SESSION-VERDICT
 * (2026-09-24) it failed on 157 files; it passes only once every screen reads
 * the verdict through utils/supabase/sessionVerdict.ts.
 */
import { auditSessionVerdict, readRepoFiles } from "@/scripts/check-session-verdict";
import { sessionVerdictFrom, verifyingHref } from "@/utils/supabase/sessionVerdict";

describe("check-session-verdict", () => {
  it("no render file treats 'could not verify' as 'not signed in'", () => {
    const findings = auditSessionVerdict(readRepoFiles()).map((f) => f.where);
    expect(findings).toEqual([]);
  });

  it("fires on the V17-FIX shape and stays quiet on the helper", () => {
    expect(
      auditSessionVerdict({
        "app/(meet)/meet/[slug]/page.tsx":
          "const { isAuthenticated } = await getServerAuth(); return <S a={isAuthenticated} />;",
      }),
    ).toHaveLength(1);
    expect(
      auditSessionVerdict({
        "app/(meet)/meet/[slug]/page.tsx":
          "const { isAuthenticated } = await getSessionVerdict(); return <S a={isAuthenticated} />;",
      }),
    ).toHaveLength(0);
  });
});

describe("sessionVerdictFrom", () => {
  const user = { id: "u1", app_metadata: {}, user_metadata: {} } as never;
  it("keeps the three states apart", () => {
    expect(sessionVerdictFrom({ user, authUnavailable: false }).state).toBe("signed_in");
    expect(sessionVerdictFrom({ user: null, authUnavailable: false }).state).toBe("signed_out");
    expect(sessionVerdictFrom({ user: null, authUnavailable: true }).state).toBe("unverified");
  });
  it("sends the hold back to the same page, never off-site", () => {
    expect(verifyingHref("/meet/abc", "?x=1")).toBe(
      `/auth/verifying?next=${encodeURIComponent("/meet/abc?x=1")}`,
    );
    expect(verifyingHref("//evil.example", "")).toBe(`/auth/verifying?next=${encodeURIComponent("/")}`);
  });
});
