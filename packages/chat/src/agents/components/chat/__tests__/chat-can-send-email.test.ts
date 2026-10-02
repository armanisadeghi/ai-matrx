// F-20 item 2 (VERIFY-B1-B2-R2 A1): the chat surface has an entrance to the one
// Gmail compose window. On `1f058283` nothing under `features/agents/**`
// referenced `useOpenGmailComposeWindow` — the opener had three call sites and
// all three were CRM record surfaces.

import { readFileSync } from "node:fs";
import { join } from "node:path";
import { conversationEmailEntrances } from "../conversation-email-entrance";

describe("the chat entrance", () => {
  it("is wired to the ONE compose opener, not a second compose path", () => {
    const source = readFileSync(
      join(__dirname, "..", "ConversationPageMenu.tsx"),
      "utf8",
    );
    expect(source).toContain(
      'from "@/features/overlays/openers/gmailComposeWindow"',
    );
    expect(source).toContain("openGmailCompose(");
    // No second compose surface: the panel is never mounted here.
    expect(source).not.toContain("GmailComposePanel");
  });

  it("offers one entrance per associated Person, named", () => {
    expect(
      conversationEmailEntrances([
        { otherType: "party", otherId: "p1", label: "Ada Lovelace", orgId: "org-1" },
        { otherType: "project", otherId: "pr1", label: "Apollo", orgId: "org-1" },
        { otherType: "party", otherId: "p1", label: "Ada Lovelace", orgId: "org-1" },
      ]),
    ).toEqual([
      { partyId: "p1", organizationId: "org-1", partyLabel: "Ada Lovelace" },
    ]);
  });

  it("offers nothing it cannot open", () => {
    expect(
      conversationEmailEntrances([
        { otherType: "party", otherId: "p1", label: "Ada", orgId: null },
      ]),
    ).toEqual([]);
  });
});
