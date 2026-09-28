/**
 * GUARD: the studio never opens a trashed document as if it were live.
 *
 * THE FINDING (verifier, 2026-09-27): `/markdown-studio?source=document&id=<id>`
 * opened a document sitting in its owner's Trash with no word about it, fully
 * editable. `content.document_get` still answers the owner (Google Drive
 * behaviour, rcstore_n) and omits `deleted_at`, so the loader could not tell.
 * Now `loadDocument` reports `inTrash` and the studio's document source refuses
 * it exactly as a trashed note is refused: a RecordUnavailableError that the
 * studio renders through AccessGate — "This document is in Trash" + Restore.
 */

const rpc = jest.fn();
const maybeSingle = jest.fn();

jest.mock("@/utils/supabase/client", () => ({
  supabase: {
    schema: () => ({
      rpc: (...args: unknown[]) => rpc(...args),
      from: () => ({ select: () => ({ eq: () => ({ maybeSingle: () => maybeSingle() }) }) }),
    }),
  },
}));

import { loadDocument } from "@/features/rich-document/annotations/documentSource";

const ID = "8c59bc1b-0000-4000-8000-000000000001";
const row = {
  id: ID,
  title: "Kiln Load Log — Week 39",
  body: "# Kiln Load Log",
  content_version: 3,
  version: 7,
  organization_id: "11111111-1111-4111-8111-111111111111",
  created_by: "22222222-2222-4222-8222-222222222222",
  type_slug: "markdown",
};

beforeEach(() => {
  rpc.mockReset().mockResolvedValue({ data: [row], error: null });
  maybeSingle.mockReset();
});

it("reports a document in its owner's Trash", async () => {
  maybeSingle.mockResolvedValue({ data: { deleted_at: "2026-09-27T10:00:00Z" }, error: null });
  const doc = await loadDocument(ID);
  expect(doc?.inTrash).toBe(true);
});

it("reports a live document as live", async () => {
  maybeSingle.mockResolvedValue({ data: { deleted_at: null }, error: null });
  const doc = await loadDocument(ID);
  expect(doc?.inTrash).toBe(false);
});

it("never guesses when the Trash check itself fails", async () => {
  maybeSingle.mockResolvedValue({ data: null, error: { message: "permission denied" } });
  await expect(loadDocument(ID)).rejects.toThrow(/whether this document is in Trash/);
});

it("the studio's document source refuses a trashed document through AccessGate", () => {
  // Source-level: the one loader line that decides it. A runtime import of the
  // registry pulls the whole agents/notes graph; the decision is this line.
  const src = require("node:fs").readFileSync(
    require("node:path").join(__dirname, "..", "lab", "content-sources.ts"),
    "utf8",
  ) as string;
  expect(src).toMatch(
    /const doc = await loadDocument\(id\);[\s\S]{0,400}if \(!doc \|\| doc\.inTrash\) throw absent\("document", "document", id, "content\.document"\)/,
  );
});
