import type {
  BacklinkDimensionRow,
  BacklinkObservationRow,
  BacklinkSnapshotRow,
} from "@/features/marketing/data/backlinks-types";
import {
  BACKLINK_ASSISTANT_SLOT,
  buildBacklinksAssistCandidates,
  type BacklinksAssistSweepState,
} from "./backlinks-assists-producer";
import { describeAssistAction } from "@/features/assists/runtime/action-descriptors";

function snapshot(
  overrides: Partial<BacklinkSnapshotRow> = {},
): BacklinkSnapshotRow {
  return {
    broken_backlinks: null,
    created_at: "2026-08-12T12:00:00.000Z",
    created_by: "user-1",
    dataset: "backlinks",
    dedup_key: "snapshot-1",
    dofollow_backlinks: 70,
    extras: {},
    id: "snapshot-1",
    lost_backlinks: null,
    metadata: {},
    new_backlinks: null,
    nofollow_backlinks: 30,
    observed_at: "2026-08-12T12:00:00.000Z",
    organization_id: "org-1",
    page_id: null,
    provider: "dataforseo",
    rank_score: 500,
    raw_payload_id: null,
    referring_domains: 40,
    referring_ips: null,
    referring_subnets: null,
    run_id: "run-1",
    site_id: "site-1",
    spam_score: 2,
    target: "example.com",
    target_type: "domain",
    total_backlinks: 100,
    ...overrides,
  };
}

function dimension(
  overrides: Partial<BacklinkDimensionRow> = {},
): BacklinkDimensionRow {
  return {
    backlinks: 10,
    created_at: "2026-08-12T12:00:00.000Z",
    created_by: "user-1",
    dedup_key: "dimension-1",
    dimension_key: "example",
    dimension_kind: "anchor",
    extras: {},
    first_seen_at: null,
    id: "dimension-1",
    label: "example",
    last_seen_at: null,
    metadata: {},
    organization_id: "org-1",
    provider: "dataforseo",
    rank_score: null,
    raw_payload_id: null,
    referring_domains: null,
    run_id: "run-1",
    site_id: "site-1",
    snapshot_id: "snapshot-1",
    spam_score: null,
    url: null,
    ...overrides,
  };
}

function backlink(
  overrides: Partial<BacklinkObservationRow> = {},
): BacklinkObservationRow {
  return {
    ai_assessment: {},
    analyzed_at: null,
    anchor_text: null,
    assessment_action: null,
    assessment_control_level: null,
    assessment_page_type: null,
    assessment_priority: null,
    assessment_relevance_score: null,
    assessment_relevance_verdict: null,
    assessment_risk_verdict: null,
    assessment_score: null,
    assessment_version: null,
    captured_at: null,
    claim_expires_at: null,
    claimed_at: null,
    claimed_by: null,
    created_at: "2026-08-12T12:00:00.000Z",
    created_by: "user-1",
    deterministic_assessment: {},
    domain_rank: 500,
    enrichment_attempt_count: 0,
    enrichment_status: "pending",
    first_seen_at: null,
    human_reviewed_at: null,
    human_ruling: {},
    id: "backlink-1",
    identity_key: "identity-1",
    is_dofollow: true,
    last_error: null,
    last_seen_at: null,
    link_type: "anchor",
    lost_at: null,
    metadata: {},
    next_enrichment_at: null,
    organization_id: "org-1",
    page_id: null,
    provider_evidence: {},
    referring_domain_profile_id: null,
    resolved_assessment: {},
    site_id: "site-1",
    source_capture: {},
    source_domain: "source.example",
    source_rank: 500,
    source_url: "https://source.example/article",
    spam_score: 2,
    state: "active",
    target_url: "https://example.com/target",
    updated_at: "2026-08-12T12:00:00.000Z",
    ...overrides,
  };
}

function baseline(
  overrides: Partial<BacklinksAssistSweepState> = {},
): BacklinksAssistSweepState {
  const detailSnapshot = snapshot();
  return {
    siteId: "site-1",
    siteLabel: "example.com",
    sitePath: "/marketing/brands/brand-1/sites/site-1",
    brandNames: ["Example"],
    summary: snapshot({ id: "summary-1", dataset: "summary" }),
    detailSnapshot,
    trend: [],
    rows: [],
    anchors: [],
    targetPages: [],
    competitors: [],
    enrichment: {
      total: 0,
      completed: 0,
      awaiting: 0,
      failed: 0,
      highPriority: 0,
      controllable: 0,
    },
    reviewEnabled: true,
    ...overrides,
  };
}

function candidate(state: BacklinksAssistSweepState, sourceSuffix: string) {
  const found = buildBacklinksAssistCandidates(
    state,
    new Date("2026-08-12T12:00:00.000Z"),
  ).find((item) => item.sourceKey.endsWith(sourceSuffix));
  if (!found) {
    throw new Error(`Expected candidate ending in ${sourceSuffix}`);
  }
  return found;
}

describe("buildBacklinksAssistCandidates", () => {
  test("prepares evidence-grounded reclaim outreach for newly lost links", () => {
    const found = candidate(
      baseline({
        trend: [
          {
            observed_at: "2026-08-11T00:00:00.000Z",
            new_backlinks: 2,
            lost_backlinks: 4,
            net_backlinks: -2,
            total_backlinks: 100,
            referring_domains: 40,
          },
        ],
        rows: [
          backlink({ state: "lost", lost_at: "2026-08-11T00:00:00.000Z" }),
        ],
      }),
      ".lost_reclaim",
    );
    expect(found.title).toContain("4 links disappeared");
    expect(found.body).toContain("https://source.example/article");
    expect(found.action).toMatchObject({
      kind: "launch_agent",
      slotKey: BACKLINK_ASSISTANT_SLOT,
    });
  });

  test("proposes a review-only redirect map for broken targets", () => {
    const found = candidate(
      baseline({
        targetPages: [
          dimension({
            id: "target-1",
            dimension_kind: "target_page",
            dimension_key: "https://example.com/gone",
            url: "https://example.com/gone",
            backlinks: 7,
            extras: { broken_backlinks: 7, status_code: 404 },
          }),
        ],
      }),
      ".broken_target",
    );
    expect(found.title).toContain("7 broken backlink destinations");
    expect(found.body).toContain("HTTP 404");
    expect(found.body).toContain("will not change the site");
    expect(found.body).toContain("[example.com](/marketing/sites/site-1)");
    expect(found.body).not.toContain("](<");
  });

  test("emits anchor risk only for critical deterministic warnings", () => {
    const found = candidate(
      baseline({
        anchors: [
          dimension({
            id: "anchor-1",
            dimension_key: "cheap widgets",
            label: "cheap widgets",
            backlinks: 80,
          }),
          dimension({
            id: "anchor-2",
            dimension_key: "Example",
            label: "Example",
            backlinks: 20,
          }),
        ],
      }),
      ".anchor_risk",
    );
    expect(found.body).toContain("80% of your links use keyword wording");
    expect(JSON.stringify(found.action)).toContain(
      "do not propose an automatic disavow",
    );
  });

  test("turns a risk pile-up into a human review list, never an auto-disavow", () => {
    const rows = ["high_risk", "review", "review"].map((risk, index) =>
      backlink({
        id: `risk-${index}`,
        identity_key: `risk-${index}`,
        source_url: `https://risk-${index}.example/page`,
        source_domain: `risk-${index}.example`,
        assessment_risk_verdict: risk,
      }),
    );
    const found = candidate(baseline({ rows }), ".risk_review");
    expect(found.title).toContain("3 flagged links");
    expect(found.body).toContain("never an automatic disavow list");
  });

  test("review backlog carries an explicit bounded-cost route intent", () => {
    const found = candidate(
      baseline({
        enrichment: {
          total: 25,
          completed: 10,
          awaiting: 15,
          failed: 0,
          highPriority: 0,
          controllable: 0,
        },
      }),
      ".review_backlog",
    );
    expect(found.action).toMatchObject({
      kind: "navigate",
      label: "Review 5 pages",
    });
    expect(found.body).toContain(
      "one source-page capture and one AI assessment",
    );
    expect(found.body).toContain(
      "does **not** purchase another backlink-profile refresh",
    );
    expect(describeAssistAction(found.action)).toEqual({
      verb: "Review 5 pages",
      explainer:
        "Opens this site's waiting list and starts the same bounded 5-page review as the toolbar button. Each page may use one capture and one AI assessment; no backlink-profile refresh runs.",
      receipt: "Opened the waiting list and started a review of up to 5 pages.",
    });
  });

  test("uses competitor intersections as a signal without inventing a gap count", () => {
    const found = candidate(
      baseline({
        competitors: [
          dimension({
            id: "competitor-1",
            dimension_kind: "competitor_domain",
            dimension_key: "competitor.example",
            label: "competitor.example",
            extras: { intersections: 42 },
          }),
        ],
      }),
      ".competitor_gap",
    );
    expect(found.title).toBe("Find the backlink gap around competitor.example");
    expect(found.body).toContain("42 backlink-profile intersections");
    expect(found.body).toContain("not the number of missing links");
  });

  test("returns no noise for a healthy, fully reviewed loaded state", () => {
    expect(buildBacklinksAssistCandidates(baseline())).toEqual([]);
  });
});
