// features/masterwork/browse/approach-state.test.ts
//
// THE ONE PREDICATE GUARD.
//
// Census defect (masterwork-methods-census REGISTER.md, row 10): the Vision
// Interview row is `enabled=false` in `platform.approach` while its
// `metadata.availability` says `available` — and it rendered under "Ready
// now" anyway, because the catalog sectioned cards on `availability` alone
// while a SECOND, different rule (`hrefFor`) decided whether the card had
// anywhere to go. Two rules for one card is how a card lies about itself.
//
// From here every surface asks ONE function — `approachState` — and gets the
// section, the door and the clickability together. A card can never again say
// "Ready now" while having no door, and can never again render as a button
// with no click.

import type { DistillationApproach } from "./approaches";
import { approachState, startableApproaches } from "./approaches";

function approach(over: Partial<DistillationApproach> = {}): DistillationApproach {
  return {
    id: "id-1",
    key: "example",
    label: "An Approach",
    blurb: "blurb",
    whatItNeeds: "needs",
    costTimeShape: "minutes",
    mandateKey: "masterwork.example",
    intakeQuery: { ingest: "source" },
    sortOrder: 10,
    enabled: true,
    availability: "available",
    launchHref: null,
    catalogNumber: null,
    ...over,
  };
}

describe("approachState — one predicate for one card", () => {
  it("a live funnel lane is ready, clickable, and routes to the guided start", () => {
    const state = approachState(approach({ key: "source" }));
    expect(state).toEqual({
      status: "ready",
      href: "/masterwork/new?approach=source",
      reachable: true,
    });
  });

  it("an approach with its own page is ready through launch_href", () => {
    const state = approachState(
      approach({
        key: "vision_interview",
        intakeQuery: {},
        launchHref: "/masterwork/vision-interview/new",
      }),
    );
    expect(state).toEqual({
      status: "ready",
      href: "/masterwork/vision-interview/new",
      reachable: true,
    });
  });

  // THE CENSUS ROW 10 CASE. Whatever the registry says about availability, a
  // row that is not enabled is not "Ready now".
  it("enabled=false never renders as Ready now, even when availability says available", () => {
    const state = approachState(
      approach({ key: "vision_interview", enabled: false, launchHref: "/x" }),
    );
    expect(state.status).not.toBe("ready");
    expect(state.status).toBe("partial");
  });

  // THE DEAD-BUTTON CASE. `available` with no door used to render as a
  // <button> with no onSelect: a click that does nothing, forever.
  it("available with no door is never reachable and never ready", () => {
    const state = approachState(
      approach({ enabled: false, intakeQuery: {}, launchHref: null }),
    );
    expect(state).toEqual({ status: "partial", href: null, reachable: false });
  });

  it("an enabled approach with no lane and no page is still not ready", () => {
    const state = approachState(approach({ intakeQuery: {}, launchHref: null }));
    expect(state.status).toBe("partial");
    expect(state.reachable).toBe(false);
  });

  it("partial availability stays partial even with a working door", () => {
    const state = approachState(
      approach({ key: "oracle_tap", enabled: false, intakeQuery: {}, launchHref: "/chat" }),
    );
    expect(state).toEqual({ status: "partial", href: "/chat", reachable: true });
  });

  it("coming soon is inert: no status lie, no door, no click", () => {
    const state = approachState(
      approach({ availability: "coming_soon", enabled: false, intakeQuery: {}, launchHref: "/chat" }),
    );
    expect(state).toEqual({ status: "coming_soon", href: null, reachable: false });
  });

  it("every reachable card has a door and every unreachable card has none", () => {
    const rows = [
      approach({ key: "a" }),
      approach({ key: "b", enabled: false, intakeQuery: {} }),
      approach({ key: "c", availability: "coming_soon", enabled: false, intakeQuery: {} }),
      approach({ key: "d", intakeQuery: {}, launchHref: "/d" }),
    ];
    for (const row of rows) {
      const state = approachState(row);
      expect(state.reachable).toBe(state.href !== null);
    }
  });
});

describe("startableApproaches — the guided funnel needs a LANE, not a flag", () => {
  // The `timeline` class (census row 3) and the Vision Interview class are the
  // same bug from two sides: the funnel's Start builds its URL out of
  // `intake_query`, so an Approach with no `intake_query` dumps the Expert on
  // a bare Rulebook page. Being enabled is not enough — it must have a lane.
  it("excludes an approach whose door is its own page, not a funnel lane", () => {
    const rows = [
      approach({ key: "source" }),
      approach({
        key: "vision_interview",
        intakeQuery: {},
        launchHref: "/masterwork/vision-interview/new",
      }),
    ];
    expect(startableApproaches(rows).map((a) => a.key)).toEqual(["source"]);
  });

  it("excludes a disabled approach even when it has a lane", () => {
    const rows = [approach({ key: "source" }), approach({ key: "off", enabled: false })];
    expect(startableApproaches(rows).map((a) => a.key)).toEqual(["source"]);
  });
});
