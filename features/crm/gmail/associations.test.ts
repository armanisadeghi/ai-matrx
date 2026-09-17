// features/crm/gmail/associations.test.ts
//
// A5/D7 (VERIFY-B1-B2): `service.ts` CLAIMED the association was written
// "through platform.associations" and no such write existed anywhere in the
// Gmail path — the project id reached only a metadata breadcrumb. These fail on
// the pre-fix bytes, where `features/crm/gmail/associations.ts` did not exist.
//
// The edge goes through the registered RPC path ONLY, and through the CACHE-AWARE
// door: the association store's own `add` (F-20 / R2 N8 — `associationsService.add`
// writes the same edge without reloading the endpoints the hooks render from, so
// the record's associations panel kept showing the old set). The store is mocked
// here because the subject is WHICH edges are written, with which role and org,
// and that a failure comes back as words rather than a throw — the message has
// already left.

const add = jest.fn();
jest.mock("@/features/scopes/host/associationsStore", () => ({
  getAssociationsStore: () => ({ add: (args: unknown) => add(args) }),
}));

import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  GMAIL_SEND_ASSOCIATION_ROLE,
  recordGmailSendAssociations,
} from "./associations";

const REPO_ROOT = join(__dirname, "..", "..", "..");

beforeEach(() => {
  add.mockReset();
  add.mockResolvedValue({ ok: true, data: { id: "edge-1" } });
});

describe("recordGmailSendAssociations", () => {
  it("writes the Person edge for a plain compose", async () => {
    const result = await recordGmailSendAssociations({
      interactionId: "interaction-1",
      association: { partyId: "party-ada", organizationId: "org-1" },
    });
    expect(add).toHaveBeenCalledTimes(1);
    expect(add).toHaveBeenCalledWith({
      sourceType: "crm_interaction",
      sourceId: "interaction-1",
      targetType: "party",
      targetId: "party-ada",
      orgId: "org-1",
      role: GMAIL_SEND_ASSOCIATION_ROLE,
    });
    expect(result.failures).toEqual([]);
    expect(result.written).toEqual(["party:party-ada"]);
  });

  it("writes the deal AND the project when the send came from them", async () => {
    await recordGmailSendAssociations({
      interactionId: "interaction-1",
      association: {
        partyId: "party-ada",
        organizationId: "org-1",
        dealId: "deal-1",
        projectId: "project-1",
      },
    });
    const targets = add.mock.calls.map(
      (call) => (call[0] as { targetType: string }).targetType,
    );
    expect(targets).toEqual(["party", "crm_deal", "project"]);
  });

  it("reports a refused edge in words and never throws", async () => {
    add.mockResolvedValueOnce({
      ok: false,
      error: "permission denied for table associations",
    });
    const result = await recordGmailSendAssociations({
      interactionId: "interaction-1",
      association: { partyId: "party-ada", organizationId: "org-1" },
    });
    expect(result.written).toEqual([]);
    expect(result.failures[0]).toContain("was not linked to this record");
  });

  it("survives a thrown RPC the same way", async () => {
    add.mockRejectedValueOnce(new Error("network down"));
    const result = await recordGmailSendAssociations({
      interactionId: "interaction-1",
      association: { partyId: "party-ada", organizationId: "org-1" },
    });
    expect(result.failures[0]).toContain("network down");
  });
});

describe("THE GUARD: no second association path, and the writer calls this one", () => {
  it("the Gmail writer writes the edges", () => {
    const source = readFileSync(
      join(REPO_ROOT, "features/crm/gmail/service.ts"),
      "utf8",
    );
    expect(source).toMatch(/recordGmailSendAssociations/);
  });

  it("nothing in the Gmail path touches platform.associations directly", () => {
    for (const relative of [
      "features/crm/gmail/associations.ts",
      "features/crm/gmail/service.ts",
      "features/crm/gmail/GmailComposePanel.tsx",
    ]) {
      const source = readFileSync(join(REPO_ROOT, relative), "utf8");
      expect(source).not.toMatch(/from\(["']associations["']\)/);
      expect(source).not.toMatch(/rpc\(["']assoc_/);
    }
  });
});
