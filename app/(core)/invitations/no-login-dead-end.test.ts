/**
 * THE CLASS GUARD for DD-091: no accept page may send an anonymous invitee to
 * /login.
 *
 * The root cause was not one page — all four accept pages bounced a visitor
 * with no session to `/login`, which is a dead end for the exact person an
 * invitation exists to reach: someone who does not have an account yet. The
 * single fix is `invitationSignUpHref()` (utils/auth/invitation-links.ts),
 * which sends them to sign-up carrying the invited address and a destination
 * back to the accept page — sign-up itself keeps "Already have an account?
 * Sign in" one click away.
 *
 * This guard reads the shipped sources, so a new accept page that hand-builds
 * a login redirect fails here rather than in a colleague's inbox. Proven RED
 * against the pre-fix sources (`git show HEAD~:<page>`) before it went green.
 */

import { readFileSync, existsSync } from "fs";
import { join } from "path";

const ACCEPT_PAGES = [
  "app/(core)/invitations/organization/accept/[token]/page.tsx",
  "app/(core)/invitations/project/accept/[token]/page.tsx",
  "app/(core)/invitations/class/accept/[token]/page.tsx",
  "app/(core)/invitations/employee/accept/[token]/page.tsx",
];

/** A redirect to the login page, however it is spelled. */
const LOGIN_REDIRECT = /(["'`])\/login[?"'`]|loginHref\s*\(/;

describe("invitation accept pages", () => {
  test.each(ACCEPT_PAGES)("%s exists", (relative) => {
    expect(existsSync(join(process.cwd(), relative))).toBe(true);
  });

  test.each(ACCEPT_PAGES)(
    "REFUSAL: %s never routes an anonymous invitee to /login",
    (relative) => {
      const source = readFileSync(join(process.cwd(), relative), "utf8");
      const offending = source
        .split("\n")
        .map((line, index) => ({ line, number: index + 1 }))
        .filter(({ line }) => LOGIN_REDIRECT.test(line));
      expect(offending).toEqual([]);
    },
  );

  test.each(ACCEPT_PAGES)(
    "CONTROL: %s sends them to sign-up through the ONE primitive",
    (relative) => {
      const source = readFileSync(join(process.cwd(), relative), "utf8");
      expect(source).toContain("invitationSignUpHref(");
      expect(source).toContain("@/utils/auth/invitation-links");
    },
  );
});
