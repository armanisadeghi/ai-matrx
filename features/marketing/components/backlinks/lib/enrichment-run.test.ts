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

  it("keeps a BATCH running until its own completion event, not the first settled link", () => {
    let run = startBacklinkEnrichmentRun("Analyze next 2", "batch");
    run = applyBacklinkEnrichmentEvent(run, {
      kind: "seo.backlink_enrichment_started",
      candidate_count: 2,
    });
    run = applyBacklinkEnrichmentEvent(run, {
      kind: "seo.backlink_enriched",
      backlink_id: "a",
      source_url: "https://a.example/page",
    });

    // One of two done — the panel must NOT read finished here.
    expect(run.status).toBe("running");
    expect(run.completed).toBe(1);
    expect(backlinkEnrichmentProgress(run)).toBeLessThan(100);

    run = applyBacklinkEnrichmentEvent(run, {
      kind: "seo.backlink_enriched",
      backlink_id: "b",
      source_url: "https://b.example/page",
    });
    expect(run.status).toBe("running");

    run = applyBacklinkEnrichmentEvent(run, {
      kind: "seo.backlink_enrichment_completed",
      result: {
        result_kind: "backlinks.enrich",
        site_id: "site-1",
        requested: 2,
        claimed: 2,
        completed: 2,
        failed: 0,
        skipped: 0,
        queue: { completed: 2, failed: 0 },
        items: [],
      },
    });
    expect(run.status).toBe("completed");
    expect(backlinkEnrichmentProgress(run)).toBe(100);
  });

  it("does not fail a whole BATCH because one link failed", () => {
    let run = startBacklinkEnrichmentRun("Analyze next 2", "batch");
    run = applyBacklinkEnrichmentEvent(run, {
      kind: "seo.backlink_enrichment_started",
      candidate_count: 2,
    });
    run = applyBacklinkEnrichmentEvent(run, {
      kind: "seo.backlink_enrichment_failed",
      backlink_id: "a",
      stage: "capture",
      message: "timeout",
    });

    expect(run.status).toBe("running");
    expect(run.failed).toBe(1);
  });

  it("still ends a SINGLE-record run on its one link settling", () => {
    const run = applyBacklinkEnrichmentEvent(
      startBacklinkEnrichmentRun("Analyze this link"),
      {
        kind: "seo.backlink_enriched",
        backlink_id: "a",
        source_url: "https://a.example/page",
      },
    );

    expect(run.status).toBe("completed");
  });

  it("settles a batch that finishes without a result payload", () => {
    let run = startBacklinkEnrichmentRun("Analyze next 2", "batch");
    run = applyBacklinkEnrichmentEvent(run, {
      kind: "seo.backlink_enrichment_started",
      candidate_count: 2,
    });
    run = applyBacklinkEnrichmentEvent(run, {
      kind: "seo.backlink_enriched",
      backlink_id: "a",
      source_url: "https://a.example/page",
    });
    run = applyBacklinkEnrichmentEvent(run, {
      kind: "seo.backlink_enrichment_finished",
    });

    expect(run.status).toBe("completed");
  });
});
