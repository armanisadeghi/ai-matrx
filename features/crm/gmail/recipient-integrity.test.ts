// features/crm/gmail/recipient-integrity.test.ts
//
// THE D1 FORCING TEST. A message sent to an address the record cannot attribute
// is recorded on NO Person, in BOTH send paths, and the surface says so.
//
// Written red against the bytes of 2026-09-17: `features/crm/gmail/` held no
// `recipient-integrity` module at all, the guard existed only inside
// `features/approvals/kinds/gmail-send.tsx` as a private comparison, and
// `GmailComposePanel` recorded a stranger's message on the open record with the
// toast "Sent, and recorded on Ada's timeline" (VERIFY-B1-B2 D1). Every
// assertion below fails on those bytes: the import scan finds no shared import
// in either consumer, and the kind still carries its private copy.

import { readFileSync } from "node:fs";
import { join } from "node:path";
import type { GmailRecipientOption } from "./recipients";
import { assessGmailRecipientIntegrity } from "./recipient-integrity";

const REPO_ROOT = join(__dirname, "..", "..", "..");

function held(address: string): GmailRecipientOption {
  return {
    address,
    contactPointId: `point-${address}`,
    mediumId: `medium-${address}`,
    label: null,
    isPrimary: true,
    warning: null,
  };
}

describe("assessGmailRecipientIntegrity — composing on a record", () => {
  it("records the send on the record when the address IS one the record holds", () => {
    const verdict = assessGmailRecipientIntegrity({
      sentTo: "Ada@Example.com",
      source: { kind: "record", heldAddresses: [held("ada@example.com")] },
    });
    expect(verdict.recordOnRecord).toBe(true);
    if (!verdict.recordOnRecord) throw new Error("unreachable");
    expect(verdict.contactPointId).toBe("point-ada@example.com");
    expect(verdict.mediumId).toBe("medium-ada@example.com");
  });

  it("records a stranger's message on NO record, and names the address", () => {
    const verdict = assessGmailRecipientIntegrity({
      sentTo: "stranger@elsewhere.com",
      source: { kind: "record", heldAddresses: [held("ada@example.com")] },
    });
    expect(verdict.recordOnRecord).toBe(false);
    if (verdict.recordOnRecord) throw new Error("unreachable");
    expect(verdict.refusal).toContain("stranger@elsewhere.com");
    expect(verdict.refusal).toContain("not added to any record's timeline");
    expect(verdict.refusal).toContain("by hand");
    // And it never claims the record's own name — the lie the toast used to tell.
    expect(verdict.refusal).not.toContain("recorded on");
  });

  it("refuses when the card reported no recipient at all", () => {
    const verdict = assessGmailRecipientIntegrity({
      sentTo: "   ",
      source: { kind: "record", heldAddresses: [held("ada@example.com")] },
    });
    expect(verdict.recordOnRecord).toBe(false);
  });
});

describe("assessGmailRecipientIntegrity — an approved agent proposal", () => {
  it("records on the proposal's party when the approver did not change the address", () => {
    const verdict = assessGmailRecipientIntegrity({
      sentTo: "sam@example.com",
      source: {
        kind: "proposal",
        proposedAddress: "SAM@example.com",
        contactPointId: "cp-1",
        mediumId: "m-1",
      },
    });
    expect(verdict.recordOnRecord).toBe(true);
    if (!verdict.recordOnRecord) throw new Error("unreachable");
    expect(verdict.contactPointId).toBe("cp-1");
    expect(verdict.mediumId).toBe("m-1");
  });

  it("records a changed recipient on NO record", () => {
    const verdict = assessGmailRecipientIntegrity({
      sentTo: "someone.else@example.com",
      source: { kind: "proposal", proposedAddress: "sam@example.com" },
    });
    expect(verdict.recordOnRecord).toBe(false);
    if (verdict.recordOnRecord) throw new Error("unreachable");
    expect(verdict.refusal).toContain("someone.else@example.com");
    expect(verdict.refusal).toContain("not the address this draft proposed");
  });
});

describe("THE GUARD: both send paths consume the ONE primitive", () => {
  const CONSUMERS = [
    "features/crm/gmail/GmailComposePanel.tsx",
    "features/approvals/kinds/gmail-send.tsx",
  ];

  it.each(CONSUMERS)("%s imports assessGmailRecipientIntegrity", (relative) => {
    const source = readFileSync(join(REPO_ROOT, relative), "utf8");
    expect(source).toMatch(/assessGmailRecipientIntegrity/);
    expect(source).toMatch(/recipient-integrity/);
  });

  it.each(CONSUMERS)("%s keeps no private recipient comparison", (relative) => {
    const source = readFileSync(join(REPO_ROOT, relative), "utf8");
    // The exact shape of the deleted private copies: a hand-rolled
    // case-insensitive compare of the sent address against the authorized one.
    expect(source).not.toMatch(
      /payload\.to\s*\.?\s*trim\(\)\s*\.\s*toLocaleLowerCase\(\)/,
    );
    expect(source).not.toMatch(/const\s+sameRecipient\s*=/);
    expect(source).not.toMatch(/const\s+unchanged\s*=/);
  });

  it("is the only module that words the refusal", () => {
    const primitive = readFileSync(
      join(REPO_ROOT, "features/crm/gmail/recipient-integrity.ts"),
      "utf8",
    );
    expect(primitive).toContain("not added to any record's timeline");
    for (const relative of CONSUMERS) {
      const source = readFileSync(join(REPO_ROOT, relative), "utf8");
      expect(source).not.toContain("not added to any record's timeline");
    }
  });
});
