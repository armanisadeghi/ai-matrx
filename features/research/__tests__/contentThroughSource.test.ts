/**
 * A research page body is edited THROUGH ITS SOURCE (SOURCE-CONVERGENCE §1
 * rule 4, §4.6, §8.4).
 *
 *  - A row with `processed_document_id` (a landed page) is curated with
 *    `POST /sources/{id}/edit` — a `manual_curation` version beside the
 *    original — and restored with `POST /sources/{id}/restore`. The
 *    `rs_content` body is never rewritten for it.
 *  - A row without the pointer is not yet a Source: research's own copy is
 *    edited in place (the original backed up once), as before.
 *  - The body the screen shows is read through the research content route
 *    (which reads the Source), never from `rs_content.content` directly.
 */

interface MockResult {
  data: unknown;
  error: unknown;
}
type Call = { method: string; args: unknown[] };

const results: Record<string, MockResult> = {};
const calls: Call[] = [];

function makeBuilder(table: string) {
  const builder: Record<string, unknown> = {};
  for (const m of [
    "select",
    "insert",
    "update",
    "delete",
    "is",
    "not",
    "eq",
    "in",
    "order",
    "limit",
    "returns",
  ]) {
    builder[m] = jest.fn((...args: unknown[]) => {
      calls.push({ method: `${table}.${m}`, args });
      return builder;
    });
  }
  const result = () => results[table] ?? { data: [], error: null };
  builder.maybeSingle = jest.fn(() => Promise.resolve(result()));
  builder.single = jest.fn(() => Promise.resolve(result()));
  builder.then = (
    resolve: (r: MockResult) => unknown,
    reject?: (e: unknown) => unknown,
  ) => Promise.resolve(result()).then(resolve, reject);
  return builder;
}

jest.mock("@/utils/supabase/client", () => ({
  supabase: {
    schema: jest.fn(() => ({
      from: jest.fn((table: string) => {
        calls.push({ method: "from", args: [table] });
        return makeBuilder(table);
      }),
    })),
    rpc: jest.fn(),
  },
}));

const mockPostJson = jest.fn();
const mockGetJson = jest.fn();
jest.mock("@/lib/python-client", () => ({
  postJson: (...args: unknown[]) => mockPostJson(...args),
  getJson: (...args: unknown[]) => mockGetJson(...args),
}));

import {
  getSourceContent,
  restoreOriginalContent,
  updateContentCurated,
} from "../service";
import type { ResearchContent } from "../types";

function row(over: Partial<ResearchContent> = {}): ResearchContent {
  return {
    id: "c1",
    source_id: "s1",
    topic_id: "t1",
    content: "# Scraped\n\nOriginal body",
    original_content: null,
    processed_document_id: null,
    content_hash: null,
    char_count: 24,
    content_type: "markdown",
    is_good_scrape: true,
    quality_override: null,
    capture_method: "auto",
    failure_reason: null,
    published_at: null,
    modified_at: null,
    is_current: true,
    version: 1,
    linked_extraction_id: null,
    linked_transcript_id: null,
    extracted_links: null,
    extracted_images: null,
    scraped_at: null,
    ...over,
  };
}

const landed = {
  processed_document_id: "pd-edit",
  source_id: "src",
  reused_existing: false,
  new_version_of: "pd1",
  kept: true,
  intelligence: "queued",
  original_file_id: null,
  notices: [],
};

beforeEach(() => {
  calls.length = 0;
  for (const k of Object.keys(results)) delete results[k];
  mockPostJson.mockReset();
  mockGetJson.mockReset();
  results.processed_documents = {
    data: { id: "pd1", organization_id: "org1" },
    error: null,
  };
  results.rs_content = { data: [{ id: "c1" }], error: null };
});

const rsContentWrites = () =>
  calls.filter((c) => c.method === "rs_content.update");

describe("curating a page that is a Source", () => {
  it("saves the edit through POST /sources/{id}/edit and never rewrites rs_content", async () => {
    mockPostJson.mockResolvedValue({ data: landed, meta: {} });
    await updateContentCurated(
      row({ processed_document_id: "pd1" }),
      "## Kept part\n\nTrimmed body",
    );
    expect(mockPostJson).toHaveBeenCalledTimes(1);
    const [path, body, opts] = mockPostJson.mock.calls[0];
    expect(path).toBe("/sources/pd1/edit");
    expect(body.portions).toHaveLength(1);
    expect(body.portions[0]).toMatchObject({
      ordinal: 1,
      kind: "section",
      text: "## Kept part\n\nTrimmed body",
    });
    expect(body.portions[0].locator.heading_path).toEqual([]);
    expect(typeof body.portions[0].locator.text_fragment).toBe("string");
    expect(opts).toMatchObject({ organizationId: "org1" });
    expect(rsContentWrites()).toHaveLength(0);
  });

  it("restores through POST /sources/{id}/restore and never rewrites rs_content", async () => {
    mockPostJson.mockResolvedValue({ data: landed, meta: {} });
    await restoreOriginalContent(row({ processed_document_id: "pd1" }));
    expect(mockPostJson).toHaveBeenCalledTimes(1);
    expect(mockPostJson.mock.calls[0][0]).toBe("/sources/pd1/restore");
    expect(rsContentWrites()).toHaveLength(0);
  });

  it("retires an old research-side curation copy so the row reads its Source again", async () => {
    mockPostJson.mockResolvedValue({ data: landed, meta: {} });
    await updateContentCurated(
      row({ processed_document_id: "pd1", original_content: "old scrape" }),
      "new text",
    );
    const writes = rsContentWrites();
    expect(writes).toHaveLength(1);
    expect(writes[0].args[0]).toEqual({ original_content: null });
  });
});

describe("curating a page that is not yet a Source", () => {
  it("edits research's own copy in place, backing the scrape up once", async () => {
    await updateContentCurated(row(), "Trimmed");
    expect(mockPostJson).not.toHaveBeenCalled();
    const writes = rsContentWrites();
    expect(writes).toHaveLength(1);
    expect(writes[0].args[0]).toEqual({
      content: "Trimmed",
      char_count: 7,
      original_content: "# Scraped\n\nOriginal body",
    });
  });

  it("restores research's own backup in place", async () => {
    await restoreOriginalContent(
      row({ content: "Trimmed", original_content: "Full scrape" }),
    );
    expect(mockPostJson).not.toHaveBeenCalled();
    expect(rsContentWrites()[0].args[0]).toEqual({
      content: "Full scrape",
      char_count: 11,
      original_content: null,
    });
  });
});

describe("reading the body", () => {
  it("takes the body from the research content route (the Source), never rs_content.content", async () => {
    results.rs_content = {
      data: [row({ content: undefined, processed_document_id: "pd1" })],
      error: null,
    };
    mockGetJson.mockResolvedValue({
      data: [{ id: "c1", content: "The Source's current text" }],
      meta: {},
    });
    const versions = await getSourceContent("t1", "s1");
    expect(mockGetJson.mock.calls[0][0]).toBe(
      "/research/topics/t1/sources/s1/content",
    );
    const select = calls.find((c) => c.method === "rs_content.select");
    const columns = String(select?.args[0] ?? "").split(",");
    expect(columns).not.toContain("content");
    expect(columns).not.toContain("*");
    expect(columns).toContain("processed_document_id");
    expect(versions[0].content).toBe("The Source's current text");
    expect(versions[0].processed_document_id).toBe("pd1");
  });
});
