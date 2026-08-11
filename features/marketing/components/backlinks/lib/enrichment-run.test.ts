import {
  applyBacklinkEnrichmentEvent,
  backlinkEnrichmentProgress,
  startBacklinkEnrichmentRun,
} from "./enrichment-run";

describe("backlink enrichment live progress", () => {
  it("tracks claimed and settled links without double-counting duplicate events", () => {
    let run = startBacklinkEnrichmentRun("Analyze next 5");
    run = applyBacklinkEnrichmentEvent(run, {
      kind: "seo.backlink_enrichment_started",
      candidate_count: 2,
    });
    run = applyBacklinkEnrichmentEvent(run, {
      kind: "seo.backlink_capture_started",
      backlink_id: "a",
      source_url: "https://a.example/page",
    });
    run = applyBacklinkEnrichmentEvent(run, {
      kind: "seo.backlink_capture_started",
      backlink_id: "a",
      source_url: "https://a.example/page",
    });
    run = applyBacklinkEnrichmentEvent(run, {
      kind: "seo.backlink_enriched",
      backlink_id: "a",
      source_url: "https://a.example/page",
    });

    expect(run.claimedIds).toEqual(["a"]);
    expect(run.completed).toBe(1);
    expect(run.status).toBe("completed");
    expect(backlinkEnrichmentProgress(run)).toBe(100);
  });

  it("takes exact terminal counters and marks the run complete", () => {
    const run = applyBacklinkEnrichmentEvent(
      startBacklinkEnrichmentRun("Analyze one"),
      {
        kind: "seo.backlink_enrichment_completed",
        result: {
          result_kind: "backlinks.enrich",
          site_id: "site-1",
          requested: 1,
          claimed: 1,
          completed: 0,
          failed: 1,
          skipped: 0,
          queue: { failed: 1 },
          items: [],
        },
      },
    );

    expect(run.status).toBe("failed");
    expect(run.failed).toBe(1);
    expect(backlinkEnrichmentProgress(run)).toBe(100);
  });

  it("marks mixed terminal counters as partial", () => {
    const run = applyBacklinkEnrichmentEvent(
      startBacklinkEnrichmentRun("Analyze two"),
      {
        kind: "seo.backlink_enrichment_completed",
        result: {
          result_kind: "backlinks.enrich",
          site_id: "site-1",
          requested: 2,
          claimed: 2,
          completed: 1,
          failed: 1,
          skipped: 0,
          queue: { completed: 1, failed: 1 },
          items: [],
        },
      },
    );

    expect(run.status).toBe("partial");
    expect(backlinkEnrichmentProgress(run)).toBe(100);
  });
});
