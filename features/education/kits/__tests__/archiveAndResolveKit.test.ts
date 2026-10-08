const mockListForEntity = jest.fn();
const mockRemove = jest.fn();
const mockAdd = jest.fn();
const mockReadKitScope = jest.fn();
const mockArchiveKitScope = jest.fn();
const mockRestoreKitScope = jest.fn();

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
