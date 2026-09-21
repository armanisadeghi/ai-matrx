/**
 * Sign-in timezone capture — the three properties that keep a best-effort fact
 * from becoming a user-facing event.
 *
 * WHY THIS EXISTS. 749 of 766 people on the platform have no timezone anywhere,
 * so the SMS send gate judges their quiet hours in UTC and holds texts back in
 * the middle of their afternoon. Sign-in is where the browser finally tells us.
 * Everything about that capture is subordinate to sign-in itself:
 *
 *  1. ONCE per browser session per user. `onAuthStateChange` fires SIGNED_IN
 *     more than once in a session (token refresh, cross-tab cookie rotation,
 *     USER_UPDATED), and a POST per event is a write amplifier on a table this
 *     route can reach with the service-role client.
 *  2. A REJECTED POST NEVER ESCAPES. It runs inside the auth handler; a
 *     rejection out of it is an unhandled rejection on the sign-in path.
 *  3. NO ORGANIZATION → NO REQUEST. `fetchWithOrganization` answers the route's
 *     `organization_required` refusal by OPENING THE ORG PICKER. A modal nobody
 *     asked for, on top of a fresh sign-in, for a question never posed, is
 *     worse than not knowing the timezone.
 *
 * All three fail against the pre-change tree: `captureBrowserTimezoneOnce` did
 * not exist.
 */

const fetchWithOrganization = jest.fn();
const getActiveOrgId = jest.fn();

jest.mock("@/lib/organizations/fetchWithOrganization", () => ({
  fetchWithOrganization: (...args: unknown[]) => fetchWithOrganization(...args),
}));
jest.mock("@/lib/organizations/activeOrg", () => ({
  getActiveOrgId: () => getActiveOrgId(),
}));

import {
  captureBrowserTimezoneOnce,
  resetBrowserTimezoneCapture,
} from "./AuthSessionWatcher";

const USER = "11111111-1111-4111-8111-111111111111";

describe("captureBrowserTimezoneOnce", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    resetBrowserTimezoneCapture();
    sessionStorage.clear();
    getActiveOrgId.mockReturnValue("5dc930e9-bd65-44a1-8369-af773f6e1a5b");
    // jsdom has no `Response`; the capture never reads the body anyway.
    fetchWithOrganization.mockResolvedValue({ ok: true, status: 200 });
  });

  it("ONCE: two SIGNED_IN events in the same session send exactly one POST", async () => {
    await captureBrowserTimezoneOnce(USER);
    await captureBrowserTimezoneOnce(USER);

    expect(fetchWithOrganization).toHaveBeenCalledTimes(1);
    const [url, init] = fetchWithOrganization.mock.calls[0];
    expect(url).toBe("/api/person/timezone");
    expect(init.method).toBe("POST");
    const body = JSON.parse(init.body as string);
    expect(body.source).toBe("sign_in");
    expect(body.timezone).toBe(Intl.DateTimeFormat().resolvedOptions().timeZone);
  });

  it("ONCE ACROSS RELOADS: a new tab-level state still sees the sessionStorage claim", async () => {
    await captureBrowserTimezoneOnce(USER);
    // A reload drops module state but not sessionStorage.
    resetBrowserTimezoneCapture();

    await captureBrowserTimezoneOnce(USER);

    expect(fetchWithOrganization).toHaveBeenCalledTimes(1);
  });

  it("ONCE PER USER: a different account in the same session is captured too", async () => {
    await captureBrowserTimezoneOnce(USER);
    await captureBrowserTimezoneOnce("22222222-2222-4222-8222-222222222222");

    expect(fetchWithOrganization).toHaveBeenCalledTimes(2);
  });

  it("NEVER THROWS: a rejected POST resolves instead of escaping the auth handler", async () => {
    fetchWithOrganization.mockRejectedValue(new Error("network down"));

    await expect(captureBrowserTimezoneOnce(USER)).resolves.toBe(false);
  });

  it("NO ORGANIZATION: sends nothing rather than letting the refusal open the org picker", async () => {
    getActiveOrgId.mockReturnValue(null);

    await expect(captureBrowserTimezoneOnce(USER)).resolves.toBe(false);
    expect(fetchWithOrganization).not.toHaveBeenCalled();
    // And nothing was claimed, so the next sign-in (with an organization
    // selected) still gets its chance.
    getActiveOrgId.mockReturnValue("5dc930e9-bd65-44a1-8369-af773f6e1a5b");
    await captureBrowserTimezoneOnce(USER);
    expect(fetchWithOrganization).toHaveBeenCalledTimes(1);
  });

  it("NO IDENTITY: an event without a user id sends nothing", async () => {
    await expect(captureBrowserTimezoneOnce(undefined)).resolves.toBe(false);
    expect(fetchWithOrganization).not.toHaveBeenCalled();
  });
});

describe("the auth handler wiring", () => {
  // 🚨 THIS ARM IS PINNED TO A DEFECT FOUND ON LOCALHOST, NOT TO A STYLE.
  // The capture was first wired into the `SIGNED_IN || USER_UPDATED` branch
  // only. A signed-in load of /dashboard on 2026-09-21 then sent NOTHING: a
  // session restored from cookies fires INITIAL_SESSION, never SIGNED_IN. The
  // hole being closed is 749 people who ALREADY have accounts, so somebody who
  // simply stays signed in would never once have been asked. The call must sit
  // in the branch that also covers INITIAL_SESSION.
  it("fires the capture from the branch that INCLUDES INITIAL_SESSION", () => {
    const source = require("node:fs").readFileSync(
      require("node:path").join(__dirname, "AuthSessionWatcher.tsx"),
      "utf8",
    ) as string;

    const call = source.indexOf(
      "void captureBrowserTimezoneOnce(session?.user?.id);",
    );
    expect(call).toBeGreaterThan(-1);

    // The nearest `if (` above the call is the branch it actually runs in.
    const branchStart = source.lastIndexOf("if (", call);
    const branchCondition = source.slice(branchStart, call);
    expect(branchCondition).toContain('event === "SIGNED_IN"');
    expect(branchCondition).toContain('event === "INITIAL_SESSION"');

    // Fire-and-forget: it must not be awaited into the auth handler.
    expect(source.slice(call - 40, call)).not.toContain("await");
  });
});
