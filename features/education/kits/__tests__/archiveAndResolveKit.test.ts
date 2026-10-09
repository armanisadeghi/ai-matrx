const mockListForEntity = jest.fn();
const mockRemove = jest.fn();
const mockAdd = jest.fn();
const mockReadKitScope = jest.fn();
const mockArchiveKitScope = jest.fn();
const mockRestoreKitScope = jest.fn();
const mockCreateKitScope = jest.fn();
const mockListKitScopes = jest.fn();
const mockEnsureOrg = jest.fn();
jest.mock("@/lib/organizations/ensureOrgId", () => ({ ensureOrgId: (...a: unknown[]) => mockEnsureOrg(...a) }));

jest.mock("@/features/scopes/service/associationsService", () => ({
  associationsService: {
    listForEntity: (...a: unknown[]) => mockListForEntity(...a),
    listForSources: jest.fn(),
    remove: (...a: unknown[]) => mockRemove(...a),
    add: (...a: unknown[]) => mockAdd(...a),
  },
}));
jest.mock("@/features/education/library/service", () => ({
  fetchEducationLibraryPage: jest.fn().mockResolvedValue({ rows: [], total: 0 }),
}));
jest.mock("@/features/education/media/service", () => ({
  studyMediaService: { listByIds: jest.fn().mockResolvedValue({ data: [] }) },
}));
jest.mock("../kitScope", () => ({
  ...jest.requireActual("../kitScope"),
  readKitScope: (...a: unknown[]) => mockReadKitScope(...a),
  archiveKitScope: (...a: unknown[]) => mockArchiveKitScope(...a),
  restoreKitScope: (...a: unknown[]) => mockRestoreKitScope(...a),
  createKitScope: (...a: unknown[]) => mockCreateKitScope(...a),
  listKitScopes: (...a: unknown[]) => mockListKitScopes(...a),
}));

import { archiveKit, kitHref, kitMembershipFingerprint, resolveKit, restoreKit } from "../kitService";

const scopeEdges = {
  ok: true,
  data: {
    edges: [
      { id: "e1", direction: "incoming", role: "member", otherType: "study_media", otherId: "a1", label: "Aid", createdAt: "2026-10-01T00:00:00.000Z", metadata: { educationKit: true, targetKind: "summary", kitTitle: "Bio" } },
    ],
  },
};

beforeEach(() => {
  jest.clearAllMocks();
  mockListForEntity.mockResolvedValue(scopeEdges);
  mockReadKitScope.mockResolvedValue({ id: "kit-1", name: "Bio", organizationId: "org" });
  mockArchiveKitScope.mockResolvedValue(undefined);
  mockRestoreKitScope.mockResolvedValue(undefined);
  mockEnsureOrg.mockResolvedValue("org");
});

describe("kitHref", () => {
  it("opens a kit scope by id alone, with no ?from", () => {
    expect(kitHref("scope", "kit-1")).toBe("/education/kits/kit-1");
  });
});

describe("resolveKit", () => {
  it("opens a scope kit from its id with no type hint", async () => {
    const kit = await resolveKit("kit-1");
    expect(kit?.sourceType).toBe("scope");
    expect(kit?.title).toBe("Bio");
  });

  it("falls back to the file anchor kit when the id is not a kit scope", async () => {
    mockReadKitScope.mockResolvedValue(null);
    mockListForEntity.mockResolvedValue({ ok: true, data: { edges: [] } });
    expect(await resolveKit("file-1")).toBeNull();
    expect(mockListForEntity).toHaveBeenCalledWith("file", "file-1");
  });
});

describe("archiveKit / restoreKit", () => {
  it("archives a kit scope without removing any of its links, and restores it", async () => {
    const kit = (await resolveKit("kit-1"))!;
    await archiveKit(kit, kitMembershipFingerprint(kit));
    expect(mockArchiveKitScope).toHaveBeenCalledWith("kit-1");
    expect(mockRemove).not.toHaveBeenCalled();
    await restoreKit(kit);
    expect(mockRestoreKitScope).toHaveBeenCalledWith("kit-1");
  });
});

describe("archiveKit on an older single-anchor kit", () => {
  const anchorEdges = {
    ok: true,
    data: { edges: [
      { id: "s1", direction: "incoming", role: "source", otherType: "study_media", otherId: "a1", label: "Aid", createdAt: "2026-10-01T00:00:00.000Z", metadata: { targetKind: "summary", sourceTitle: "Bio" } },
    ] },
  };
  it("promotes to a kit scope, archives the scope, and Undo restores that scope", async () => {
    mockReadKitScope.mockResolvedValue(null);
    mockListForEntity.mockResolvedValue(anchorEdges);
    mockAdd.mockResolvedValue({ ok: true });
    mockCreateKitScope.mockResolvedValue({ id: "new-kit", name: "Bio", organizationId: "org" });
    const kit = (await resolveKit("file-1"))!;
    expect(kit.sourceType).toBe("file");
    const archived = await archiveKit(kit, kitMembershipFingerprint(kit));
    expect(mockRemove).not.toHaveBeenCalled(); // no link is dropped without a way back
    expect(mockCreateKitScope).toHaveBeenCalled();
    expect(mockArchiveKitScope).toHaveBeenCalledWith("new-kit");
    expect(archived).toEqual({ sourceType: "scope", sourceId: "new-kit" });
    await restoreKit(archived);
    expect(mockRestoreKitScope).toHaveBeenCalledWith("new-kit");
  });
});

describe("archived kit scope visibility", () => {
  it("listKits omits an archived scope (live-only scope reads) and shows it after restore", async () => {
    const live: { id: string; name: string; organizationId: string }[] = [];
    mockListKitScopes.mockImplementation(async () => live);
    const { listKits } = await import("../kitService");
    expect((await listKits()).some((k) => k.sourceId === "kit-1")).toBe(false);
    live.push({ id: "kit-1", name: "Bio", organizationId: "org" });
    expect((await listKits()).some((k) => k.sourceId === "kit-1")).toBe(true);
  });
});
