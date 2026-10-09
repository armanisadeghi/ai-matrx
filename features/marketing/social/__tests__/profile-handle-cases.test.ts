/**
 * The ONE profile-link rule, pinned by the case table aidream's matrx-social runs too
 * (packages/matrx-social/tests/fixtures/profile_handle_cases.json — identical file).
 * The server backfills and writes `web.property.handle` with the Python twin; this keeps them equal.
 */
import cases from "./profile_handle_cases.json";
import { classifySocialLink } from "../link";

type Case = [string, string | null, string | null, boolean];

describe("profile handle case table (shared with matrx-social)", () => {
  it.each(cases.cases as Case[])("%s", (url, platform, handle) => {
    const link = classifySocialLink(url);
    const profile = link && link.kind === "profile" ? link : null;
    if (platform === null) {
      expect(profile).toBeNull();
    } else {
      expect(profile?.platform).toBe(platform);
      expect(profile?.handle).toBe(handle);
    }
  });
});
