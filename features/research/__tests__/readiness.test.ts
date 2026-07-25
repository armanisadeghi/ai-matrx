/**
 * Readiness ledger tests — the rules that decide whether a research topic is
 * actually finished.
 *
 * The bug these pin: a topic with 4 keywords, 3 of them fully researched, has
 * rows at every pipeline stage and therefore rendered uniformly green while a
 * whole keyword sat unprocessed. The fix is not "count more things", it is
 * "compare each stage to the stage above it" — and the subtle half of that is
 * the NON-cascade: Content must stay green while the new keyword has no
 * sources yet, and flip amber only once it does.
 */

import {
  deriveReadiness,
  hasRunnableWork,
  runnableSummary,
} from "../readiness";
import {
  EMPTY_RESEARCH_PENDING,
  type ResearchPending,
  type ResearchProgress,
  type ScrapeStatus,
} from "../types";

/** A fully caught-up topic, mirroring the shape of a real overview payload. */
function progress(
  overrides: Partial<ResearchProgress> = {},
  pending: Partial<ResearchPending> = {},
): ResearchProgress {
  return {
    total_keywords: 3,
    stale_keywords: 0,
    total_sources: 150,
    included_sources: 150,
    sources_by_status: {} as Record<ScrapeStatus, number>,
    total_content: 7,
    total_analyses: 6,
    total_eligible_for_analysis: 6,
    failed_analyses: 0,
    keyword_syntheses: 3,
    failed_keyword_syntheses: 0,
    topic_syntheses: 1,
    failed_topic_syntheses: 0,
    total_tags: 0,
    total_documents: 1,
    ...overrides,
    pending: { ...EMPTY_RESEARCH_PENDING, ...pending },
  };
}

describe("deriveReadiness", () => {
  it("reports every stage ready when nothing is outstanding", () => {
    const map = deriveReadiness(progress());
    for (const info of Object.values(map)) {
      expect(info.readiness).toBe("ready");
      expect(info.actionable).toBe(false);
    }
    expect(hasRunnableWork(map)).toBe(false);
    expect(runnableSummary(map)).toBeNull();
  });

  it("THE BUG: an unsearched keyword makes Sources amber and leaves the rest green", () => {
    // Exactly the production state of the PBW topic: a 4th keyword added after
    // a completed run. Sources owes work; Content/Analysis/Synthesis genuinely
    // do not yet, because that keyword has produced no sources to act on.
    const map = deriveReadiness(
      progress({ total_keywords: 4 }, { keywords_unsearched: 1 }),
    );

    expect(map.keywords.readiness).toBe("ready");
    expect(map.sources.readiness).toBe("behind");
    expect(map.sources.reason).toBe("1 keyword never searched");
    expect(map.content.readiness).toBe("ready");
    expect(map.analysis.readiness).toBe("ready");
    expect(map.synthesis.readiness).toBe("ready");
    expect(map.report.readiness).toBe("ready");

    expect(hasRunnableWork(map)).toBe(true);
    expect(runnableSummary(map)).toBe("1 keyword never searched");
  });

  it("cascades only as real debt appears — Content flips once sources land", () => {
    // The search has now run: the new keyword has sources but no scrapes.
    const map = deriveReadiness(
      progress({ total_keywords: 4 }, { keywords_pending_scrape: 1 }),
    );
    expect(map.sources.readiness).toBe("ready");
    expect(map.content.readiness).toBe("behind");
    expect(map.content.reason).toBe("1 keyword below the scrape quota");
  });

  it("pluralizes keyword counts", () => {
    const map = deriveReadiness(progress({}, { keywords_unsearched: 3 }));
    expect(map.sources.reason).toBe("3 keywords never searched");
  });

  it("marks the report stale rather than behind, and excludes it from a run", () => {
    // Staleness is NOT runnable work: `/run` refuses to write a second topic
    // synthesis once one exists, so offering "Run pipeline" as the fix would
    // be a lie. It gets its own explicit decision instead.
    const map = deriveReadiness(progress({}, { report_stale: true }));
    expect(map.report.readiness).toBe("stale");
    expect(map.report.actionable).toBe(true);
    expect(hasRunnableWork(map)).toBe(false);
    expect(runnableSummary(map)).toBeNull();
  });

  it("marks the document stale independently of the report", () => {
    const map = deriveReadiness(progress({}, { document_stale: true }));
    expect(map.document.readiness).toBe("stale");
    expect(map.report.readiness).toBe("ready");
    expect(hasRunnableWork(map)).toBe(false);
  });

  it("treats a stage that owes work but has no rows as behind, not empty", () => {
    const map = deriveReadiness(
      progress(
        { keyword_syntheses: 0, topic_syntheses: 0, total_documents: 0 },
        { keywords_pending_synthesis: 2 },
      ),
    );
    expect(map.synthesis.readiness).toBe("behind");
    expect(map.report.readiness).toBe("empty");
    expect(map.document.readiness).toBe("empty");
  });

  it("surfaces analysis failures when no quota debt is outstanding", () => {
    const map = deriveReadiness(progress({ failed_analyses: 2 }));
    expect(map.analysis.readiness).toBe("behind");
    expect(map.analysis.reason).toBe("2 failed");
  });

  it("prefers quota debt over a failure count in the analysis reason", () => {
    const map = deriveReadiness(
      progress({ failed_analyses: 2 }, { keywords_pending_analysis: 1 }),
    );
    expect(map.analysis.reason).toBe("1 keyword below the analysis quota");
  });

  it("joins every outstanding stage into the run summary, in pipeline order", () => {
    const map = deriveReadiness(
      progress(
        {},
        { keywords_unsearched: 1, keywords_pending_synthesis: 2 },
      ),
    );
    expect(runnableSummary(map)).toBe(
      "1 keyword never searched · 2 keywords without a synthesis",
    );
  });

  it("degrades to all-empty for a missing progress payload", () => {
    const map = deriveReadiness(null);
    expect(map.sources.readiness).toBe("empty");
    expect(hasRunnableWork(map)).toBe(false);
  });
});
