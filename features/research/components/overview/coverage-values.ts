/**
 * features/research/components/overview/coverage-values.ts
 *
 * The coverage audit the pipeline persists on `rs_topic.metadata.coverage_audit`
 * (aidream research/service.py Phase C.7 — `CoverageAuditOutput.model_dump()`),
 * rebuilt as a canonical `research_coverage_audit` kind instance so the topic
 * overview renders it through the kind's registered component via
 * `KindInstanceRender` (agent-manifest wave 2 pattern; template:
 * features/marketing/content-plan/setup/kind-values.ts).
 *
 * Pure: a defensive parser for the persisted JSON, and a builder that mirrors
 * it onto the kind's wire keys with the nested `__kind` tags the component
 * delegates on. No fetching, no React.
 */

export const RESEARCH_COVERAGE_AUDIT_KIND = "research_coverage_audit";
export const COVERAGE_GAP_KIND = "coverage_gap";

export type CoverageVerdict = "sufficient" | "partial" | "insufficient";
export type CoverageGapSeverity = "critical" | "important" | "minor";

export interface CoverageGapData {
  missing: string;
  why_it_matters: string;
  severity: CoverageGapSeverity;
  suggested_queries: string[];
}

export interface CoverageAuditData {
  coverage_verdict: CoverageVerdict;
  summary: string;
  gaps: CoverageGapData[];
}

const VERDICTS: ReadonlySet<string> = new Set([
  "sufficient",
  "partial",
  "insufficient",
]);
const SEVERITIES: ReadonlySet<string> = new Set([
  "critical",
  "important",
  "minor",
]);

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

/**
 * Read the persisted audit off a topic's `metadata` JSON. Returns null when
 * there is no audit or the stored shape is unusable — the card simply does not
 * render then; it never fabricates a verdict (mirror of the server rule:
 * a synthetic "sufficient" would silently suppress recovery).
 */
export function parseCoverageAudit(
  metadata: unknown,
): CoverageAuditData | null {
  if (!isRecord(metadata)) return null;
  const raw = metadata.coverage_audit;
  if (!isRecord(raw)) return null;
  const verdict = raw.coverage_verdict;
  if (typeof verdict !== "string" || !VERDICTS.has(verdict)) return null;
  const summary = typeof raw.summary === "string" ? raw.summary : "";
  const gaps: CoverageGapData[] = Array.isArray(raw.gaps)
    ? raw.gaps.filter(isRecord).map((g) => ({
        missing: typeof g.missing === "string" ? g.missing : "",
        why_it_matters:
          typeof g.why_it_matters === "string" ? g.why_it_matters : "",
        severity:
          typeof g.severity === "string" && SEVERITIES.has(g.severity)
            ? (g.severity as CoverageGapSeverity)
            : "important",
        suggested_queries: Array.isArray(g.suggested_queries)
          ? g.suggested_queries.filter(
              (q): q is string => typeof q === "string" && q.trim() !== "",
            )
          : [],
      }))
    : [];
  return { coverage_verdict: verdict as CoverageVerdict, summary, gaps };
}

/** The persisted audit mirrored onto the kind's wire shape (`__kind` tags and
 *  all) — what `KindInstanceRender` routes to the registered component. */
export function coverageAuditValue(
  audit: CoverageAuditData,
): Record<string, unknown> {
  return {
    __kind: RESEARCH_COVERAGE_AUDIT_KIND,
    coverage_verdict: audit.coverage_verdict,
    summary: audit.summary,
    gaps: audit.gaps.map((gap) => ({
      __kind: COVERAGE_GAP_KIND,
      missing: gap.missing,
      severity: gap.severity,
      why_it_matters: gap.why_it_matters,
      suggested_queries: gap.suggested_queries,
    })),
  };
}
