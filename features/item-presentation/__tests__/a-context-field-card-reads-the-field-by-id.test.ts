/**
 * A CONTEXT-FIELD CARD READS THE FIELD BY ITS ID (lane SCOPES-REVIEW-FIXES, 2026-10-09). The card used
 * to throw "cannot be looked up by id yet" for every context item. It now asks
 * `scopeDoors().field(id, <the person's organizations>)` and shows the field, says not-found by name,
 * or shows the store's refusal.
 */
const mockField = jest.fn();
jest.mock("@/features/scopes/service/scopeDoors", () => ({ scopeDoors: () => ({ field: (...a: unknown[]) => mockField(...a) }) }));
jest.mock("@/features/organizations/service/memberOrganizationRows", () => ({
  readMemberOrganizationRows: async () => ({ ok: true, roleByOrgId: new Map([["org-a", "member"], ["org-b", "admin"]]), rows: [] }),
}));

import { getItemConfig } from "../registry";

const enrich = () => getItemConfig("context_item").config.enrich!;

beforeEach(() => mockField.mockReset());

it("shows the field read in the person's organizations", async () => {
  mockField.mockResolvedValue({ ok: true, data: { id: "f1", label: "Injury date", description: "Date of injury", kind: "date" } });
  const card = await enrich()(null as never, "f1");
  expect(mockField).toHaveBeenCalledWith("f1", ["org-a", "org-b"]);
  expect(card).toMatchObject({ name: "Injury date", about: "Date of injury" });
});

it("says not found, and shows any other refusal", async () => {
  mockField.mockResolvedValue({ ok: false, error: { code: "not_found", message: "This context field could not be found." } });
  await expect(enrich()(null as never, "f1")).resolves.toEqual({ notFound: true });
  mockField.mockResolvedValue({ ok: false, error: { code: "door", message: "You do not have access to this record." } });
  await expect(enrich()(null as never, "f1")).rejects.toThrow("You do not have access to this record.");
});
