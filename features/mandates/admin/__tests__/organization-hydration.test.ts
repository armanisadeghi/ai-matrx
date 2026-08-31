import { readFileSync } from "node:fs";
import { join } from "node:path";

const source = readFileSync(join(__dirname, "../MandatesConsole.tsx"), "utf8");

/**
 * THE ORGANIZATION HYDRATION BOUNDARY on the mandates console.
 *
 * This guard was written to pin the first half of the rule — do not fetch
 * before the organization is known — and it pinned it as an exact source
 * string, including a bare `if (!selectedOrganizationId) return;`.
 *
 * 🚨 That is only half the rule, and the missing half is a real defect an
 * independent walk measured on production (2026-08-31): the console
 * intermittently sticks in its loading skeleton and recovers later. `loading`
 * starts `true`, so a bare early return leaves the skeleton up for as long as
 * the organization has not hydrated — and if the bootstrap resolves with NO
 * organization selected, forever, with no reason on screen. It is the third
 * instance of the class already fixed in `useMandateInputSurface` and in the
 * two readers V3 F4 caught: **"no org yet" is not "still reading."**
 *
 * So this guard now pins BOTH halves. It deliberately does not pin the import
 * as one exact line — that is formatting, not behaviour, and pinning it made a
 * correct fix look like a regression.
 */
describe("MandatesConsole organization hydration boundary", () => {
  it("reads the organization from the app-context authority the transport uses", () => {
    expect(source).toMatch(/selectOrganizationId[\s\S]{0,120}appContextSlice/);
    expect(source).toContain(
      "const selectedOrganizationId = useAppSelector(selectOrganizationId);",
    );
  });

  it("waits for explicit organization context and refetches when it changes", () => {
    expect(source).toMatch(
      /useEffect\(\(\) => \{[\s\S]*?if \(!selectedOrganizationId\) \{[\s\S]*?fetchData\(\);[\s\S]*?\}, \[fetchData, orgBootstrapResolved, selectedOrganizationId\]\);/,
    );
  });

  it("settles instead of loading forever once the bootstrap says there is no organization", () => {
    // The whole point: the skeleton must STOP, and it must not stop silently.
    expect(source).toContain("selectOrgBootstrapResolved");
    expect(source).toMatch(
      /if \(orgBootstrapResolved\) \{[\s\S]*?setLoading\(false\);[\s\S]*?setNoOrganization\(/,
    );
    // …and the settled fact reaches the screen with its remedy.
    expect(source).toContain("No organization is selected");
    expect(source).toContain("{noOrganization}");
  });
});
