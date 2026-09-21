/**
 * 🚨 WALK 19, DEFECT C — SENTENCE-SHAPED MACHINE TEXT IS STILL MACHINE TEXT.
 *
 * The sibling of `blocked-row-sql.test.ts`. That one covers the shape the
 * fourteenth walk caught — a driver's render, obviously machine text on sight.
 * This one covers the shape the NINETEENTH walk caught, which is the harder
 * one, because it reads like a sentence:
 *
 *   cloud_sync read returned empty for cld_file_id=3c38fee2-4635-4f8f-8032-e31df82e5680
 *
 * That is `platform.acquisition_block` row af99dc27-22ef-4e77-9d83-dfc06984f37b,
 * verbatim, and `/acquisition` rendered it in the column where every other row
 * speaks English. No SQL, no bind placeholders, no banner, no traceback — so
 * every machine shape the seam knew answered "no" and the cell printed it.
 *
 * PROVEN FAILING FIRST: remove either of the two shapes added to
 * `MACHINE_SHAPES` (the identifier-with-a-value, the bare uuid) and the first
 * two cases redden.
 *
 * The server half of this same rule lives in
 * `aidream/packages/matrx-utils/matrx_utils/person_sentence.py` and is guarded
 * by `test_person_sentence_machine_identifiers.py`. Both halves are required:
 * the server keeps it out of the column, the client keeps it off the screen if
 * it ever gets there again.
 */

import { parseBlockRow } from "../contract";
import { namesMachineText } from "@/lib/progress/failureSentence";

/** The live row, byte for byte. */
const LIVE_LEAK =
  "cloud_sync read returned empty for cld_file_id=3c38fee2-4635-4f8f-8032-e31df82e5680";

/** The four content-processing adapters say the same thing four ways. */
const SIBLING_WRITERS = [
  "ebook adapter: empty bytes for cld_file_id=3c38fee2-4635-4f8f-8032-e31df82e5680",
  "text adapter: empty bytes for cld_file_id=3c38fee2-4635-4f8f-8032-e31df82e5680",
  "office adapter: empty bytes for cld_file_id=3c38fee2-4635-4f8f-8032-e31df82e5680",
  "page-photo adapter: empty bytes for cld_file_id=3c38fee2-4635-4f8f-8032-e31df82e5680",
  "cld_files 3c38fee2-4635-4f8f-8032-e31df82e5680 has no storage_uri",
  "cld_files row not found: 3c38fee2-4635-4f8f-8032-e31df82e5680",
];

function blockEntry(overrides: Record<string, unknown> = {}) {
  return {
    id: "af99dc27-22ef-4e77-9d83-dfc06984f37b",
    input_ref: "3c38fee2-4635-4f8f-8032-e31df82e5680",
    input_label: "Roof inspection checklist.pdf",
    error_class: "processing_failed",
    unblock_note: null,
    lawful_route: null,
    first_seen_at: "2026-09-18T08:17:36Z",
    last_seen_at: "2026-09-18T08:17:36Z",
    occurrence_count: 1,
    ...overrides,
  };
}

describe("parseBlockRow — a function name and a row id never become the cell", () => {
  it("keeps the module name and the identifier out of `where`", () => {
    const row = parseBlockRow(blockEntry({ error_sentence: LIVE_LEAK }), 0);
    expect(row.where).not.toContain("cloud_sync");
    expect(row.where).not.toContain("cld_file_id");
    expect(row.where).not.toContain("3c38fee2");
  });

  it("files the raw text as diagnostic detail rather than losing it", () => {
    const row = parseBlockRow(blockEntry({ error_sentence: LIVE_LEAK }), 0);
    expect(row.whereDetail).toBe(LIVE_LEAK);
    expect(row.where.length).toBeGreaterThan(20);
  });

  it("calls every sibling writer's message machine text too", () => {
    for (const raw of SIBLING_WRITERS) {
      expect(namesMachineText(raw)).toBe(true);
    }
  });

  it("leaves a sentence written for a person exactly as the server wrote it", () => {
    const honest =
      "We could not read this file's contents from where it is stored. If it came " +
      "from a connected account, reconnect that account and add the file again.";
    const row = parseBlockRow(blockEntry({ error_sentence: honest }), 0);
    expect(row.where).toBe(honest);
    expect(row.whereDetail).toBeUndefined();
  });

  it("does not mistake ordinary prose with an equals sign for machine text", () => {
    expect(namesMachineText("The meter read 6 = a tear-off on that slope.")).toBe(
      false,
    );
    expect(namesMachineText("Set x = 1 on the form and try again.")).toBe(false);
    expect(
      namesMachineText(
        "“03-protected-handbook.epub” is copy-protected (Adobe ADEPT), so we " +
          "cannot read it — and we will never strip a publisher’s protection.",
      ),
    ).toBe(false);
  });
});
