/**
 * The monitor setup defects found in the 2026-09-29 acceptance walk, each held
 * by a test that is red on the old model and green now:
 *
 * A. a person's name (a brand alias that is a member of the organization, or a
 *    proposer item naming one) was added as a coverage keyword and a search
 *    term with nobody choosing it;
 * B. a save from the "new monitor" screen landed on an existing monitor —
 *    the body named no record, and a new opportunity-only monitor carried a
 *    shared `declared_ref`, so the server matched another row by key;
 * C. recipients: a new monitor must preselect only the person saving it;
 * D. a schedule projecting over the monthly ceiling must be warned about, with
 *    a cheaper choice named (validation offers, never blocks).
 */

import {
  acceptPersonOffer,
  applyProposal,
  initialRecipients,
  newDraft,
  nextEditorSession,
  projectSchedules,
  recipientRoster,
  scheduleCostAdvice,
  toDeclareBody,
  USER_BASIS,
  type PeopleIndex,
  type ScheduleOption,
} from "./model";

const PEOPLE: PeopleIndex = {
  names: ["Arman Sadeghi", "Arman Sadeghi", "Kelvin Kiprop", "admin"],
  refs: new Set(["fact:spokesperson-1"]),
};

const allGreen = (people: PeopleIndex = PEOPLE) =>
  newDraft({
    brandName: "All Green Recycling",
    aliases: ["all green electronics recycling", "arman sadeghi"],
    siteId: "site-1",
    timezone: "America/Los_Angeles",
    people,
  });

describe("A — setup never adds a person's name without the person choosing it", () => {
  it("keeps a person alias out of the coverage keywords and offers it instead", () => {
    const draft = allGreen();
    expect(draft.keywords.map((k) => k.keyword)).toEqual([
      "All Green Recycling",
      "all green electronics recycling",
    ]);
    expect(draft.personOffers).toEqual([
      expect.objectContaining({
        text: "arman sadeghi",
        target: "keywords",
        why: "person",
      }),
    ]);
  });

  it("offers every alias, preselecting none, when the roster could not be read", () => {
    const draft = allGreen({ names: null, refs: new Set() });
    expect(draft.keywords.map((k) => k.keyword)).toEqual([
      "All Green Recycling",
    ]);
    expect(draft.personOffers.map((o) => [o.text, o.why])).toEqual([
      ["all green electronics recycling", "unchecked"],
      ["arman sadeghi", "unchecked"],
    ]);
  });

  it("holds back proposed items that name a person or come from a spokesperson fact", () => {
    const next = applyProposal(
      allGreen(),
      {
        search_terms: [
          {
            text: "e-waste recycling",
            basis: { kind: "site_page", ref: "page:1" },
          },
          {
            text: "Arman Sadeghi",
            basis: { kind: "brand_record", ref: "brand:aliases" },
          },
          {
            text: "Jane Roe on data security",
            basis: { kind: "business_fact", ref: "fact:spokesperson-1" },
          },
        ],
        coverage_keywords: [
          {
            keyword: "arman sadeghi",
            means: "the founder",
            basis: { kind: "brand_record", ref: "brand:aliases" },
          },
        ],
      },
      PEOPLE,
    );
    expect(next.searchTerms.map((i) => i.text)).toEqual(["e-waste recycling"]);
    expect(next.keywords.map((k) => k.keyword)).not.toContain("arman sadeghi");
    expect(next.personOffers.map((o) => [o.text, o.target])).toEqual([
      ["arman sadeghi", "keywords"],
      ["Arman Sadeghi", "searchTerms"],
      ["Jane Roe on data security", "searchTerms"],
    ]);
  });

  it("adds an offered name only when the person picks it, as theirs", () => {
    const draft = allGreen();
    const picked = acceptPersonOffer(draft, draft.personOffers[0]);
    expect(picked.keywords.at(-1)).toEqual(
      expect.objectContaining({ keyword: "arman sadeghi", basis: USER_BASIS }),
    );
    expect(picked.personOffers).toEqual([]);
  });

  it("never mistakes a one-word display name for a beat about a person", () => {
    const next = applyProposal(
      allGreen(),
      {
        topics: [
          {
            text: "admin data breaches",
            basis: { kind: "site_page", ref: "page:2" },
          },
        ],
      },
      PEOPLE,
    );
    expect(next.topics.map((t) => t.text)).toEqual(["admin data breaches"]);
  });
});

describe("B — a save names its record", () => {
  const input = {
    brandId: "brand-1",
    brandKey: "all-green-recycling",
    declaredRef: {},
    xTrendsWoeids: [],
  };

  it("a new monitor's body names no record and carries no shared declared_ref", () => {
    const body = toDeclareBody(allGreen(), { ...input, trackerId: null });
    expect(body).toHaveProperty("tracker_id", null);
    expect(body.declared_ref).toEqual({});
  });

  it("an edit names exactly its record", () => {
    const body = toDeclareBody(allGreen(), {
      ...input,
      trackerId: "03dddca8-8e1b-4a83-a391-09fcd5c0d5d2",
    });
    expect(body).toHaveProperty(
      "tracker_id",
      "03dddca8-8e1b-4a83-a391-09fcd5c0d5d2",
    );
  });

  it("going from an edit to 'new' starts a fresh editor session; a new save's own id does not", () => {
    const editing = { param: "03dddca8", key: 0, adopted: null };
    const fresh = nextEditorSession(editing, null);
    expect(fresh.key).not.toBe(editing.key);
    const adopted = { ...fresh, adopted: "new-id" };
    expect(nextEditorSession(adopted, "new-id").key).toBe(fresh.key);
    expect(nextEditorSession(adopted, "some-other").key).not.toBe(fresh.key);
  });
});

describe("C — recipients", () => {
  it("a new monitor preselects only the person saving it, and saves that choice", () => {
    expect(
      initialRecipients({
        trackerId: null,
        saved: ["arman-1", "arman-2", "kelvin"],
        currentUserId: "admin",
      }),
    ).toEqual({ recipients: ["admin"], commitOnSave: true });
  });

  it("a saved monitor shows its own recipients, each once", () => {
    expect(
      initialRecipients({
        trackerId: "t1",
        saved: ["a", "a", "b"],
        currentUserId: "admin",
      }),
    ).toEqual({ recipients: ["a", "b"], commitOnSave: false });
  });

  it("lists each person once, the saver first", () => {
    const roster = recipientRoster(
      [
        { userId: "arman" },
        { userId: "kelvin" },
        { userId: "arman" },
        { userId: "admin" },
      ],
      "admin",
    );
    expect(roster.map((m) => m.userId)).toEqual(["admin", "arman", "kelvin"]);
  });
});

describe("D — a schedule over the ceiling is warned about, with a cheaper choice", () => {
  const presets: ScheduleOption[] = [
    {
      id: "twice_daily",
      label: "7am and 2pm",
      runsPerMonth: 60,
      recommended: true,
    },
    {
      id: "daily",
      label: "Every morning at 7am",
      runsPerMonth: 30,
      recommended: false,
    },
    {
      id: "hourly",
      label: "Every hour",
      runsPerMonth: 720,
      recommended: false,
    },
    { id: "off", label: "No schedule", runsPerMonth: 0, recommended: false },
  ];

  it("warns at the acceptance numbers and says no scheduled choice fits", () => {
    const projections = projectSchedules(presets, 1.2464, 25);
    const advice = scheduleCostAdvice(projections, "twice_daily");
    expect(advice?.chosen.monthlyUsd).toBeCloseTo(74.784);
    expect(advice?.cheaper).toBeNull();
  });

  it("names the scheduled choice with the most runs that fits", () => {
    const advice = scheduleCostAdvice(
      projectSchedules(presets, 0.5, 25),
      "twice_daily",
    );
    expect(advice?.cheaper?.presetId).toBe("daily");
  });

  it("says nothing when the choice fits, or when there is no ceiling", () => {
    expect(
      scheduleCostAdvice(projectSchedules(presets, 0.2, 25), "twice_daily"),
    ).toBeNull();
    expect(
      scheduleCostAdvice(projectSchedules(presets, 5, 0), "hourly"),
    ).toBeNull();
  });
});
