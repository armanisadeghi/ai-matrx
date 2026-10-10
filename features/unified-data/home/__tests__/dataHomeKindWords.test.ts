// features/unified-data/home/__tests__/dataHomeKindWords.test.ts — LANE ALL-MY-DATA
//
// EVERY KIND THE DATA HOME CAN HOLD HAS A PLAIN WORD, OR IS LEFT OUT ON PURPOSE. The kinds are
// enumerated from the app's own declarations (the store's table kinds, each listing's item kind, the
// door's item kinds): a kind added there and not classified in dataHomeKindWords.ts fails here, and
// no internal word ("Scope", "Kit", "Pagecleanup" …) can reach the screen as a kind.

import { DATA_HOME_ITEM_KINDS } from "@/features/unified-data/hub/doors";
import { STORE_KIND_WORDS } from "@/features/unified-data/hub/dataHomeScope";
import { LISTING_KIND, customFieldsRow, dataHomeKindWord, pickListHref } from "../dataHomeRows";
import {
  FORBIDDEN_KIND_WORDS,
  PLAIN_KIND_WORD,
  PLATFORM_TABLE_WORD,
  isClassified,
  kindIsListed,
  plainKindWord,
} from "../dataHomeKindWords";

const EVERY_KIND = [...new Set([...STORE_KIND_WORDS, ...Object.values(LISTING_KIND), ...DATA_HOME_ITEM_KINDS, "custom_fields"])];

describe("the data home says what each thing is in plain words", () => {
  it("classifies every kind the app can say, so an unmapped internal kind fails here", () => {
    const unclassified = EVERY_KIND.filter((kind) => !isClassified(kind));
    expect(unclassified).toEqual([]);
  });

  it("never shows an internal or retired word as a kind", () => {
    for (const kind of EVERY_KIND) {
      expect(FORBIDDEN_KIND_WORDS).not.toContain(dataHomeKindWord(kind));
    }
    expect(dataHomeKindWord("pagecleanup")).toBe(PLATFORM_TABLE_WORD);
    expect(dataHomeKindWord("agent_output")).toBe(PLATFORM_TABLE_WORD);
  });

  it("names the kinds a person owns with the vocabulary's words", () => {
    expect(plainKindWord("table")).toBe("Table");
    expect(plainKindWord("list")).toBe("Pick list");
    expect(plainKindWord("form")).toBe("Form");
    expect(plainKindWord("dashboard")).toBe("Dashboard");
    expect(plainKindWord("page")).toBe("Page");
    expect(plainKindWord("automation")).toBe("Automation");
    expect(plainKindWord("portal")).toBe("Portal");
    expect(plainKindWord("booking")).toBe("Booking");
    expect(Object.values(PLAIN_KIND_WORD)).not.toContain("List");
  });

  it("lists platform tables only when asked, and leaves the non-data kinds out always", () => {
    expect(kindIsListed("scope", false)).toBe(false);
    expect(kindIsListed("scope", true)).toBe(true);
    expect(kindIsListed("brand_new_kept_word", false)).toBe(false);
    expect(kindIsListed("digest", true)).toBe(false);
    expect(kindIsListed("list", false)).toBe(true);
  });

  it("opens a pick list on its own page and custom fields on their settings", () => {
    expect(pickListHref("abc", "/data/abc")).toBe("/pick-lists/abc");
    const row = customFieldsRow({
      organization_id: "0a54df90-eab8-4d07-ab29-81a45fb41e04",
      organization_name: "Cedar Ridge Physical Therapy",
      table_token: "party",
      table_label: "People",
      field_count: 2,
      updated_at: null,
    });
    expect(row.name).toBe("Custom fields on People");
    expect(row.href).toBe("/data/custom-fields/party?org=0a54df90-eab8-4d07-ab29-81a45fb41e04");
    expect(dataHomeKindWord(row.kind)).toBe("Custom fields");
  });
});
