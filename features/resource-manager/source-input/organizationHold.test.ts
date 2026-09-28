import { OrganizationSelectionCancelled } from "@/lib/organization/selection-cancelled";
import { OrganizationContextError } from "@ai-matrx/agents/matrx";
import { createOrganizationHold, waitsForOrganization } from "./organizationHold";

/**
 * V1-A (verifier shot 03): with no organization selected, adding a Source ended in
 * "Select an organization before sending this request" — a dead end. A landing that
 * stopped only for want of an organization is HELD and runs again once one is set.
 */
describe("holding a landing for an organization", () => {
  it("holds only the organization refusals — every other failure still fails", () => {
    expect(
      waitsForOrganization(
        new OrganizationContextError("organization_context_required", "Select an organization before sending this request."),
      ),
    ).toBe(true);
    expect(waitsForOrganization(new OrganizationSelectionCancelled())).toBe(true);
    const envelope = Object.assign(new Error("Name the organization"), { code: "organization_required" });
    expect(waitsForOrganization(envelope)).toBe(true);
    expect(waitsForOrganization(new Error("That page could not be read"))).toBe(false);
  });

  it("runs each held landing exactly once when an organization is set", async () => {
    const hold = createOrganizationHold();
    const ran: string[] = [];
    hold.hold("paste-1", () => ran.push("paste-1"));
    hold.hold("file-2", () => ran.push("file-2 old"));
    hold.hold("file-2", () => ran.push("file-2"));
    hold.hold("web-3", () => ran.push("web-3"));
    hold.drop("web-3");
    expect(hold.size).toBe(2);
    expect(hold.release()).toBe(2);
    await Promise.resolve();
    await Promise.resolve();
    expect(ran.sort()).toEqual(["file-2", "paste-1"]);
    expect(hold.release()).toBe(0);
  });
});
