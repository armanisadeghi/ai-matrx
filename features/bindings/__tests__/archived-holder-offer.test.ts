/**
 * AN ARCHIVED HOLDER IS OFFERED, NEVER DEAD (2026-09-26).
 *
 * Choosing an archived agent or workflow in the binding picker offers ONE honest
 * action: "Restore and use" when the access kernel says the person may edit it,
 * otherwise "Archived — ask the owner to restore it" with a request-access target
 * naming the record and its owner. A live holder gets nothing.
 */
import { archivedHolderOffer, type ArchivedHolderFacts } from "../archived-holder";
import { SYSTEM_ORGANIZATION_ID } from "@/constants/platform-orgs";

const base: ArchivedHolderFacts = {
  kind: "workflow",
  id: "wf-1",
  name: "Summarise Text & Write a Title",
  isArchived: true,
  organizationId: "org-1",
  organizationName: "Riverside Clinic",
  viewerCanEdit: true,
};

describe("archivedHolderOffer", () => {
  it("a live holder gets no notice", () => {
    expect(archivedHolderOffer({ ...base, isArchived: false })).toEqual({ kind: "none" });
    expect(archivedHolderOffer(null)).toEqual({ kind: "none" });
  });

  it("someone who may edit it is offered Restore and use", () => {
    const offer = archivedHolderOffer(base);
    expect(offer.kind).toBe("restore");
    if (offer.kind === "restore") {
      expect(offer.label).toBe("Restore and use");
      expect(offer.sentence).toContain("Summarise Text & Write a Title is archived");
    }
  });

  it("someone who may not is told to ask the owner, with a request-access target", () => {
    const offer = archivedHolderOffer({ ...base, kind: "agent", viewerCanEdit: false });
    expect(offer.kind).toBe("ask-owner");
    if (offer.kind === "ask-owner") {
      expect(offer.sentence).toBe("Archived — ask the owner to restore it.");
      expect(offer.target.action).toBe("Restore this agent");
      expect(offer.target.resource).toMatchObject({ kind: "Agent", type: "agent", id: "wf-1" });
      expect(offer.target.owner).toEqual({ organizationId: "org-1", organizationName: "Riverside Clinic" });
    }
  });

  it("a system-owned archived holder routes the ask to the platform", () => {
    const offer = archivedHolderOffer({ ...base, viewerCanEdit: false, organizationId: SYSTEM_ORGANIZATION_ID });
    expect(offer.kind === "ask-owner" && offer.target.owner).toBe("system");
  });
});
