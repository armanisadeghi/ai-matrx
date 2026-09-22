// 🚨 F-63 — THE CENSUS BEHIND THE OPEN DISCRIMINANT.
//
// `useOpenItemPresentation` refuses to open anything (`return false`) when a
// type's registration carries no `open` discriminant — the button never even
// renders, so the whole card silently does nothing. Lane F-58 found exactly
// that for `google_document` and `calendar_event`: an agent-emitted card for a
// connected Google file or a synced calendar event could not be clicked open,
// with nothing in the console or the UI saying why (law 4).
//
// The class rule: every type this registry knows about either declares `open`
// (so a click opens something — the Detail primitive by default, a bespoke
// window when one exists) or is named in the allow-list below WITH the reason
// it stays closed. A type falling through both is the same defect the two
// Google types shipped with, and this test is red on it.
//
// Red on HEAD (pre-fix), naming `google_document` and `calendar_event`; green
// once their registrations (`features/google-workspace/documents/itemType.tsx`,
// `features/google-workspace/calendar/itemType.tsx`) declare `open`.

import { getItemConfig } from "../registry";
import type { KnownItemType } from "../types";

/**
 * Every key the registry declares (`REGISTRY` in `registry.tsx`). Kept as a
 * literal list rather than imported from the map's keys so a type this
 * registry silently drops still shows up here as a name the census expects to
 * find `recognized: true` for — a stronger check than reading the map's own
 * keys back at itself.
 */
const ALL_REGISTERED_TYPES: KnownItemType[] = [
  "agent",
  "app",
  "research_template",
  "note",
  "task",
  "project",
  "scope_type",
  "scope",
  "context_item",
  "image",
  "video",
  "audio",
  "file",
  "session",
  "table",
  "structured_list",
  "picklist",
  "workbook",
  "document",
  "conversation",
  "message",
  "email",
  "party",
  "google_document",
  "calendar_event",
  // F-87 — a Marketing site. The token existed everywhere EXCEPT here, so
  // nothing could open one in place.
  "web_site",
];

/**
 * Types that deliberately stay closed, with the reason. Empty today: `session`
 * has no single canonical table (`the-sourceless-census` test) but it still
 * declares `open: { kind: "session" }` and opens the Detail primitive
 * seed-only — every registered type opens.
 */
const DELIBERATELY_CLOSED: Readonly<Record<string, string>> = {};

describe("every registered item type opens, or says on the record why not", () => {
  it("has something to census (a walk over zero types proves nothing)", () => {
    expect(ALL_REGISTERED_TYPES.length).toBeGreaterThanOrEqual(20);
  });

  for (const type of ALL_REGISTERED_TYPES) {
    const closedReason = DELIBERATELY_CLOSED[type];
    if (closedReason) {
      it(`${type} stays closed on purpose: ${closedReason}`, () => {
        const { config } = getItemConfig(type);
        expect(config.open).toBeUndefined();
      });
      continue;
    }
    it(`${type} declares an \`open\` discriminant so a card for it can be clicked open`, () => {
      const { config, recognized } = getItemConfig(type);
      expect(recognized).toBe(true);
      expect(config.open).toBeDefined();
    });
  }

  // 🚨 F-87 — RED on HEAD: `getItemConfig("web_site").recognized` was `false`
  // and `config.open` undefined, so `useOpenItemPresentation` refused, F-86's
  // marketing door rendered nothing, and `/detail/web_site/<id>` said nothing
  // about a fully stored record. The census above is red on it; this names it.
  it("web_site opens through the Detail primitive, on the canonical token", () => {
    const { config, recognized } = getItemConfig("web_site");
    expect(recognized).toBe(true);
    expect(config.open).toEqual({ kind: "web_site" });
    // The item type IS the entity token — never a twin spelled `site`.
    expect(config.entityToken).toBeUndefined();
    expect(getItemConfig("site").recognized).toBe(false);
  });

  it("google_document and calendar_event open through the Detail primitive", () => {
    expect(getItemConfig("google_document").config.open).toEqual({
      kind: "google_document",
    });
    expect(getItemConfig("calendar_event").config.open).toEqual({
      kind: "calendar_event",
    });
  });
});
