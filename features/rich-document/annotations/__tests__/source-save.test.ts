/**
 * RC-B11 — ONE save adapter for every annotation source. Accepting a suggestion on a Notes
 * source (a study guide) goes through the same splice + compare-and-swap the studio's
 * content.document uses: only the suggested span's block changes, everything else is written
 * back byte for byte, and a real conflict is refused with a sentence.
 *
 * Use case: a tutor's suggestion on AP Human Geography Unit 1 — "frequency" → "count" in the
 * Dot Density bullet — while the guide also holds a table and a fenced example.
 */
jest.mock("@/utils/supabase/client", () => ({ supabase: {} }));

import { spliceSaveBody, type VersionedBodyStore, type VersionedBodyRow } from "../sourceSave";
import { applySuggestion } from "../suggestion";
import { buildTextAnchor } from "../anchor";

const GUIDE = [
  "# Unit 1",
  "",
  "* **Choropleth Map:** Uses shades to represent statistical data.",
  "* **Dot Density Map:** Uses dots to mark the frequency or occurrences of a phenomenon.",
  "",
  "| Map | Shows |",
  "|---|---|",
  "| Isoline | equal values |",
  "",
  "```js",
  "  scale(1, 25000)   // spacing kept",
  "```",
].join("\n");

function memoryStore(row: VersionedBodyRow, bumpBeforeWrite?: string): VersionedBodyStore & { row: VersionedBodyRow; writes: string[] } {
  const s = {
    row: { ...row },
    writes: [] as string[],
    noun: "note",
    write(body: string, expected: number, next: number) {
      if (bumpBeforeWrite !== undefined) { s.row = { version: s.row.version + 1, body: bumpBeforeWrite }; bumpBeforeWrite = undefined; }
      if (s.row.version !== expected) return Promise.resolve({ data: null, error: null });
      s.row = { version: next, body };
      s.writes.push(body);
      return Promise.resolve({ data: { ...s.row }, error: null });
    },
    current: () => Promise.resolve({ data: { ...s.row }, error: null }),
  };
  return s;
}

describe("the one splice-save adapter", () => {
  const start = GUIDE.indexOf("frequency");
  const anchor = buildTextAnchor(GUIDE, start, start + "frequency".length, 7);

  it("accepting a suggestion changes only the suggested span", async () => {
    const store = memoryStore({ version: 7, body: GUIDE });
    const { nextBody } = applySuggestion(GUIDE, 7, anchor, "count");
    await spliceSaveBody({ version: 7, body: GUIDE }, nextBody, store);
    expect(store.writes).toHaveLength(1);
    expect(store.row.body).toBe(GUIDE.replace("the frequency or", "the count or"));
    expect(store.row.version).toBe(8);
  });

  it("refuses, in words, when someone changed the text since it was opened", async () => {
    const store = memoryStore({ version: 7, body: GUIDE }, GUIDE.replace("Unit 1", "Unit One"));
    const { nextBody } = applySuggestion(GUIDE, 7, anchor, "count");
    await expect(spliceSaveBody({ version: 7, body: GUIDE }, nextBody, store)).rejects.toThrow(/Someone else changed this note/);
    expect(store.row.body).toContain("Unit One");
    expect(store.row.body).toContain("the frequency or");
  });
});
