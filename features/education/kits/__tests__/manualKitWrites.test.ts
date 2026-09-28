const mockAdd = jest.fn();
const mockRemove = jest.fn();
const mockListForEntity = jest.fn();
const mockListGeneratedFrom = jest.fn();
const mockFetchEducationLibraryPage = jest.fn();
const mockGetFileMetadata = jest.fn();

jest.mock("@/features/scopes/service/associationsService", () => ({
  associationsService: {
    add: (...args: unknown[]) => mockAdd(...args),
    remove: (...args: unknown[]) => mockRemove(...args),
    listForEntity: (...args: unknown[]) => mockListForEntity(...args),
    listForSources: jest.fn(),
  },
}));

jest.mock("@/features/education/convert/lineage", () => ({
  listGeneratedFrom: (...args: unknown[]) => mockListGeneratedFrom(...args),
}));

jest.mock("@/features/education/library/service", () => ({
  fetchEducationLibraryPage: (...args: unknown[]) =>
    mockFetchEducationLibraryPage(...args),
}));

jest.mock("@/features/files/api/files", () => ({
  getFileMetadata: (...args: unknown[]) => mockGetFileMetadata(...args),
}));

jest.mock("@/features/education/media/service", () => ({
  studyMediaService: { listByIds: jest.fn() },
}));

import type { GeneratedArtifact } from "@/features/education/convert/lineage";
import type { EducationLibraryRow } from "@/features/education/library/types";
import {
  createManualKit,
  kitMembershipFingerprint,
  removeKitMember,
  renameKit,
  type StudyKit,
} from "../kitService";

function libraryRow(
  id = "deck-1",
  title = "Cell review",
): EducationLibraryRow {
  return {
    access_level: "owner",
    accuracy_pct: 0,
    created_at: "2026-09-28T00:00:00Z",
    created_by: "user-1",
    description: "Original artifact description",
    difficulty: "",
    due_count: 0,
    duration_seconds: 0,
    id,
    is_owner: true,
    item_count: 10,
    kind: "fc_set",
    last_studied_at: "",
    organization_id: "org-1",
    organization_name: "School",
    owner_email: "learner@example.com",
    source_title: "Original source",
    status: "ready",
    studied_count: 0,
    subtype: "flashcards",
    title,
    topic: "Biology",
    total_count: 1,
    updated_at: "2026-09-28T00:00:00Z",
    visibility: "private",
  };
}

function generatedArtifact(
  overrides: Partial<GeneratedArtifact> = {},
): GeneratedArtifact {
  return {
    edgeId: "source-edge-1",
    targetKind: "deck",
    artifactType: "fc_set",
    artifactId: "deck-1",
    title: "Cell review",
    href: "/flashcards/deck-1",
    detail: "10 cards",
    sourceTitle: "Original source",
    createdAt: "2026-09-28T00:00:00Z",
    membershipRole: "source",
    edgeMetadata: {
      targetKind: "deck",
      href: "/flashcards/deck-1",
      sourceTitle: "Original source",
      provenanceStamp: "keep-me",
    },
    ...overrides,
  };
}

function kit(artifacts: GeneratedArtifact[]): StudyKit {
  return {
    sourceType: "file",
    sourceId: "file-1",
    title: "Biology kit",
    artifacts,
    createdAt: "2026-09-28T00:00:00Z",
  };
}

describe("manual kit service writes", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockGetFileMetadata.mockResolvedValue({
      data: { id: "file-1", file_name: "biology.pdf" },
    });
    mockListGeneratedFrom.mockResolvedValue([]);
    mockListForEntity.mockResolvedValue({ ok: true, data: { edges: [] } });
    mockFetchEducationLibraryPage.mockResolvedValue({
      rows: [libraryRow()],
      total: 1,
    });
    mockAdd.mockResolvedValue({ ok: true, data: { id: "member-edge-1" } });
    mockRemove.mockResolvedValue({ ok: true, data: null });
  });

  it("creates manual membership without forging source lineage or artifact title metadata", async () => {
    await createManualKit({
      sourceId: "file-1",
      title: "My biology kit",
      artifacts: [libraryRow()],
    });

    expect(mockAdd).toHaveBeenCalledTimes(1);
    const write = mockAdd.mock.calls[0][0] as Record<string, unknown>;
    expect(write).toMatchObject({
      sourceType: "fc_set",
      sourceId: "deck-1",
      targetType: "file",
      targetId: "file-1",
      role: "member",
    });
    expect(write).not.toHaveProperty("label");
    expect(write.metadata).toEqual({
      educationKit: true,
      targetKind: "deck",
      href: "/education/flashcards/deck-1",
      kitTitle: "My biology kit",
    });
  });

  it("refuses an existing source-backed kit before writing an edge", async () => {
    mockListGeneratedFrom.mockResolvedValue([generatedArtifact()]);

    await expect(
      createManualKit({
        sourceId: "file-1",
        title: "Duplicate kit",
        artifacts: [libraryRow()],
      }),
    ).rejects.toThrow(/already has a study kit/);
    expect(mockAdd).not.toHaveBeenCalled();
  });

  it("refuses a selection missing from the fresh owned library before writing an edge", async () => {
    mockFetchEducationLibraryPage.mockResolvedValue({ rows: [], total: 0 });

    await expect(
      createManualKit({
        sourceId: "file-1",
        title: "My biology kit",
        artifacts: [libraryRow("missing-deck")],
      }),
    ).rejects.toThrow(/no longer available in your library/);
    expect(mockAdd).not.toHaveBeenCalled();
  });

  it("hides generated membership without changing its source role or raw metadata", async () => {
    const artifact = generatedArtifact();

    await removeKitMember(kit([artifact]), artifact);

    expect(mockRemove).not.toHaveBeenCalled();
    expect(mockAdd).toHaveBeenCalledWith(
      expect.objectContaining({
        sourceType: "fc_set",
        sourceId: "deck-1",
        targetType: "file",
        targetId: "file-1",
        role: "source",
        metadata: {
          targetKind: "deck",
          href: "/flashcards/deck-1",
          sourceTitle: "Original source",
          provenanceStamp: "keep-me",
          kitHidden: true,
        },
      }),
    );
  });

  it("removes manual membership through the member role", async () => {
    const artifact = generatedArtifact({
      edgeId: "member-edge-1",
      membershipRole: "member",
      sourceTitle: "My biology kit",
      edgeMetadata: { educationKit: true, kitTitle: "My biology kit" },
    });

    await removeKitMember(kit([artifact]), artifact);

    expect(mockAdd).not.toHaveBeenCalled();
    expect(mockRemove).toHaveBeenCalledWith({
      sourceType: "fc_set",
      sourceId: "deck-1",
      targetType: "file",
      targetId: "file-1",
      role: "member",
    });
  });

  it("refuses stale rename approval before rewriting any edge", async () => {
    const current = kit([generatedArtifact()]);
    mockListGeneratedFrom.mockResolvedValue(current.artifacts);

    await expect(
      renameKit(current, "Renamed kit", `${kitMembershipFingerprint(current)}:stale`),
    ).rejects.toThrow(/changed since it was reviewed/);
    expect(mockAdd).not.toHaveBeenCalled();
  });
});
