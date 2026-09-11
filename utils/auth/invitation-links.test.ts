/**
 * The invitation link contract (DD-091).
 *
 * REFUSAL/CONTROL pairs: the value carried on an invitation link is DISPLAY
 * data, so the refusals here are about what we are willing to echo back into a
 * rendered sentence and a prefilled field — never about authorization, which
 * stays with `inv_get_by_token` matching the signed-in address.
 */

import {
  invitationSignUpHref,
  readInvitedEmail,
  withInvitedEmail,
} from "./invitation-links";

describe("readInvitedEmail", () => {
  test("CONTROL: reads and normalizes the invited address", () => {
    expect(readInvitedEmail("?email=Dana%40Example.com")).toBe(
      "dana@example.com",
    );
    expect(
      readInvitedEmail(new URLSearchParams({ email: "dana@example.com" })),
    ).toBe("dana@example.com");
    expect(readInvitedEmail({ email: "dana@example.com" })).toBe(
      "dana@example.com",
    );
    expect(readInvitedEmail({ email: ["dana@example.com"] })).toBe(
      "dana@example.com",
    );
  });

  test("REFUSAL: anything that is not email-shaped never reaches the screen", () => {
    expect(readInvitedEmail("?email=not-an-email")).toBeNull();
    expect(readInvitedEmail("?email=")).toBeNull();
    expect(
      readInvitedEmail("?email=%3Cscript%3Ealert(1)%3C%2Fscript%3E"),
    ).toBeNull();
    expect(readInvitedEmail(null)).toBeNull();
    expect(readInvitedEmail({})).toBeNull();
  });
});

describe("withInvitedEmail", () => {
  test("CONTROL: stamps the address on a bare and an already-queried URL", () => {
    expect(
      withInvitedEmail(
        "https://www.aimatrx.com/invitations/organization/accept/tok",
        "Dana@Example.com",
      ),
    ).toBe(
      "https://www.aimatrx.com/invitations/organization/accept/tok?email=dana%40example.com",
    );
    expect(withInvitedEmail("/accept/tok?x=1", "dana@example.com")).toBe(
      "/accept/tok?x=1&email=dana%40example.com",
    );
  });

  test("REFUSAL: a missing or junk address leaves the link untouched — the flow still works, it just cannot prefill", () => {
    expect(withInvitedEmail("/accept/tok", null)).toBe("/accept/tok");
    expect(withInvitedEmail("/accept/tok", undefined)).toBe("/accept/tok");
    expect(withInvitedEmail("/accept/tok", "  ")).toBe("/accept/tok");
    expect(withInvitedEmail("/accept/tok", "nope")).toBe("/accept/tok");
  });
});

describe("invitationSignUpHref", () => {
  test("CONTROL: an anonymous invitee goes to SIGN-UP, carrying the destination and the address", () => {
    const href = invitationSignUpHref(
      "/invitations/organization/accept/tok",
      "dana@example.com",
    );
    expect(href.startsWith("/sign-up?")).toBe(true);
    const params = new URLSearchParams(href.slice(href.indexOf("?") + 1));
    expect(params.get("redirectTo")).toBe(
      "/invitations/organization/accept/tok",
    );
    expect(params.get("email")).toBe("dana@example.com");
  });

  test("REFUSAL: never /login — that was the dead end for a colleague with no account", () => {
    expect(
      invitationSignUpHref("/invitations/project/accept/tok", null),
    ).not.toContain("/login");
  });

  test("an `email` already on the accept path is not duplicated into the destination", () => {
    const href = invitationSignUpHref(
      "/invitations/class/accept/tok?email=old@example.com",
      "dana@example.com",
    );
    const params = new URLSearchParams(href.slice(href.indexOf("?") + 1));
    expect(params.get("redirectTo")).toBe("/invitations/class/accept/tok");
    expect(params.getAll("email")).toEqual(["dana@example.com"]);
  });
});
