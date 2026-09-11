/**
 * THE CLASS GUARD for DD-091: no accept page may send an anonymous invitee to
 * /login, and no invitation link may carry the invited address.
 *
 * The root cause was not one page — every accept page bounced a visitor with no
 * session to `/login`, a dead end for the exact person an invitation exists to
 * reach: someone who does not have an account yet. The single fix is
 * `invitationSignUpHref()` (utils/auth/invitation-links.ts), which sends them
 * to sign-up carrying the invitation token and a destination back to the accept
 * page; sign-up resolves the invited address from that token.
 *
 * THE PAGE SET IS DISCOVERED, NOT LISTED. A guard over a hardcoded list
 * protects today's members and lets tomorrow's fifth accept page walk straight
 * through it — which is the instance-not-class mistake the guard exists to stop
 * (finding M2, 2026-09-11). Every page file under `app/` whose path contains
 * both an `invitations` and an `accept` segment is discovered from disk on
 * every run.
 */

import { readdirSync, readFileSync } from "fs";
import { join, relative } from "path";

/** Every accept page under `app/`, discovered — never listed. */
function discoverAcceptPages(root: string): string[] {
  const found: string[] = [];
  const walk = (dir: string) => {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      const full = join(dir, entry.name);
      if (entry.isDirectory()) {
        if (entry.name === "node_modules" || entry.name.startsWith(".")) continue;
        walk(full);
      } else if (entry.isFile() && /^page\.tsx?$/.test(entry.name)) {
        const rel = relative(root, full).split(/[\\/]/);
        if (rel.includes("invitations") && rel.includes("accept")) {
          found.push(relative(process.cwd(), full));
        }
      }
    }
  };
  walk(root);
  return found.sort();
}

const ACCEPT_PAGES = discoverAcceptPages(join(process.cwd(), "app"));

/** A redirect to the login page, however it is spelled. */
const LOGIN_REDIRECT = /(["'`])\/login[?"'`]|loginHref\s*\(/;
/** The invited address riding in a link. */
const EMAIL_IN_LINK = /[?&]email=/;

test("the guard actually found the accept pages (a silent empty set would pass everything)", () => {
  expect(ACCEPT_PAGES.length).toBeGreaterThanOrEqual(4);
});

describe.each(ACCEPT_PAGES)("%s", (relativePath) => {
  const source = () => readFileSync(join(process.cwd(), relativePath), "utf8");

  test("REFUSAL: never routes an anonymous invitee to /login", () => {
    const offending = source()
      .split("\n")
      .map((line, index) => ({ line, number: index + 1 }))
      .filter(({ line }) => LOGIN_REDIRECT.test(line));
    expect(offending).toEqual([]);
  });

  test("REFUSAL: never puts an email address in a link", () => {
    const offending = source()
      .split("\n")
      .map((line, index) => ({ line, number: index + 1 }))
      .filter(({ line }) => EMAIL_IN_LINK.test(line));
    expect(offending).toEqual([]);
  });

  test("CONTROL: sends them to sign-up through the ONE primitive", () => {
    expect(source()).toContain("invitationSignUpHref(");
    expect(source()).toContain("@/utils/auth/invitation-links");
  });
});

describe("invitation links built anywhere else", () => {
  const LINK_BUILDERS = [
    "app/api/organizations/invite/route.ts",
    "app/api/organizations/invitations/resend/route.ts",
    "app/api/projects/invite/route.ts",
    "app/api/projects/invitations/resend/route.ts",
    "app/api/education/class-invite/route.ts",
    "features/organizations/components/InvitationManager.tsx",
    "features/projects/components/InvitationManager.tsx",
    "features/education/classes/service.ts",
  ];

  test.each(LINK_BUILDERS)(
    "REFUSAL: %s builds an accept link with the token only — no address",
    (relativePath) => {
      const source = readFileSync(join(process.cwd(), relativePath), "utf8");
      const offending = source
        .split("\n")
        .filter((line) => EMAIL_IN_LINK.test(line));
      expect(offending).toEqual([]);
    },
  );
});
