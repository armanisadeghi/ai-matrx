/**
 * Dated changes on the attention dock: a refused, failed, overdue, drifting or zone-unconfirmed
 * change can NOT be muted (no mute at all — not a disabled one), no stale local mute hides it,
 * and a scheduled / upcoming / applied change can be muted in this browser. Every refusal names
 * both values. (DATED-CHANGES-ATTACK B4.)
 */

import { buildAttentionNotice, partitionItems } from "../build-notice";
import { datedChangeItems } from "../sources/dated-changes";
import type { AttentionSourceState } from "../types";
import type { DatedChange } from "@/features/admin/dated-changes/service";
import { describeDatedChange, formatEffective, formatPricing } from "@/features/admin/dated-changes/describe";

const NOW = Date.parse("2026-09-28T22:00:00Z");
const TODAY = [{ max_tokens: null, input_price: 0.75, output_price: 3.75, cached_input_price: 0.075 }];
const NEXT = [{ max_tokens: null, input_price: 1.5, output_price: 7.5, cached_input_price: 0.15 }];

function change(over: Partial<DatedChange>): DatedChange {
  return {
    id: "c1",
    organizationId: "o",
    target: "ai.offering.pricing",
    targetRowId: "r",
    targetLabel: "gemini-3.8-flash",
    expected: TODAY,
    newValue: NEXT,
    currentValue: TODAY,
    projectedExpected: TODAY,
    drift: false,
    effectiveLocal: "2027-01-01T00:00:00",
    timeZone: "America/Los_Angeles",
    effectiveAt: "2027-01-01T08:00:00Z",
    effectiveNote: null,
    status: "scheduled",
    outcome: {},
    appliedAt: null,
    reason: "Introductory price ends.",
    sourceUrl: "https://ai.google.dev/gemini-api/docs/pricing",
    createdAt: "2026-09-28T21:00:00Z",
    resolvedAt: null,
    resolutionNote: null,
    attention: "upcoming",
    mutable: true,
    ...over,
  };
}

const deps = () => ({ muteLocally: jest.fn(), unmuteLocally: jest.fn(), now: NOW });

function source(items: ReturnType<typeof datedChangeItems>): AttentionSourceState {
  return {
    id: "dated-changes",
    label: "Dated changes",
    items,
    status: "ok",
    error: null,
    loud: true,
    summarize: () => null,
    review: null,
    refetch: () => undefined,
  };
}

describe("dated change attention items", () => {
  it.each(["refused", "failed", "overdue", "drift", "zone_unconfirmed"] as const)(
    "%s has no mute and a local mute cannot hide it",
    (attention) => {
      const [item] = datedChangeItems([change({ attention, mutable: false, status: attention === "refused" || attention === "failed" ? attention : "scheduled" })], deps());
      expect(item.mute).toBeNull();
      const { live, muted } = partitionItems([item], { [item.key]: NOW + 3_600_000 }, NOW);
      expect(live).toHaveLength(1);
      expect(muted).toHaveLength(0);
    },
  );

  it("a change whose time zone was never stated, inside its lead window, alerts with the ask and a door to set it", () => {
    const [item] = datedChangeItems(
      [change({ attention: "zone_unconfirmed", timeZone: null, mutable: false, effectiveAt: "2026-10-03T00:00:00Z", effectiveLocal: "2026-10-03T00:00:00" })],
      deps(),
    );
    expect(item).toBeDefined();
    expect(item.sentence).toContain("Confirm the time zone this change uses");
    expect(item.record?.href).toBe("/administration/automation/scheduling/dated-changes#c1");
    expect(item.mute).toBeNull();
  });

  it("a scheduled change can be muted locally, and the mute hides it", async () => {
    const d = deps();
    const [item] = datedChangeItems([change({})], d);
    expect(item.mute?.scope).toBe("local");
    await item.mute?.apply(NOW + 3_600_000, null);
    expect(d.muteLocally).toHaveBeenCalledWith(item.key, 3_600_000);
    expect(partitionItems([item], { [item.key]: NOW + 3_600_000 }, NOW).live).toHaveLength(0);
  });

  it("the database's `mutable: false` wins even for a normally mutable kind", () => {
    const [item] = datedChangeItems([change({ attention: "upcoming", mutable: false })], deps());
    expect(item.mute).toBeNull();
  });

  it("a quiet change (attention null) is not on the dock", () => {
    expect(datedChangeItems([change({ attention: null })], deps())).toEqual([]);
  });

  it("refused and failed are critical; the notice is destructive", () => {
    const items = datedChangeItems(
      [change({ id: "a", attention: "refused", status: "refused", mutable: false }), change({ id: "b" })],
      deps(),
    );
    const notice = buildAttentionNotice([source(items)], {}, NOW);
    expect(notice?.tone).toBe("destructive");
    expect(notice?.criticalCount).toBe(1);
  });
});

describe("dated change words", () => {
  it("formats prices and the date the way the source stated it", () => {
    expect(formatPricing(TODAY)).toBe("$0.75 in / $3.75 out / $0.075 cached");
    expect(formatEffective(change({}))).toBe("January 1, 2027 (America/Los Angeles)");
    expect(formatEffective(change({ timeZone: null }))).toBe(
      "January 1, 2027 (no time zone stated — read as UTC for now)",
    );
  });

  it("a refusal names the expected AND the observed price and is not dismissible", () => {
    const words = describeDatedChange(
      change({
        attention: "refused",
        status: "refused",
        mutable: false,
        outcome: { reason: "drift", observed: [{ input_price: 0.9, output_price: 3.75 }], sentence: "The price today is not the price this change expected, so nothing was changed." },
      }),
      NOW,
    );
    expect(words.sentence).toContain("Expected $0.75 in / $3.75 out / $0.075 cached");
    expect(words.sentence).toContain("found $0.90 in / $3.75 out");
    expect(words.dismissible).toBe(false);
    expect(words.severity).toBe("critical");
  });

  it("a late apply says how late and that calls were costed at the old price", () => {
    const words = describeDatedChange(
      change({ attention: "applied", status: "applied", appliedAt: "2026-09-28T21:00:00Z", outcome: { lag_seconds: 7200 } }),
      NOW,
    );
    expect(words.sentence).toContain("2 hours late");
    expect(words.sentence).toContain("costed at the old price");
  });

  it("an unconfirmed time zone says so in words", () => {
    const words = describeDatedChange(change({ attention: "zone_unconfirmed", timeZone: null, mutable: false }), NOW);
    expect(words.sentence).toContain("names no time zone");
    expect(words.dismissible).toBe(false);
  });
});
