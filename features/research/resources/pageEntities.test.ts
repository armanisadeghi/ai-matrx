/**
 * `page.entities` — what each analysed, kept page NAMED, as one derived block.
 *
 * The same block is derived server-side by aidream
 * `research/context_bundles.py::derive_page_entities` for the topical map
 * author; this pins the browser half to the same rules: excluded and non-valid
 * pages never contribute, pages that named nothing print nothing, importance
 * (then the post-read score) orders the lines, and every line carries the URL.
 */
import type { ManifestPageEntities, ResourceItem, ResourceManifest } from "./types";

jest.mock("@/utils/supabase/client", () => ({ __esModule: true, supabase: {} }));

import { CATALOG } from "./catalog";

function item(id: string, importance: number | null): ResourceItem {
  return {
    kind: "search.result",
    id,
    parentId: null,
    label: id,
    sublabel: null,
    chars: 10,
    status: null,
    createdAt: null,
    flags: {},
    sourceId: id,
    importance,
    bestRank: null,
    authority: null,
    keywordIds: [],
    tagIds: [],
    included: true,
  };
}

function entities(
  sourceId: string,
  url: string,
  partial: Partial<ManifestPageEntities> = {},
): ManifestPageEntities {
  return {
    sourceId,
    url,
    hostname: new URL(url).hostname,
    included: true,
    analysisStatus: "valid",
    pageType: "product_page",
    finalScore: null,
    products: [],
    organizations: [],
    locations: [],
    ...partial,
  };
}

function manifest(rows: ManifestPageEntities[], sources: ResourceItem[]): ResourceManifest {
  return {
    topicId: "t",
    generatedAt: "2026-09-20T00:00:00Z",
    topic: {
      id: "t",
      name: "All Green",
      description: null,
      tone_profile: null,
      status: "complete",
      created_at: null,
    },
    keywords: [],
    tags: [],
    itemsByKind: new Map([["search.result", sources]]),
    rollups: new Map(),
    unknownKinds: [],
    experts: [],
    entities: rows,
  };
}

const def = CATALOG.find((k) => k.key === "page.entities");

describe("page.entities", () => {
  it("is a derived kind in the catalogue", () => {
    expect(def).toBeDefined();
    expect(typeof def?.derive).toBe("function");
    expect(def?.defaultVariable).toBe("page_entities");
  });

  it("names what each kept, valid page named, best first, with the URL", () => {
    const text = def!.derive!(
      manifest(
        [
          entities("s1", "https://allgreenrecycling.com/secure-data-destruction/", {
            products: ["Hard Drive Shredding", "Data Wiping"],
            organizations: ["Department of Defense"],
            locations: ["United States"],
            finalScore: 63.4,
          }),
          entities("s2", "https://theorg.com/x", {
            pageType: "directory",
            products: ["Reverse Logistics"],
            finalScore: 61.1,
          }),
          entities("s3", "https://excluded.example/x", { included: false, products: ["Nope"] }),
          entities("s4", "https://thin.example/x", { analysisStatus: "thin", products: ["Nope"] }),
          entities("s5", "https://empty.example/x"),
        ],
        [item("s1", 7), item("s2", 10)],
      ),
      {
        urlForSource: () => null,
        keywordName: () => null,
        tagName: () => null,
      },
    );
    expect(text).not.toContain("Nope");
    expect(text).not.toContain("empty.example");
    expect(text.indexOf("theorg.com")).toBeLessThan(text.indexOf("allgreenrecycling.com"));
    expect(text).toContain("offerings named: Hard Drive Shredding; Data Wiping");
    expect(text).toContain("organisations named: Department of Defense");
    expect(text).toContain("places named: United States");
    expect(text).toContain("[directory]");
    expect(text).toContain("- Pages: 2");
  });

  it("prints nothing when no page named anything", () => {
    const text = def!.derive!(manifest([entities("s1", "https://a.example/")], []), {
      urlForSource: () => null,
      keywordName: () => null,
      tagName: () => null,
    });
    expect(text).toBe("");
  });
});
