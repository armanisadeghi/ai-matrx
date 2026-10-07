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

jest.mock("@/features/scopes/service/associationsService", () => ({
  associationsService: {
    add: (...args: unknown[]) => mockAdd(...args),
    listForEntity: (...args: unknown[]) => mockListForEntity(...args),
    listForSources: jest.fn(),
    remove: jest.fn(),
  },
}));
jest.mock("@/features/scopes/service/storeScopeReads", () => ({
  readScopesById: (...args: unknown[]) => mockReadScopesById(...args),
  readScopeTypes: jest.fn(),
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
import { kitSourceRefs } from "@/features/education/onboard/kitSources";
import { buildSourceTrust } from "@/features/education/convert/sourceTrust";
import { readKit } from "../kitService";
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

  it("keeps each picked Source separate, and cites each one", () => {
    const resolved = {
      sources: [
        { ref: { resource_type: "processed_document", resource_id: "pd-wiki" }, label: "Wikipedia: Cell", text: "a", segments: [] },
        { ref: { resource_type: "cld_file", resource_id: "f-pdf" }, label: "Chapter 3.pdf", text: "b", segments: [], processed_document_id: "pd-pdf" },
        { ref: { resource_type: "note", resource_id: "n-empty" }, label: "Empty", text: "  ", segments: [] },
      ],
      dropped: [],
    } as unknown as ResolvedSourceSet;
    const refs = kitSourceRefs(resolved);
    expect(refs).toEqual([
      { type: "processed_document", id: "pd-wiki", title: "Wikipedia: Cell", processedDocumentId: "pd-wiki" },
      { type: "file", id: "f-pdf", title: "Chapter 3.pdf", fileId: "f-pdf", processedDocumentId: "pd-pdf" },
    ]);
    const trust = buildSourceTrust({ text: "x", ref: { kind: "paste", kitSources: refs } }, "Kit");
    expect(trust.citations.map((c) => c.title)).toEqual(["Wikipedia: Cell", "Chapter 3.pdf"]);
  });
});
