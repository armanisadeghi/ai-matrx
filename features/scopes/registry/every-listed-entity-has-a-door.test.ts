/**
 * 🚨 EVERY LISTED ENTITY OPENS, OR THE GAP IS COUNTED — THE DOOR LAW, AS A GATE.
 *
 * THE DEFECT THIS CLOSES (lane F-93, hostile verifier V-22, NEW-6). The entity
 * overlay learned `calendar_event` and `google_document` because a verifier
 * named those two tokens; nothing asked the general question. Live
 * `platform.entity_types` marks 99 tokens `is_active` AND `is_listed` — every
 * one of them is a record a list UI puts a person in front of — and 82 of them
 * had no door in ANY of the three forms the platform ships. Two were live synced
 * entities whose rows a person can see today.
 *
 * WHERE THE LISTED SET COMES FROM. `ENTITY_TYPE_METADATA` in
 * `@ai-matrx/associations` is GENERATED from `platform.entity_types` — the same
 * row the database uses to decide the token is listed. This file therefore has
 * no list of its own to go stale: a token registered as listed in the DB reaches
 * this guard on the next package release, and the guard fails until someone
 * gives it a door or records the gap in `listed-entity-doors.ts`.
 *
 * WHY IT ASKS THREE QUESTIONS, NOT ONE. A door is an address (`hrefFor`), a peek,
 * or an in-place opener; any one of them satisfies the law, and a guard that
 * only looked for `hrefFor` would demand a route for records that correctly open
 * in place (R35: both forms are required of a record that has both, but a
 * record with a peek and no route is not a dead end).
 */

import { getEntityInfo } from "./entityRegistry";
import {
  DOORLESS_BASELINE,
  DOORLESS_LISTED_ENTITIES,
  DOORLESS_REASONS,
  type DoorlessReason,
} from "./listed-entity-doors";
import { ENTITY_TYPE_METADATA, type EntityTypeToken } from "@ai-matrx/associations";
import { hasPeek } from "@/features/organizations/peek/kinds-list";
import { getItemConfig } from "@/features/item-presentation/registry";

/**
 * The generated metadata's keys ARE the token union (both are emitted from
 * `platform.entity_types` by the same generator), so this is the listed set with
 * no hand-written list anywhere in the chain.
 */
const LISTED = (Object.keys(ENTITY_TYPE_METADATA) as EntityTypeToken[])
  .filter((token) => ENTITY_TYPE_METADATA[token].isListed)
  .sort();

/** The three door forms, asked of the real resolvers — never of a copy. */
function doorsFor(token: EntityTypeToken): string[] {
  const doors: string[] = [];
  if (typeof getEntityInfo(token).hrefFor === "function") doors.push("address");
  if (hasPeek(token)) doors.push("peek");
  const { config, recognized } = getItemConfig(token);
  if (recognized && (config.open || config.detailSource)) doors.push("in place");
  return doors;
}

describe("the listed set this guard measures", () => {
  it("is read from the generated registry metadata, so it cannot go stale here", () => {
    expect(LISTED.length).toBeGreaterThan(90);
    // The two tokens lane F-93 gave doors to are in it — if either stopped being
    // a listed entity, the doors below would be measuring nothing.
    expect(LISTED).toContain("media_source_library");
    expect(LISTED).toContain("web_youtube_video");
  });
});

describe("every listed entity has a door, or the gap is counted", () => {
  for (const token of LISTED) {
    const recorded = DOORLESS_LISTED_ENTITIES[token];
    it(`${token}${recorded ? " — counted as doorless" : ""}`, () => {
      const doors = doorsFor(token);
      if (doors.length === 0 && !recorded) {
        throw new Error(
          `\`${token}\` is an ACTIVE, LISTED entity with no door: no \`hrefFor\` ` +
            "in ENTITY_OVERLAY (features/scopes/registry/entityRegistry.ts), no " +
            "registered peek (features/organizations/peek/kinds-list.ts), and no " +
            "`open`/`detailSource` in features/item-presentation/registry.tsx. A " +
            "list UI names this record and nothing can open it (THE DOOR LAW). " +
            "Remedy: give it one of the three — or, if the door genuinely cannot " +
            "be built yet, add it to DOORLESS_LISTED_ENTITIES in " +
            "features/scopes/registry/listed-entity-doors.ts with the reason AND " +
            "raise DOORLESS_BASELINE in the same change, which is a decision, not " +
            "a formality.",
        );
      }
      expect(`${token}: ${doors.length > 0 || Boolean(recorded)}`).toBe(`${token}: true`);
    });
  }
});

/** The census's own keys, as tokens — the ledger is keyed by the token union. */
const CENSUS_TOKENS = Object.keys(DOORLESS_LISTED_ENTITIES) as EntityTypeToken[];

describe("the doorless census stays honest", () => {
  it("names only tokens that are still listed entities", () => {
    const notListed = CENSUS_TOKENS.filter((token) => !LISTED.includes(token));
    expect(notListed).toEqual([]);
  });

  it("holds no entry whose token has since GAINED a door", () => {
    const stale = CENSUS_TOKENS.filter((token) => doorsFor(token).length > 0).sort();
    // A stale entry is worse than no entry: it says a record cannot be opened
    // while it can, so the next reader stops looking for the door that exists.
    expect(stale).toEqual([]);
  });

  it("only ever shrinks", () => {
    expect(CENSUS_TOKENS.length).toBeLessThanOrEqual(DOORLESS_BASELINE);
  });

  it("gives every entry a reason that says something", () => {
    for (const token of CENSUS_TOKENS) {
      const reason = DOORLESS_LISTED_ENTITIES[token];
      expect(`${token}: ${reason !== undefined && reason in DOORLESS_REASONS}`).toBe(
        `${token}: true`,
      );
      expect(DOORLESS_REASONS[reason as DoorlessReason].length).toBeGreaterThan(60);
    }
  });
});

describe("the two doors lane F-93 put on (V-22 NEW-6)", () => {
  it("a Source Library opens its OWN screen, not a generic record page", () => {
    // `/libraries/<id>` → LibraryPage → `GET /media/libraries/{id}`, which loads
    // this exact `media.source_library` row. A registry door never invents a
    // second presentation when the canonical one already exists.
    expect(getEntityInfo("media_source_library").hrefFor?.("lib-1")).toBe(
      "/libraries/lib-1",
    );
  });

  it("a synced YouTube video opens the Detail primitive, which really reads its table", () => {
    expect(getEntityInfo("web_youtube_video").hrefFor?.("vid-1")).toBe(
      "/detail/web_youtube_video/vid-1",
    );
    // The address must resolve to something: the page presentation shows a
    // record only when the item registry knows where the row lives.
    expect(getItemConfig("web_youtube_video").config.detailSource).toMatchObject({
      table: "youtube_video",
      schemaName: "web",
      titleField: "title",
    });
    expect(getItemConfig("web_youtube_video").config.open).toEqual({
      kind: "web_youtube_video",
    });
  });

  it("neither token is left in the doorless census", () => {
    expect("media_source_library" in DOORLESS_LISTED_ENTITIES).toBe(false);
    expect("web_youtube_video" in DOORLESS_LISTED_ENTITIES).toBe(false);
  });
});
