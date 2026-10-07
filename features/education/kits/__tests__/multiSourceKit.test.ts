// A study kit holds any number of Sources (Arman, 2026-10-07).
// Contract under test:
//   1. a generated aid of a multi-source kit joins the kit (member edge into
//      the kit scope) and links lineage to EACH Source — never one merged copy;
//   2. a kit scope reads back its Sources and its aids, even with no aids yet;
//   3. an older anchor kit whose edges were handed to a kit opens THAT kit;
//   4. the kit's Sources come from the resolved Source set, one per Source.

const mockAdd = jest.fn();
const mockListForEntity = jest.fn();
const mockReadScopesById = jest.fn();
const mockFetchEducationLibraryPage = jest.fn();
const mockListForSources = jest.fn();
const mockReadScopeTypes = jest.fn();
const mockReadTypeScopesPage = jest.fn();

jest.mock("@/features/scopes/service/associationsService", () => ({
  associationsService: {
    add: (...args: unknown[]) => mockAdd(...args),
    listForEntity: (...args: unknown[]) => mockListForEntity(...args),
    listForSources: (...args: unknown[]) => mockListForSources(...args),
    remove: jest.fn(),
  },
}));
jest.mock("@/features/scopes/service/storeScopeReads", () => ({
  readScopesById: (...args: unknown[]) => mockReadScopesById(...args),
  readScopeTypes: (...args: unknown[]) => mockReadScopeTypes(...args),
  readTypeScopesPage: (...args: unknown[]) => mockReadTypeScopesPage(...args),
}));
jest.mock("@/features/organizations/organizationsIAmIn", () => ({
  organizationsIAmIn: async () => new Set(["org-1", "org-2"]),
}));
jest.mock("@/features/scopes/service/scopeStore", () => ({ scopeStore: {} }));
jest.mock("@/features/sources/api/sourcesApi", () => ({ keepSource: jest.fn() }));
jest.mock("@/features/education/library/service", () => ({
  fetchEducationLibraryPage: (...args: unknown[]) => mockFetchEducationLibraryPage(...args),
}));
jest.mock("@/features/education/media/service", () => ({
  studyMediaService: { listByIds: jest.fn().mockResolvedValue({ data: [] }) },
}));

import { recordSourceLineage } from "@/features/education/convert/recordSourceLineage";
import { groundKitTrust } from "@/features/education/convert/groundKitCitations";
import { kitSourceRefs } from "@/features/education/onboard/kitSources";
import { buildSourceTrust } from "@/features/education/convert/sourceTrust";
import { listKits, readKit } from "../kitService";
import type { ResolvedSourceSet } from "@ai-matrx/agents/sources";

const KIT = "11111111-1111-4111-8111-111111111111";
const edge = (over: Record<string, unknown>) => ({
  id: `e-${Math.random()}`,
  direction: "incoming",
  role: null,
  otherType: "file",
  otherId: "f-1",
  label: null,
  metadata: {},
  createdAt: "2026-10-07T00:00:00Z",
  ...over,
});

beforeEach(() => {
  jest.clearAllMocks();
  mockAdd.mockResolvedValue({ ok: true, data: {} });
  mockFetchEducationLibraryPage.mockResolvedValue({ rows: [], total: 0 });
});

describe("multi-source study kits", () => {
  it("links a generated aid to the kit and to every Source", async () => {
    await recordSourceLineage(
      { artifactId: "deck-1", resourceType: "fc_set", targetKind: "deck", href: "/d", title: "Deck" } as never,
      {
        text: "x",
        title: "Cell biology",
        ref: {
          kind: "paste",
          kitId: KIT,
          kitSources: [
            { type: "processed_document", id: "pd-wiki", title: "Wikipedia: Cell" },
            { type: "processed_document", id: "pd-yt", title: "Cell video" },
            { type: "file", id: "f-pdf", title: "Chapter 3.pdf", fileId: "f-pdf" },
          ],
        },
      },
      "org-1",
    );
    const targets = mockAdd.mock.calls.map(([a]) => `${a.role}:${a.targetType}:${a.targetId}`);
    expect(targets).toEqual([
      `member:scope:${KIT}`,
      "source:processed_document:pd-wiki",
      "source:processed_document:pd-yt",
      "source:file:f-pdf",
    ]);
    expect(mockAdd.mock.calls[0][0].metadata).toMatchObject({ educationKit: true, targetKind: "deck", kitTitle: "Cell biology" });
    for (const [a] of mockAdd.mock.calls.slice(1)) expect(a.metadata.kitId).toBe(KIT);
  });

  it("reads a kit's Sources and aids from its scope", async () => {
    mockReadScopesById.mockResolvedValue({ ok: true, data: [{ id: KIT, name: "Cell biology", organization_id: "org-1" }] });
    mockListForEntity.mockResolvedValue({
      ok: true,
      data: {
        edges: [
          edge({ otherType: "processed_document", otherId: "pd-wiki", metadata: { kitSource: true, title: "Wikipedia: Cell" }, createdAt: "2026-10-07T00:00:01Z" }),
          edge({ otherType: "file", otherId: "f-pdf", metadata: { kitSource: true, title: "Chapter 3.pdf" }, createdAt: "2026-10-07T00:00:02Z" }),
          edge({ role: "member", otherType: "fc_set", otherId: "deck-1", label: "Deck", metadata: { educationKit: true, targetKind: "deck", href: "/d" } }),
        ],
      },
    });
    const kit = await readKit("scope", KIT);
    expect(kit?.title).toBe("Cell biology");
    expect(kit?.sources.map((s) => s.id)).toEqual(["pd-wiki", "f-pdf"]);
    expect(kit?.artifacts.map((a) => a.artifactId)).toEqual(["deck-1"]);
  });

  it("lists a kit that has Sources and no aids yet", async () => {
    mockListForSources.mockResolvedValue({ ok: true, data: { edges: [] } });
    mockReadScopeTypes.mockResolvedValueOnce({ ok: true, data: { types: [{ id: "t-1", slug: "study-kit" }, { id: "t-2", slug: "class" }], counts: null } });
    // An organization the person is listed in but may not read is skipped, not fatal.
    mockReadScopeTypes.mockResolvedValueOnce({ ok: false, error: { code: "forbidden_org", message: "not a member" } });
    mockReadTypeScopesPage.mockResolvedValue({ ok: true, data: { scopes: [{ id: KIT, name: "Cell biology", organization_id: "org-1" }], total: 1, nextOffset: null } });
    mockListForEntity.mockResolvedValue({
      ok: true,
      data: { edges: [edge({ otherType: "file", otherId: "f-pdf", metadata: { kitSource: true, title: "Chapter 3.pdf" }, createdAt: "2026-10-07T00:00:02Z" })] },
    });
    const kits = await listKits();
    expect(mockReadTypeScopesPage).toHaveBeenCalledTimes(1);
    expect(kits.map((k) => [k.sourceType, k.sourceId, k.title, k.artifacts.length])).toEqual([["scope", KIT, "Cell biology", 0]]);
    expect(kits[0].createdAt).toBe("2026-10-07T00:00:02Z");
  });

  it("an anchor whose edges were handed to a kit opens that kit", async () => {
    mockReadScopesById.mockResolvedValue({ ok: true, data: [{ id: KIT, name: "Cell biology", organization_id: "org-1" }] });
    mockListForEntity.mockImplementation(async (type: string) =>
      type === "file"
        ? { ok: true, data: { edges: [edge({ role: "source", otherType: "fc_set", otherId: "deck-1", metadata: { targetKind: "deck", kitId: KIT } })] } }
        : { ok: true, data: { edges: [edge({ otherId: "f-1", metadata: { kitSource: true, title: "Notes.pdf" } })] } },
    );
    const kit = await readKit("file", "f-1");
    expect(kit?.sourceType).toBe("scope");
    expect(kit?.sourceId).toBe(KIT);
  });

  it("points each citation at the Source its chunk came from", () => {
    const refs = [
      { type: "processed_document", id: "pd-wiki", title: "Wikipedia: Cell", processedDocumentId: "pd-wiki", chunkIds: ["c-wiki-1"] },
      { type: "file", id: "f-pdf", title: "Chapter 3.pdf", fileId: "f-pdf", processedDocumentId: "pd-pdf", chunkIds: ["c-pdf-1"] },
    ];
    const trust = {
      confidence: "grounded" as const,
      citations: [
        { sourceId: "c-pdf-1", sourceKind: "document" as const, title: "Source 1" },
        { sourceId: "c-wiki-1", sourceKind: "document" as const, title: "agent title" },
        { sourceId: "c-unknown", sourceKind: "document" as const, title: "kept" },
      ],
    };
    const out = groundKitTrust(trust, refs);
    expect(out.citations.map((c) => [c.title, c.fileId, c.documentId])).toEqual([
      ["Chapter 3.pdf", "f-pdf", "pd-pdf"],
      ["Wikipedia: Cell", undefined, "pd-wiki"],
      ["kept", undefined, undefined],
    ]);
  });

  it("keeps each picked Source separate, and cites each one", () => {
    const resolved = {
      sources: [
        { ref: { resource_type: "processed_document", resource_id: "pd-wiki" }, label: "Wikipedia: Cell", text: "### Chunk c-wiki-1 (page 1)\na", segments: [{ id: "c-wiki-0" }] },
        { ref: { resource_type: "cld_file", resource_id: "f-pdf" }, label: "Chapter 3.pdf", text: "b", segments: [{ id: "c-pdf-1" }], processed_document_id: "pd-pdf" },
        { ref: { resource_type: "note", resource_id: "n-empty" }, label: "Empty", text: "  ", segments: [] },
      ],
      dropped: [],
    } as unknown as ResolvedSourceSet;
    const refs = kitSourceRefs(resolved);
    expect(refs).toEqual([
      { type: "processed_document", id: "pd-wiki", title: "Wikipedia: Cell", processedDocumentId: "pd-wiki", chunkIds: ["c-wiki-0", "c-wiki-1"] },
      { type: "file", id: "f-pdf", title: "Chapter 3.pdf", fileId: "f-pdf", processedDocumentId: "pd-pdf", chunkIds: ["c-pdf-1"] },
    ]);
    const trust = buildSourceTrust({ text: "x", ref: { kind: "paste", kitSources: refs } }, "Kit");
    expect(trust.citations.map((c) => c.title)).toEqual(["Wikipedia: Cell", "Chapter 3.pdf"]);
  });
});
