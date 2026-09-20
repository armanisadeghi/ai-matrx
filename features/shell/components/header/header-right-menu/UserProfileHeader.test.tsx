/**
 * 🚨 THE ACCOUNT MENU NEVER PRINTS THE SAME IDENTITY TWICE.
 *
 * cold-walk-13 friction (common-docs/projects/masterwork-methods-census/
 * jobs-bar-2026-09-16/cold-walk-13/README.md): signed in as `admin@admin.com`
 * (no display name set), the account menu header printed `admin@admin.com`
 * as BOTH the name line and the email line beneath it — the same value shown
 * twice with nothing distinguishing them.
 *
 * `UserProfileHeader` falls back to the email for the top line when there is
 * no separate name (`displayName = name ?? email`), which is correct — but
 * it used to render the email line unconditionally underneath, so a
 * name-less account saw its own email doubled. The fix only shows the
 * second line when it carries information the first line didn't already
 * show.
 *
 * This calls the component function directly (same pattern as
 * ShellUserAvatarImage.test.tsx next door) and walks the returned element
 * tree — no React DOM render, no router context needed.
 */

import { UserProfileHeader } from "./UserProfileHeader";
import type { UserData } from "@/utils/userDataMapper";

function baseUserData(overrides: Partial<UserData["userMetadata"]> & { email?: string | null } = {}): UserData {
  const { email, ...metadataOverrides } = overrides;
  return {
    id: "user-1",
    createdAt: null,
    isAnonymous: false,
    email: email === undefined ? "admin@admin.com" : email,
    phone: null,
    emailConfirmedAt: null,
    lastSignInAt: null,
    appMetadata: { provider: null, providers: [] },
    userMetadata: {
      avatarUrl: null,
      fullName: null,
      name: null,
      preferredUsername: null,
      picture: null,
      ...metadataOverrides,
    },
    identities: [],
    isAdmin: true,
    adminLevel: "super_admin",
    accessToken: null,
    tokenExpiresAt: null,
  };
}

/** Walks the returned element tree to the `<span className="flex flex-col ...">`
 * wrapper that carries the name line and (optionally) the email line. */
function nameBlockChildren(userData: UserData) {
  const label = UserProfileHeader({ userData }) as any;
  const appLink = label.props.children;
  const linkChildren: any[] = Array.isArray(appLink.props.children)
    ? appLink.props.children
    : [appLink.props.children];
  const nameBlock = linkChildren.find(
    (child) => child && child.props?.className?.includes("flex-col"),
  );
  expect(nameBlock).toBeTruthy();
  const children: any[] = Array.isArray(nameBlock.props.children)
    ? nameBlock.props.children
    : [nameBlock.props.children];
  return children;
}

describe("UserProfileHeader — no duplicated identity", () => {
  it("shows the email only once when there is no separate display name", () => {
    const children = nameBlockChildren(
      baseUserData({ name: null, email: "admin@admin.com" }),
    );

    // First line: the email, used as the fallback display name.
    const nameLine = children[0];
    expect(nameLine.props.children).toBe("admin@admin.com");

    // Second line must not also render — showing it would print
    // "admin@admin.com" a second time with nothing to distinguish it.
    const secondLine = children[1];
    expect(secondLine).toBeFalsy();
  });

  it("shows the name once and the email beneath it when both exist", () => {
    const children = nameBlockChildren(
      baseUserData({ name: "Arman Sadeghi", email: "admin@admin.com" }),
    );

    const nameLine = children[0];
    expect(nameLine.props.children).toBe("Arman Sadeghi");

    const secondLine = children[1];
    expect(secondLine).toBeTruthy();
    expect(secondLine.props.children).toBe("admin@admin.com");
  });
});
