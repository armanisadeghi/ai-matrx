/**
 * 🚨 FIX-10C / VERIFIER-10 F13 — the Share dialog contradicted itself.
 *
 * MEASURED, admin seat, Rincon Plumbing Co, the Jobs table. After an outside
 * invitation landed, the Users tab read, top to bottom:
 *
 *   Current Access
 *   Not shared with anyone
 *   No one has been granted access here
 *   …
 *   People outside this organization
 *   m••••@harborviewpm.net    Invited, not yet joined
 *
 * Both halves are true. The grant list knows only about DIRECT grants and says
 * so in its own scope note; an invitation is not a grant and confers nothing
 * until it is accepted. Making the list COUNT invitations would be the same lie
 * pointing the other way — it would claim access somebody does not have.
 *
 * So the empty state stops pretending it is the whole screen: it says the
 * narrower, still-true thing ("Nobody has access yet") and names what IS drawn
 * below it. The grant count itself is untouched.
 */

import * as React from "react";
import { act } from "react";
import { createRoot } from "react-dom/client";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

import { PermissionsList } from "@/features/sharing/components/PermissionsList";
import {
  NO_GRANTS_HEADLINE,
  NO_GRANTS_YET_HEADLINE,
} from "@/features/sharing/format";

function draw(node: React.ReactElement) {
  const host = document.createElement("div");
  document.body.appendChild(host);
  const root = createRoot(host);
  act(() => root.render(node));
  const text = host.textContent ?? "";
  act(() => root.unmount());
  host.remove();
  return text;
}

const noop = async () => ({ success: true }) as never;

describe("the grant list's empty state", () => {
  it("still says 'Not shared with anyone' when nothing else is on the screen", () => {
    const text = draw(
      <PermissionsList permissions={[]} isOwner onUpdateLevel={noop} onRevoke={noop} />,
    );
    expect(text).toContain(NO_GRANTS_HEADLINE);
    expect(text).not.toContain(NO_GRANTS_YET_HEADLINE);
  });

  it("never stands over an invited row saying nobody is shared with", () => {
    const text = draw(
      <PermissionsList
        permissions={[]}
        isOwner
        onUpdateLevel={noop}
        onRevoke={noop}
        alsoPending={{
          count: 1,
          one: "person outside this organization",
          many: "people outside this organization",
        }}
      />,
    );
    expect(text).not.toContain(NO_GRANTS_HEADLINE);
    expect(text).toContain(NO_GRANTS_YET_HEADLINE);
    // And it names what is drawn below it, rather than leaving the reader to
    // reconcile two sentences themselves.
    expect(text).toContain("One person outside this organization is invited below");
    expect(text).toContain("has not joined yet");
  });

  it("counts people, plurally, without ever calling an invitation a grant", () => {
    const text = draw(
      <PermissionsList
        permissions={[]}
        isOwner
        onUpdateLevel={noop}
        onRevoke={noop}
        alsoPending={{
          count: 3,
          one: "person outside this organization",
          many: "people outside this organization",
        }}
      />,
    );
    // A plural is a word the thing already knows — never an "s" glued on.
    expect(text).toContain("3 people outside this organization are invited below");
    expect(text).not.toContain("organizations are invited");
    // The scope note is the thing that made the old sentence defensible and it
    // stays: this list is still only about direct grants.
    expect(text).toContain("No one has been granted access here");
  });
});
