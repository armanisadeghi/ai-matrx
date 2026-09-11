/**
 * The invitation link contract (DD-091).
 *
 * THE RULE THESE TESTS EXIST TO HOLD: an invitation link carries the TOKEN and
 * nothing else. The invited address is never in a URL — it is stable PII, and a
 * query string lives on in browser history and in every edge log the request
 * passes through, long after the token expires. Sign-up resolves the address
 * from the token through `public.inv_peek_invited_email`.
 */

import {
  invitationSignUpHref,
  readInviteToken,
  withInviteToken,
} from "./invitation-links";

const TOKEN = "7f1b6d2e-6a4c-4f9b-9a2e-1c3d5e7f9a11";

describe("readInviteToken", () => {
  test("CONTROL: reads the token from every source shape", () => {
    expect(readInviteToken(`?invite=${TOKEN}`)).toBe(TOKEN);
    expect(readInviteToken(new URLSearchParams({ invite: TOKEN }))).toBe(TOKEN);
    expect(readInviteToken({ invite: TOKEN })).toBe(TOKEN);
    expect(readInviteToken({ invite: [TOKEN] })).toBe(TOKEN);
  });

  test("REFUSAL: anything not token-shaped is dropped, never forwarded", () => {
    expect(readInviteToken("?invite=")).toBeNull();
    expect(readInviteToken("?invite=short")).toBeNull();
    expect(readInviteToken("?invite=%3Cscript%3Ealert(1)%3C%2Fscript%3E")).toBeNull();
    expect(readInviteToken(`?invite=${"a".repeat(201)}`)).toBeNull();
    expect(readInviteToken(null)).toBeNull();
    expect(readInviteToken({})).toBeNull();
  });
});

describe("withInviteToken", () => {
  test("CONTROL: stamps the token on a bare and an already-queried auth URL", () => {
    expect(withInviteToken("/sign-up", TOKEN)).toBe(`/sign-up?invite=${TOKEN}`);
    expect(withInviteToken("/login?redirectTo=%2Fx", TOKEN)).toBe(
      `/login?redirectTo=%2Fx&invite=${TOKEN}`,
    );
  });

  test("REFUSAL: a missing or wrong-shaped token leaves the URL untouched", () => {
    expect(withInviteToken("/sign-up", null)).toBe("/sign-up");
    expect(withInviteToken("/sign-up", undefined)).toBe("/sign-up");
    expect(withInviteToken("/sign-up", "  ")).toBe("/sign-up");
    expect(withInviteToken("/sign-up", "nope")).toBe("/sign-up");
  });
});

describe("invitationSignUpHref", () => {
  test("CONTROL: an anonymous invitee goes to SIGN-UP with the destination and the token", () => {
    const href = invitationSignUpHref(
      `/invitations/organization/accept/${TOKEN}`,
      TOKEN,
    );
    expect(href.startsWith("/sign-up?")).toBe(true);
    const params = new URLSearchParams(href.slice(href.indexOf("?") + 1));
    expect(params.get("redirectTo")).toBe(
      `/invitations/organization/accept/${TOKEN}`,
    );
    expect(params.get("invite")).toBe(TOKEN);
  });

  test("REFUSAL: never /login — that was the dead end for a colleague with no account", () => {
    expect(
      invitationSignUpHref(`/invitations/project/accept/${TOKEN}`, TOKEN),
    ).not.toContain("/login");
  });

  test("REFUSAL: no email, ever — an address must not reach a URL (chair ruling 2026-09-11)", () => {
    const href = invitationSignUpHref(
      `/invitations/class/accept/${TOKEN}?email=dana@example.com`,
      TOKEN,
    );
    expect(href).not.toContain("dana");
    expect(href).not.toContain("%40");
    expect(href).not.toMatch(/[?&]email=/);
    // …and the stale param does not ride along inside the destination either.
    expect(
      new URLSearchParams(href.slice(href.indexOf("?") + 1)).get("redirectTo"),
    ).toBe(`/invitations/class/accept/${TOKEN}`);
  });
});
