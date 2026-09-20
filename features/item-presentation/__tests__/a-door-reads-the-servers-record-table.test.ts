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

/**
 * 🚨 NO IN-PLACE OPENER IS NOT NO DOOR — lane F-104, hostile verifier V-23,
 * finding NEW-6, ruling R35.
 *
 * `itemTypeForRecordTable` above is honest and stays honest: `null` means "no
 * item type opens this table in place". V-23's attack is what a READER did with
 * that null — a result row stamped `record_table: "media.source_library"` got
 * no control at all, although `media_source_library` is a registered entity
 * whose `hrefFor` (`/libraries/<id>`) is a working screen. R35: `hrefFor` is
 * the durable address, `useOpenItemPresentation` is the door, and BOTH are
 * required.
 *
 * `recordTableTarget` is the two-legged resolution. Leg one is the entity
 * TOKEN, derived from `ENTITY_TYPE_METADATA` — generated from
 * `platform.entity_types`, the same row the server stamps `record_table` from,
 * so every live token declares its `(schema, table)` with no per-entity edit.
 * Leg two is the item type, when one reads that table. Only a table NO
 * registered entity claims resolves to nothing.
 */
import { recordTableTarget } from "../registry";

describe("a stamp resolves in two legs (R35)", () => {
  it("media.source_library: no opener, but the entity token that owns the address", () => {
    expect(recordTableTarget("media.source_library")).toEqual({
      token: "media_source_library",
      itemType: null,
    });
  });

  it("web.youtube_video: an opener, because an item type reads that table", () => {
    expect(recordTableTarget("web.youtube_video")).toEqual({
      token: "web_youtube_video",
      itemType: "web_youtube_video",
    });
  });

  it("a table no registered entity claims resolves to NOTHING — the honest refusal", () => {
    expect(recordTableTarget("totally.not_a_table")).toBeNull();
  });

  it.each([
    ["communication.calendar_event", "calendar_event"],
    ["workbench.google_document", "google_document"],
    ["crm.party", "party"],
    ["web.site", "web_site"],
  ] as const)("%s still resolves to its opener (%s)", (recordTable, itemType) => {
    expect(recordTableTarget(recordTable)?.itemType).toBe(itemType);
  });

  it("is case- and whitespace-tolerant, and never guesses from a bare table name", () => {
    expect(recordTableTarget("  Media.Source_Library ")?.token).toBe(
      "media_source_library",
    );
    expect(recordTableTarget("source_library")).toBeNull();
    expect(recordTableTarget(42)).toBeNull();
    expect(recordTableTarget(null)).toBeNull();
  });

  /**
   * THE CLASS, not the instance: every table a Google card can stamp must
   * resolve to something a reader can act on. These are the tables
   * `aidream/services/google_workspace/tools.py` and the marketing tools stamp.
   */
  it.each([
    "communication.calendar_event",
    "workbench.google_document",
    "web.youtube_video",
    "web.site",
    "crm.party",
    "media.source_library",
  ])("%s resolves to a token a door can be built from", (recordTable) => {
    const target = recordTableTarget(recordTable);
    expect(target).not.toBeNull();
    expect(typeof target?.token).toBe("string");
  });
});
