/**
 * 🚨 EVERY REFERENCE CHIP OPENS THE RECORD IT NAMES (THE DOOR LAW, no-dead-ends).
 *
 * A reference block (`{"__kind":"directive_v1_reference_<noun>","items":[…]}`)
 * renders as a chip; clicking it must reach the record. Three defects shipped
 * on this path, all the same class — the chip's door was a hand-cast item type,
 * never checked against what that type actually opens:
 *
 *   - a note chip opened the Note-info STATS panel ("0 Words, 0 Characters");
 *   - every catalog noun with no item-presentation registration (≈90 of them —
 *     tool, skill, workflow, crm_deal, hr_employee, …) rendered an ENABLED chip
 *     whose click did nothing at all;
 *   - the education nouns (fc_set, quiz_session, …) handed their id to the FILE
 *     preview, and studio sessions to a seed-only Detail panel that names the
 *     record and shows nothing of it.
 *
 * The oracle here is independent of the implementation: for every noun the
 * picker can offer (the server catalog, its aliases, and the bespoke overlay)
 * the door is either
 *   - an IN-PLACE opener that loads the record's own content (a bespoke window,
 *     or the Detail primitive with a `detailSource` / `refineDetail`) whose
 *     table is the table the chip names, or
 *   - the entity's ADDRESS: a route (open / new tab) or a registered peek,
 * or the noun is named below WITH the reason it has neither.
 */

import { CATALOG_ALIASES, CATALOG_NOUNS } from "../catalog-nouns.generated";
import { BESPOKE_REFERENCE_NOUNS, getReferenceResolver } from "../referenceResolvers";
import { referenceDoor } from "../referenceDoor";
import { getItemConfig } from "@/features/item-presentation/registry";
import { resolveEntityDoors } from "@/components/official/entity-ref/doors";

const ID = "5c3b7d1e-2f4a-4b6c-8d9e-0a1b2c3d4e5f";

/** Every identity key a reference item can carry, all pointing at ID. */
const REF: Record<string, string> = Object.fromEntries(
  [
    "id", "file_id", "list_id", "item_id", "table_id", "dataset_id", "row_id",
    "transcript_id", "scope_id", "context_item_id", "workbook_id", "sheet_id",
    "document_id", "conversation_id", "session_id",
  ].map((k) => [k, ID]),
);
Object.assign(REF, {
  column_name: "c", field_name: "c", group_name: "g", segment_index: "0",
  page_index: "1", page_number: "1", key: "k",
});

/** The opener kinds `useOpenItemPresentation` routes to a bespoke window. */
const BESPOKE_WINDOW_KINDS = new Set([
  "agent", "note", "conversation", "file", "structured_list", "picklist", "web_site",
]);

/**
 * Nouns with no route, no peek and no in-place opener on the platform today.
 * Each chip renders as an honest name (not a button). Shrink-only: adding a
 * `hrefFor` or a peek for the token turns its row red here until it is removed.
 */
const NO_DOOR_YET: Readonly<Record<string, string>> = {
  // filled from the census run — see FEATURE.md "Reference doors"
};

const NOUNS = [
  ...new Set([
    ...Object.keys(CATALOG_NOUNS),
    ...Object.keys(CATALOG_ALIASES),
    ...BESPOKE_REFERENCE_NOUNS,
  ]),
]
  .filter((n) => n !== "url") // an external link opens itself in a new tab
  .sort();

describe("every reference noun has a resolver and a real door", () => {
  it("censuses the whole catalog (a walk over nothing proves nothing)", () => {
    expect(NOUNS.length).toBeGreaterThan(120);
  });

  it.each(NOUNS)("%s", (noun) => {
    const resolver = getReferenceResolver(noun);
    expect(resolver).toBeDefined();
    const door = referenceDoor(noun, REF);
    const why = NO_DOOR_YET[noun];
    if (why) {
      expect(door.kind).toBe("none");
      return;
    }
    if (door.kind === "open") {
      const { config, recognized } = getItemConfig(door.itemType);
      // A registered type with an opener — never a silent no-op click.
      expect({ noun, recognized, open: !!config.open }).toEqual({ noun, recognized: true, open: true });
      // …that loads the RECORD, never a seed-only/info panel.
      const loads =
        BESPOKE_WINDOW_KINDS.has(config.open!.kind) || !!config.detailSource || !!config.refineDetail;
      expect({ noun, loads }).toEqual({ noun, loads: true });
      // …of the SAME table the chip names (education → file preview was a lie).
      const opens = resolver!.opensTable;
      if (opens && config.detailSource && door.id === REF.id) {
        const src = `${config.detailSource.schemaName ?? "public"}.${config.detailSource.table}`;
        expect({ noun, table: src }).toEqual({ noun, table: opens });
      }
      return;
    }
    if (door.kind === "address") {
      const doors = resolveEntityDoors(door.token, door.id);
      expect({ noun, reachable: !!doors.href || doors.canPeek }).toEqual({ noun, reachable: true });
      return;
    }
    throw new Error(`${noun}: no door (${door.reason}) and not listed in NO_DOOR_YET`);
  });
});
