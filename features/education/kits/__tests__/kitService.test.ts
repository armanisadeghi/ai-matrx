const mockListForEntity = jest.fn();
const mockRemove = jest.fn();
const mockFetchEducationLibraryPage = jest.fn();
const mockListByIds = jest.fn();

jest.mock("@/features/scopes/service/associationsService", () => ({
  associationsService: {
    listForEntity: (...args: unknown[]) => mockListForEntity(...args),
    listForSources: jest.fn(),
    remove: (...args: unknown[]) => mockRemove(...args),
  },
}));

jest.mock("@/features/education/library/service", () => ({
  fetchEducationLibraryPage: (...args: unknown[]) => mockFetchEducationLibraryPage(...args),
}));

jest.mock("@/features/education/media/service", () => ({
  studyMediaService: { listByIds: (...args: unknown[]) => mockListByIds(...args) },
}));

import { kitMembershipFingerprint, readKit, removeKitMembersVersioned } from "../kitService";

describe("readKit", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockListByIds.mockResolvedValue({ data: [] });
  });

  it("rejects when the authoritative lineage read fails instead of claiming the kit is empty", async () => {
    mockListForEntity.mockResolvedValue({
      ok: false,
      error: { message: "JWT expired" },
    });

    await expect(readKit("file", "kit-1")).rejects.toThrow(
      "Could not read generated artifacts for file:kit-1",
    );
  });

  it("removes two qualified members from one fresh snapshot without reusing a stale token", async () => {
    mockListForEntity.mockResolvedValue({
      ok: true,
      data: {
        edges: [
          { id: "edge-a", direction: "incoming", role: "member", otherType: "study_media", otherId: "aid-a", label: null, createdAt: "2026-09-28T00:00:00.000Z", metadata: { educationKit: true, targetKind: "summary", kitTitle: "Manual kit" } },
          { id: "edge-b", direction: "incoming", role: "member", otherType: "study_media", otherId: "aid-b", label: null, createdAt: "2026-09-28T00:01:00.000Z", metadata: { educationKit: true, targetKind: "summary", kitTitle: "Manual kit" } },
        ],
      },
    });
    mockFetchEducationLibraryPage.mockResolvedValue({
      rows: [
        { kind: "study_media", id: "aid-a", title: "First aid" },
        { kind: "study_media", id: "aid-b", title: "Second aid" },
      ],
      total: 2,
    });
    mockRemove.mockResolvedValue({ ok: true });

    const kit = await readKit("file", "source-file");
    expect(kit).not.toBeNull();
    if (!kit) throw new Error("Expected the manual kit to load.");

    await removeKitMembersVersioned(
      kit,
      [
        { kind: "study_media", id: "aid-a" },
        { kind: "study_media", id: "aid-b" },
      ],
      kitMembershipFingerprint(kit),
    );

    expect(mockRemove).toHaveBeenCalledTimes(2);
    expect(mockRemove).toHaveBeenNthCalledWith(1, expect.objectContaining({ sourceId: "aid-a", role: "member" }));
    expect(mockRemove).toHaveBeenNthCalledWith(2, expect.objectContaining({ sourceId: "aid-b", role: "member" }));
  });
});
