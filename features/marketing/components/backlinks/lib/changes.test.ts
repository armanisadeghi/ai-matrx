/**
 * Unit contract for the pure link-change helpers: the verdict sentence per
 * change kind (including the multi-anchor case and the unknown-kind fallback),
 * the tone vocabulary, the severity cut points, and the jsonb narrower's
 * behaviour on missing, null, and wrong-typed fields.
 */
import type { Json } from "@/types/database.types";
import {
  BACKLINK_CHANGE_KINDS,
  CHANGE_ALERT_SEVERITY_FLOOR,
  CHANGE_KIND_LABELS,
  CHANGE_SEVERITY_BAD_MIN,
  CHANGE_TONE_STATUS,
  backlinkChangeKindLabel,
  changeVerdict,
  isBacklinkChangeKind,
  parseBacklinkChangeValue,
  severityTone,
  type BacklinkChangeVerdictInput,
} from "./changes";

function value(patch: Record<string, Json> = {}): Json {
  return {
    anchor_text: "example anchor",
    anchor_texts: ["example anchor"],
    is_dofollow: true,
    is_live: true,
    target_url: "https://example.com/pricing",
    instance_count: 1,
    first_seen_at: "2026-01-01T00:00:00Z",
    last_seen_at: "2026-08-01T00:00:00Z",
    lost_at: null,
    observation_id: "obs-1",
    run_key: "run-1",
    ...patch,
  };
}

function event(
  patch: Partial<BacklinkChangeVerdictInput> = {},
): BacklinkChangeVerdictInput {
  return {
    change_kind: "lost",
    source_domain: "publisher.com",
    target_url: "https://example.com/pricing",
    previous_value: value(),
    current_value: value(),
    ...patch,
  };
}

describe("change kind vocabulary", () => {
  it("labels every declared kind and recognizes only those", () => {
    for (const kind of BACKLINK_CHANGE_KINDS) {
      expect(isBacklinkChangeKind(kind.key)).toBe(true);
      expect(CHANGE_KIND_LABELS[kind.key]).toBe(kind.label);
      expect(backlinkChangeKindLabel(kind.key)).toBe(kind.label);
    }
    expect(isBacklinkChangeKind("teleported")).toBe(false);
    expect(isBacklinkChangeKind(null)).toBe(false);
  });

  it("never renders a raw machine value or an empty label", () => {
    // An unmapped kind from a newer server still reads as words.
    expect(backlinkChangeKindLabel("source_page_teleported")).toBe(
      "source page teleported",
    );
    expect(backlinkChangeKindLabel(null)).toBe("Something changed");
  });

  it("maps every tone to a status token StatusBadge understands", () => {
    expect(CHANGE_TONE_STATUS.good).toBe("complete");
    expect(CHANGE_TONE_STATUS.warning).toBe("warning");
    expect(CHANGE_TONE_STATUS.bad).toBe("critical");
    expect(CHANGE_TONE_STATUS.default).toBe("");
  });
});

describe("severityTone", () => {
  it("uses the alert floor and the bad cut point, inclusively", () => {
    expect(severityTone(CHANGE_SEVERITY_BAD_MIN)).toBe("bad");
    expect(severityTone(CHANGE_SEVERITY_BAD_MIN - 1)).toBe("warning");
    expect(severityTone(CHANGE_ALERT_SEVERITY_FLOOR)).toBe("warning");
    expect(severityTone(CHANGE_ALERT_SEVERITY_FLOOR - 1)).toBe("default");
    expect(severityTone(0)).toBe("default");
  });

  it("treats a missing severity as no opinion, never as urgent", () => {
    expect(severityTone(null)).toBe("default");
    expect(severityTone(undefined)).toBe("default");
  });

  it("puts the documented server severities on the right side of the floor", () => {
    // lost-dofollow 90 / source_page_dead 85 / dofollow_lost 80 are alarms;
    // anchor_changed 40 and appeared-dofollow 30 are not.
    expect(severityTone(90)).toBe("bad");
    expect(severityTone(85)).toBe("bad");
    expect(severityTone(80)).toBe("bad");
    expect(severityTone(70)).toBe("warning");
    expect(severityTone(65)).toBe("warning");
    expect(severityTone(40)).toBe("default");
    expect(severityTone(30)).toBe("default");
  });
});

describe("parseBacklinkChangeValue", () => {
  it("reads a fully populated value", () => {
    const parsed = parseBacklinkChangeValue(value());
    expect(parsed).toEqual({
      anchorText: "example anchor",
      anchorTexts: ["example anchor"],
      isDofollow: true,
      isLive: true,
      targetUrl: "https://example.com/pricing",
      instanceCount: 1,
      firstSeenAt: "2026-01-01T00:00:00Z",
      lastSeenAt: "2026-08-01T00:00:00Z",
      lostAt: null,
      observationId: "obs-1",
      runKey: "run-1",
    });
  });

  it("returns an all-empty value for null, a non-object, or an array", () => {
    for (const input of [null, undefined, "nope" as unknown as Json, [] as Json]) {
      const parsed = parseBacklinkChangeValue(input as Json);
      expect(parsed.anchorText).toBeNull();
      expect(parsed.anchorTexts).toEqual([]);
      expect(parsed.isDofollow).toBeNull();
      expect(parsed.isLive).toBeNull();
      expect(parsed.targetUrl).toBeNull();
      expect(parsed.instanceCount).toBeNull();
    }
  });

  it("nulls missing, null, empty-string, and wrong-typed fields", () => {
    const parsed = parseBacklinkChangeValue({
      anchor_text: "",
      is_dofollow: "yes",
      is_live: null,
      target_url: null,
      instance_count: "3",
    } as Json);
    expect(parsed.anchorText).toBeNull();
    expect(parsed.isDofollow).toBeNull();
    expect(parsed.isLive).toBeNull();
    expect(parsed.targetUrl).toBeNull();
    expect(parsed.instanceCount).toBeNull();
    expect(parsed.lastSeenAt).toBeNull();
  });

  it("keeps every anchor when a page links more than once", () => {
    const parsed = parseBacklinkChangeValue(
      value({
        anchor_text: "our pricing",
        anchor_texts: ["our pricing", "see the plans", 42 as unknown as Json],
        instance_count: 3,
      }),
    );
    expect(parsed.anchorTexts).toEqual(["our pricing", "see the plans"]);
    expect(parsed.anchorText).toBe("our pricing");
    expect(parsed.instanceCount).toBe(3);
  });

  it("derives anchorTexts from a lone anchor_text, and anchorText from a lone list", () => {
    expect(
      parseBacklinkChangeValue({ anchor_text: "solo" } as Json).anchorTexts,
    ).toEqual(["solo"]);
    expect(
      parseBacklinkChangeValue({ anchor_texts: ["first", "second"] } as Json)
        .anchorText,
    ).toBe("first");
  });
});

describe("changeVerdict", () => {
  it("names the publisher and the consequence when a link is lost", () => {
    const verdict = changeVerdict(event({ change_kind: "lost" }));
    expect(verdict.headline).toBe("publisher.com removed your link");
    expect(verdict.detail).toContain("passed ranking value");
    expect(verdict.tone).toBe("bad");
  });

  it("softens a lost nofollow link — the loss is visitors, not rankings", () => {
    const verdict = changeVerdict(
      event({
        change_kind: "lost",
        previous_value: value({ is_dofollow: false }),
      }),
    );
    expect(verdict.detail).toContain("did not pass ranking value");
    expect(verdict.tone).toBe("warning");
  });

  it("states the dofollow_lost verdict without the word nofollow doing the work", () => {
    const verdict = changeVerdict(event({ change_kind: "dofollow_lost" }));
    expect(verdict.headline).toBe(
      "publisher.com switched your link to nofollow",
    );
    expect(verdict.detail).toContain(
      "Still on the page, but it no longer passes ranking value",
    );
    expect(verdict.tone).toBe("bad");
  });

  it("quotes both sides of a wording change", () => {
    const verdict = changeVerdict(
      event({
        change_kind: "anchor_changed",
        previous_value: value({
          anchor_text: "best CRM software",
          anchor_texts: ["best CRM software"],
        }),
        current_value: value({
          anchor_text: "click here",
          anchor_texts: ["click here"],
        }),
      }),
    );
    expect(verdict.headline).toBe(
      "publisher.com changed the words your link is written with",
    );
    expect(verdict.detail).toContain("“best CRM software”");
    expect(verdict.detail).toContain("“click here”");
    expect(verdict.tone).toBe("warning");
  });

  it("says how many links the page carries when several anchors changed", () => {
    const verdict = changeVerdict(
      event({
        change_kind: "anchor_changed",
        previous_value: value({
          anchor_texts: ["our pricing", "see the plans"],
          instance_count: 2,
        }),
        current_value: value({
          anchor_texts: ["pricing", "plans", "read more"],
          instance_count: 3,
        }),
      }),
    );
    expect(verdict.headline).toBe(
      "publisher.com changed the words your links are written with",
    );
    expect(verdict.detail).toContain("all 3 links");
    expect(verdict.detail).toContain("“our pricing”, “see the plans”");
    expect(verdict.detail).toContain("“pricing”, “plans”, “read more”");
  });

  it("says 'both links' for exactly two", () => {
    const verdict = changeVerdict(
      event({
        change_kind: "anchor_changed",
        previous_value: value({ anchor_texts: ["a", "b"] }),
        current_value: value({ anchor_texts: ["c", "d"] }),
      }),
    );
    expect(verdict.detail).toContain("both links");
  });

  it("survives a wording change with nothing recorded on either side", () => {
    const verdict = changeVerdict(
      event({
        change_kind: "anchor_changed",
        previous_value: null as unknown as Json,
        current_value: {} as Json,
      }),
    );
    expect(verdict.detail).toContain("nothing at all");
    expect(verdict.detail).not.toContain("undefined");
    expect(verdict.detail).not.toContain("null");
  });

  it("reads a target change as pages, not URLs", () => {
    const verdict = changeVerdict(
      event({
        change_kind: "target_changed",
        previous_value: value({ target_url: "https://example.com/pricing" }),
        current_value: value({ target_url: "https://example.com/" }),
      }),
    );
    expect(verdict.detail).toContain("/pricing");
    // A bare origin reads as the site name, never as a lone slash.
    expect(verdict.detail).toContain("example.com");
    expect(verdict.tone).toBe("warning");
  });

  it("falls back to the row's target_url when the value side has none", () => {
    const verdict = changeVerdict(
      event({
        change_kind: "target_changed",
        target_url: "https://example.com/plans",
        previous_value: value({ target_url: "https://example.com/pricing" }),
        current_value: value({ target_url: null }),
      }),
    );
    expect(verdict.detail).toContain("/plans");
  });

  it("calls good news good", () => {
    expect(changeVerdict(event({ change_kind: "appeared" })).tone).toBe("good");
    expect(changeVerdict(event({ change_kind: "restored" })).tone).toBe("good");
    expect(changeVerdict(event({ change_kind: "dofollow_gained" })).tone).toBe(
      "good",
    );
    expect(
      changeVerdict(event({ change_kind: "source_page_recovered" })).tone,
    ).toBe("good");
  });

  it("distinguishes a new dofollow link from a new nofollow one", () => {
    expect(
      changeVerdict(
        event({
          change_kind: "appeared",
          current_value: value({ is_dofollow: false }),
        }),
      ).detail,
    ).toContain("still send you visitors");
    expect(
      changeVerdict(event({ change_kind: "appeared" })).detail,
    ).toContain("passes ranking value");
  });

  it("reports a dead or redirected source page as the page, not the link", () => {
    expect(
      changeVerdict(event({ change_kind: "source_page_dead" })).headline,
    ).toBe("The page on publisher.com that linked to you is gone");
    expect(changeVerdict(event({ change_kind: "source_page_dead" })).tone).toBe(
      "bad",
    );
    expect(
      changeVerdict(event({ change_kind: "source_page_redirected" })).headline,
    ).toBe("The page on publisher.com that linked to you now redirects");
  });

  it("gives every declared kind a non-empty verdict in plain language", () => {
    for (const kind of BACKLINK_CHANGE_KINDS) {
      const verdict = changeVerdict(event({ change_kind: kind.key }));
      expect(verdict.headline.length).toBeGreaterThan(0);
      expect(verdict.detail.length).toBeGreaterThan(0);
      // A machine value must never reach the screen.
      expect(verdict.headline).not.toContain(kind.key);
      expect(verdict.headline).not.toContain("_");
    }
  });

  it("stays honest about a kind it has no wording for", () => {
    const verdict = changeVerdict(event({ change_kind: "teleported" }));
    expect(verdict.headline).toBe(
      "Something about your link on publisher.com changed",
    );
    expect(verdict.tone).toBe("default");
  });

  it("never renders an empty publisher name", () => {
    const verdict = changeVerdict(
      event({ change_kind: "lost", source_domain: "" }),
    );
    expect(verdict.headline).toBe("The linking site removed your link");
  });
});
