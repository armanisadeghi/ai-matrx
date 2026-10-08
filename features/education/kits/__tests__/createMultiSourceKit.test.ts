// /education/kits/new makes the SAME kit as /education/start: one scope, each
// picked Source filed under it (never one merged file), then any chosen aids.

const mockAdd = jest.fn();
const mockListForEntity = jest.fn();
const mockReadScopesById = jest.fn();
const mockReadScopeTypes = jest.fn();
const mockCreateScope = jest.fn();
const mockFetchEducationLibraryPage = jest.fn();

jest.mock("@/features/scopes/service/associationsService", () => ({
  associationsService: {
    add: (...a: unknown[]) => mockAdd(...a),
    listForEntity: (...a: unknown[]) => mockListForEntity(...a),
    listForSources: jest.fn(),
    remove: jest.fn(),
  },
}));
jest.mock("@/features/scopes/service/storeScopeReads", () => ({
  readScopesById: (...a: unknown[]) => mockReadScopesById(...a),
  readScopeTypes: (...a: unknown[]) => mockReadScopeTypes(...a),
}));
jest.mock("@/features/scopes/service/scopeStore", () => ({
  scopeStore: { createScope: (...a: unknown[]) => mockCreateScope(...a), createScopeType: jest.fn() },
}));
jest.mock("@/features/sources/api/sourcesApi", () => ({ keepSource: jest.fn().mockResolvedValue(undefined) }));
jest.mock("@/features/education/library/service", () => ({
  fetchEducationLibraryPage: (...a: unknown[]) => mockFetchEducationLibraryPage(...a),
}));
jest.mock("@/features/education/media/service", () => ({
  studyMediaService: { listByIds: jest.fn().mockResolvedValue({ data: [] }) },
}));
jest.mock("@/features/files/api/files", () => ({ getFileMetadata: jest.fn() }));

import { createMultiSourceKit } from "../kitService";

const ORG = "22222222-2222-4222-8222-222222222222";
const KIT = "33333333-3333-4333-8333-333333333333";

beforeEach(() => {
  jest.clearAllMocks();
  mockAdd.mockResolvedValue({ ok: true, data: {} });
  mockReadScopeTypes.mockResolvedValue({ ok: true, data: { types: [{ id: "t1", slug: "study-kit", organization_id: ORG }] } });
  mockCreateScope.mockResolvedValue({ data: { id: KIT } });
  mockReadScopesById.mockResolvedValue({ ok: true, data: [{ id: KIT, name: "Photosynthesis", organization_id: ORG }] });
  mockListForEntity.mockResolvedValue({ ok: true, data: { edges: [] } });
  mockFetchEducationLibraryPage.mockResolvedValue({ rows: [], total: 0 });
});

describe("createMultiSourceKit", () => {
  it("files every picked Source under one new kit scope, with no aids needed", async () => {
    const id = await createMultiSourceKit({
      orgId: ORG,
      title: "Photosynthesis",
      sources: [
        { type: "file", id: "f-1", title: "Notes" },
        { type: "processed_document", id: "pd-2", title: "Calvin cycle" },
        { type: "file", id: "f-3", title: "Video transcript" },
      ],
      artifacts: [],
    });
    expect(id).toBe(KIT);
    expect(mockCreateScope).toHaveBeenCalledTimes(1);
    const filed = mockAdd.mock.calls.map(([c]) => c as Record<string, unknown>);
    expect(filed.map((c) => `${c.sourceType}:${c.sourceId}`)).toEqual(["file:f-1", "processed_document:pd-2", "file:f-3"]);
    expect(filed.every((c) => c.targetType === "scope" && c.targetId === KIT)).toBe(true);
  });

  it("adds the chosen saved aids to the brand-new kit (an empty kit's membership revision is empty, not missing)", async () => {
    // Live 2026-10-07: every new kit made with saved aids failed with "This kit is still
    // loading" because the new kit's fingerprint is "" and the guard read "" as absent.
    const deck = { kind: "fc_set", id: "deck-1", title: "Photosynthesis deck", subtype: "flashcards" };
    mockFetchEducationLibraryPage.mockResolvedValue({ rows: [deck], total: 1 });
    const id = await createMultiSourceKit({
      orgId: ORG,
      title: "Photosynthesis",
      sources: [{ type: "file", id: "f-1", title: "Notes" }],
      artifacts: [deck as never],
    });
    expect(id).toBe(KIT);
    const member = mockAdd.mock.calls.map(([c]) => c as Record<string, unknown>).find((c) => c.role === "member");
    expect(member).toMatchObject({ sourceType: "fc_set", sourceId: "deck-1", targetType: "scope", targetId: KIT });
  });

  it("refuses a kit with no material", async () => {
    await expect(createMultiSourceKit({ orgId: ORG, title: "Empty", sources: [], artifacts: [] })).rejects.toThrow(/material/);
    expect(mockCreateScope).not.toHaveBeenCalled();
  });
});
