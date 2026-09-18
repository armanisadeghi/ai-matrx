/**
 * 🚨 THE DOOR'S TYPE IS THE SERVER'S `record_table`, NOT A CONSTANT
 * (lane F-93, hostile verifier V-22, finding NEW-9).
 *
 * V-22's attack, reproduced here as the first case: a calendar-shaped tool result
 * whose event carries `record_table: "media.source_library"` and a `record_id`
 * from that table. The reader that hardcodes `type="calendar_event"` beside
 * `record_id` offers an "Open" control that opens a `calendar_event` with a
 * foreign id — a confidently wrong record, which is worse than no door. With the
 * stamp read, the door either opens the RIGHT record or renders nothing.
 *
 * `itemTypeForRecordTable` is derived from THE type map (`detailSource`), so
 * nothing here is a second registry and a type registered tomorrow resolves for
 * free.
 */

import { getItemConfig, itemTypeForRecordTable } from "../registry";

describe("V-22's attack: a calendar payload stamped with a foreign table", () => {
  const event = {
    record_id: "812e1df9-e3ff-4a60-b90c-ccfaabe2b88e",
    record_table: "media.source_library",
    title: "Weekly sync",
  };

  it("does not resolve to calendar_event", () => {
    expect(itemTypeForRecordTable(event.record_table)).not.toBe("calendar_event");
  });

  it("resolves to nothing at all, because no item type reads that table", () => {
    // `media.source_library` opens at `/libraries/<id>` (its entity-registry
    // door), not through the item-presentation Detail primitive — so the honest
    // answer here is `null`, and a reader must render NO door rather than the
    // wrong one.
    expect(itemTypeForRecordTable(event.record_table)).toBeNull();
  });
});

describe("the stamp resolves the records the server really stamps", () => {
  it.each([
    ["communication.calendar_event", "calendar_event"],
    ["workbench.google_document", "google_document"],
    ["web.youtube_video", "web_youtube_video"],
    ["crm.party", "party"],
    ["web.site", "web_site"],
  ] as const)("%s → %s", (recordTable, type) => {
    expect(itemTypeForRecordTable(recordTable)).toBe(type);
    // Whatever it resolves to must actually be openable, or the door is a
    // dead control (`RecordDoor` renders nothing without `open`).
    expect(getItemConfig(type).config.open).toBeDefined();
  });

  it("is case- and whitespace-tolerant, the way a wire string is", () => {
    expect(itemTypeForRecordTable("  Communication.Calendar_Event ")).toBe(
      "calendar_event",
    );
  });
});

describe("it never guesses", () => {
  it.each([
    ["calendar_event", "a bare table name — `definition` lives in two schemas"],
    ["", "empty"],
    ["media.source_library ", "a table no item type reads"],
    ["nope.nothing", "an unknown table"],
  ] as const)("%s → null (%s)", (recordTable, _why) => {
    expect(itemTypeForRecordTable(recordTable)).toBeNull();
  });

  it.each([null, undefined, 42, {}, ["communication.calendar_event"]])(
    "a non-string stamp resolves to null (%p)",
    (recordTable) => {
      expect(itemTypeForRecordTable(recordTable)).toBeNull();
    },
  );

  it("prefers the canonical registration when two types share a table", () => {
    // `structured_list` and its legacy read-only alias `picklist` both read
    // `workbench.udt_structured_lists`; the canonical word must win.
    expect(itemTypeForRecordTable("workbench.udt_structured_lists")).toBe(
      "structured_list",
    );
  });
});
