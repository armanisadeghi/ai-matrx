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
 * The component uses hooks, so this renders it for real with
 * `renderToStaticMarkup` and reads what a person would read.
 */

import { renderToStaticMarkup } from "react-dom/server";
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

/** Renders the real component (it uses hooks, so it must be rendered, never
 * called as a plain function) and returns the text of the identity block:
 * one entry per line the person would read. */
function identityLines(userData: UserData): string[] {
  const html = renderToStaticMarkup(<UserProfileHeader userData={userData} />);
  const block = html.match(/<span class="[^"]*flex-col[^"]*">(.*?)<\/span>\s*<\/a>|<span class="[^"]*flex-col[^"]*">(.*)$/s);
  const inner = (block?.[1] ?? block?.[2] ?? html);
  return Array.from(inner.matchAll(/<span[^>]*>([^<]+)<\/span>/g)).map((m) => m[1]);
}

describe("UserProfileHeader — no duplicated identity", () => {
  it("shows the email only once when there is no separate display name", () => {
    const html = renderToStaticMarkup(
      <UserProfileHeader userData={baseUserData({ name: null, email: "admin@admin.com" })} />,
    );
    // The email is the fallback display name; printing it again beneath
    // itself is the defect.
    const visible = html.replace(/<[^>]+>/g, "\n");
    expect(visible.split("admin@admin.com").length - 1).toBe(1);
  });

  it("shows the name once and the email beneath it when both exist", () => {
    const lines = identityLines(
      baseUserData({ name: "Dana Whitfield", email: "admin@admin.com" }),
    );
    expect(lines.filter((l) => l === "Dana Whitfield")).toHaveLength(1);
    expect(lines.filter((l) => l === "admin@admin.com")).toHaveLength(1);
    expect(lines.indexOf("Dana Whitfield")).toBeLessThan(lines.indexOf("admin@admin.com"));
  });
});
