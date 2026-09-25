/**
 * `WarRoomResourcesList.tsx`'s delete confirm said "Permanently delete ...
 * This cannot be undone" for all three deletable resource tokens (file,
 * udt_document, note) — but `deleteEntity()` dispatches `deleteFile`
 * (features/files/redux/thunks.ts, soft by default via `softDeleteFileDirect`),
 * `deleteDocument` (features/data-tables/document-service.ts, sets
 * `workbench.udt_documents.deleted_at`), and `deleteNote`
 * (features/notes/redux/thunks.ts, sets `workbench.notes.deleted_at`) —
 * all three are soft deletes with a real restore path (the files trash's
 * Restore action, the notes trash). Traced during data-doctrine-adoption
 * v5 lane UNDONE-COPY-CENSUS-3.
 *
 * Class guard: scans the file for any permanence claim near the delete
 * confirm dialog.
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";

const FILE = join(__dirname, "..", "WarRoomResourcesList.tsx");

const PERMANENCE_PATTERNS: RegExp[] = [
  /cannot be undone/i,
  /can(?:'|’|&rsquo;)t be undone/i,
  /permanently (?:removes?|deletes?)/i,
  /irreversible/i,
];

describe("war-room resources delete confirm copy is honest about a soft delete", () => {
  it("guards a file that still defines the delete confirm dialog", () => {
    const source = readFileSync(FILE, "utf8");
    expect(source).toMatch(/DELETABLE_TOKENS/);
  });

  it("does not claim the delete of a soft-deletable resource is permanent", () => {
    const source = readFileSync(FILE, "utf8");
    const offences = PERMANENCE_PATTERNS.filter((re) => re.test(source)).map((re) => re.source);
    expect(offences).toEqual([]);
  });

  it("tells the truth: the item is archived and separately restorable", () => {
    const source = readFileSync(FILE, "utf8");
    expect(source).toMatch(/restore/i);
    expect(source).toMatch(/Archive/);
  });
});
