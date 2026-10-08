// A kit's scope type is the study-kit type of the kit's OWN organization.
// An org without one gets its own created — it never borrows another org's.

const mockReadScopeTypes = jest.fn();
const mockCreateScopeType = jest.fn();
const mockCreateScope = jest.fn();

jest.mock("@/features/scopes/service/storeScopeReads", () => ({
  readScopeTypes: (...a: unknown[]) => mockReadScopeTypes(...a),
  readScopesById: jest.fn(),
  readTypeScopesPage: jest.fn(),
}));
jest.mock("@/features/scopes/service/scopeStore", () => ({
  scopeStore: {
    createScopeType: (...a: unknown[]) => mockCreateScopeType(...a),
    createScope: (...a: unknown[]) => mockCreateScope(...a),
  },
}));

import { createKitScope } from "../kitScope";

const ORG_A = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const ORG_B = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";

beforeEach(() => {
  jest.clearAllMocks();
  mockCreateScope.mockResolvedValue({ data: { id: "kit-1" } });
  mockCreateScopeType.mockResolvedValue({ data: { id: "own-type" } });
});

describe("ensureKitScopeType via createKitScope", () => {
  it("creates its own type when only another org has one, never borrowing it", async () => {
    mockReadScopeTypes.mockResolvedValue({
      ok: true,
      data: { types: [{ id: "other-org-type", slug: "study-kit", organization_id: ORG_B }] },
    });
    await createKitScope(ORG_A, "Chapter 3");
    expect(mockCreateScopeType).toHaveBeenCalledWith(expect.objectContaining({ org_id: ORG_A, slug: "study-kit" }));
    expect(mockCreateScope).toHaveBeenCalledWith(expect.objectContaining({ org_id: ORG_A, type_id: "own-type" }));
  });

  it("reuses the org's own type without creating one", async () => {
    mockReadScopeTypes.mockResolvedValue({
      ok: true,
      data: { types: [
        { id: "other-org-type", slug: "study-kit", organization_id: ORG_B },
        { id: "mine", slug: "study-kit", organization_id: ORG_A },
      ] },
    });
    await createKitScope(ORG_A, "Chapter 3");
    expect(mockCreateScopeType).not.toHaveBeenCalled();
    expect(mockCreateScope).toHaveBeenCalledWith(expect.objectContaining({ type_id: "mine" }));
  });
});
