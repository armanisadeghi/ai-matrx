/**
 * An unsorted recording is a capture SEGMENT — a component of the Scribe pool with no Trash kind
 * (`platform.entity_types.user_artifact_kind` is null; its lifecycle is archived_at / detached_at).
 * Trash lists only user-artifact kinds, so a delete the hub wrote for it could neither be seen in
 * Trash nor restored. It is designed-absent from Trash, never offered and never silently attempted.
 */
import { readFileSync } from "fs";
import { join } from "path";
import {
  STUDIO_SESSION_TOKEN,
  TRANSCRIPT_RECORD_TOKEN,
  UNSORTED_NOT_TRASHABLE,
  UNSORTED_TOKEN,
  isTrashable,
} from "../transcripts/transcriptRows";

describe("which transcript rows can go to Trash", () => {
  it("transcripts and sessions can; an unsorted recording cannot", () => {
    expect(isTrashable({ entity: TRANSCRIPT_RECORD_TOKEN })).toBe(true);
    expect(isTrashable({ entity: STUDIO_SESSION_TOKEN })).toBe(true);
    expect(isTrashable({ entity: "processed_document" })).toBe(true);
    expect(isTrashable({ entity: UNSORTED_TOKEN })).toBe(false);
  });

  it("the row menu omits Move to Trash for it, and a bulk trash says what it left alone", () => {
    const page = readFileSync(join(__dirname, "../components/KnowledgeHubPage.tsx"), "utf8");
    expect(page).toMatch(/isTrashable\(actionTarget\(hit\)\)\s*\?\s*\[\{ id: "trash"/);
    expect(page).toMatch(/const items = all\.filter\(\(h\) => isTrashable\(actionTarget\(h\)\)\)/);
    expect(UNSORTED_NOT_TRASHABLE).toMatch(/Scribe/);
  });
});
