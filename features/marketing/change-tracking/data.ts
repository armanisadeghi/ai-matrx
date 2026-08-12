import type { Database, Json } from "@/types/database.types";
import { ensureKeywordId } from "@/features/marketing/data/page-keywords";
import { getGscSummary } from "@/features/marketing/search-console/data";
import { supabase } from "@/utils/supabase/client";
import { requireAuthenticatedSupabaseSession } from "@/utils/supabase/webDb";
import { makeAssertData } from "@/utils/errors";

type SeoTables = Database["seo"]["Tables"];
type SeoViews = Database["seo"]["Views"];

export type SeoChangeSummary = SeoViews["v_change_set_summary"]["Row"] & {
  id: string;
  site_id: string;
  organization_id: string;
  title: string;
  status: string;
  change_kind: string;
};
export type SeoChangeSet = SeoTables["change_set"]["Row"];
export type SeoChangeTheory = SeoTables["change_theory"]["Row"];
export type SeoChangeMetric = SeoTables["change_metric"]["Row"];
export type SeoChangeItem = SeoTables["change_item"]["Row"];
export type SeoChangeAssessment = SeoTables["change_assessment"]["Row"];
export type SeoChangeEvent = SeoTables["change_event"]["Row"];
export type UntrackedSnapshotChange =
  SeoViews["v_untracked_snapshot_change"]["Row"] & {
    id: string;
    snapshot_id: string;
    page_id: string;
    site_id: string;
    organization_id: string;
  };

export interface SeoPageOption {
  id: string;
  url: string;
  path: string | null;
  target_keyword: string | null;
}

export interface SeoChangeBundle {
  change: SeoChangeSet;
  theories: SeoChangeTheory[];
  metrics: SeoChangeMetric[];
  items: SeoChangeItem[];
  assessments: SeoChangeAssessment[];
  events: SeoChangeEvent[];
  keywordPhrases: Record<string, string>;
}

export interface CreateSeoChangeInput {
  organizationId: string;
  siteId: string;
  pageId: string;
  title: string;
  summary: string;
  rationale: string;
  businessOutcome: string;
  changeKind: string;
  confidence: number;
  deployedAt: string | null;
  theoryTitle: string;
  hypothesis: string;
  mechanism: string;
  businessLink: string;
  keywordPhrase: string;
  metricKey: string;
  metricLabel: string;
  dataSource: string;
  direction: string;
  targetChangePct: number | null;
  targetValue: number | null;
  baselineDays: number;
  observationDays: number;
  minimumDataDays: number;
  fieldKind: string;
  expectedAfter: string;
  source?: string;
  observedSnapshot?: UntrackedSnapshotChange;
}

async function seoDb() {
  await requireAuthenticatedSupabaseSession(supabase);
  return supabase.schema("seo");
}

const requireRows = makeAssertData("reach this site's tracked SEO changes");

export async function listSeoChanges(
  siteId: string,
  signal?: AbortSignal,
): Promise<SeoChangeSummary[]> {
  const response = await (
    await seoDb()
  )
    .from("v_change_set_summary")
    .select("*")
    .eq("site_id", siteId)
    .order("deployed_at", { ascending: false, nullsFirst: false })
    .order("created_at", { ascending: false })
    .abortSignal(signal ?? new AbortController().signal);
  return (requireRows(response.data, response.error) ?? []).filter(
    (row): row is SeoChangeSummary =>
      Boolean(
        row.id &&
        row.site_id &&
        row.organization_id &&
        row.title &&
        row.status &&
        row.change_kind,
      ),
  );
}

export async function listSeoPages(
  siteId: string,
  signal?: AbortSignal,
): Promise<SeoPageOption[]> {
  await requireAuthenticatedSupabaseSession(supabase);
  const response = await supabase
    .schema("web")
    .from("page")
    .select("id,url,path,target_keyword")
    .eq("site_id", siteId)
    .is("deleted_at", null)
    .order("path", { ascending: true })
    .limit(2000)
    .abortSignal(signal ?? new AbortController().signal);
  return requireRows(response.data, response.error);
}

export async function listUntrackedChanges(
  siteId: string,
  signal?: AbortSignal,
): Promise<UntrackedSnapshotChange[]> {
  const response = await (
    await seoDb()
  )
    .from("v_untracked_snapshot_change")
    .select("*")
    .eq("site_id", siteId)
    .order("captured_at", { ascending: false })
    .limit(100)
    .abortSignal(signal ?? new AbortController().signal);
  return (requireRows(response.data, response.error) ?? []).filter(
    (row): row is UntrackedSnapshotChange =>
      Boolean(
        row.id &&
        row.snapshot_id &&
        row.page_id &&
        row.site_id &&
        row.organization_id,
      ),
  );
}

export async function getSeoChangeBundle(
  changeId: string,
  signal?: AbortSignal,
): Promise<SeoChangeBundle> {
  const db = await seoDb();
  const abortSignal = signal ?? new AbortController().signal;
  const [
    changeResult,
    theoriesResult,
    metricsResult,
    itemsResult,
    assessmentsResult,
    eventsResult,
  ] = await Promise.all([
    db
      .from("change_set")
      .select("*")
      .eq("id", changeId)
      .abortSignal(abortSignal)
      .single(),
    db
      .from("change_theory")
      .select("*")
      .eq("change_set_id", changeId)
      .is("deleted_at", null)
      .order("sort_order")
      .abortSignal(abortSignal),
    db
      .from("change_metric")
      .select("*")
      .eq("change_set_id", changeId)
      .is("deleted_at", null)
      .order("sort_order")
      .abortSignal(abortSignal),
    db
      .from("change_item")
      .select("*")
      .eq("change_set_id", changeId)
      .is("deleted_at", null)
      .order("sort_order")
      .abortSignal(abortSignal),
    db
      .from("change_assessment")
      .select("*")
      .eq("change_set_id", changeId)
      .order("assessed_at", { ascending: false })
      .abortSignal(abortSignal),
    db
      .from("change_event")
      .select("*")
      .eq("change_set_id", changeId)
      .order("occurred_at", { ascending: false })
      .abortSignal(abortSignal),
  ]);
  const change = requireRows(changeResult.data, changeResult.error);
  const theories = requireRows(theoriesResult.data, theoriesResult.error);
  const keywordIds = theories
    .map((row) => row.keyword_id)
    .filter((id): id is string => Boolean(id));
  const keywordPhrases: Record<string, string> = {};
  if (keywordIds.length > 0) {
    const keywordResult = await db
      .from("keyword")
      .select("id,phrase")
      .in("id", keywordIds)
      .abortSignal(abortSignal);
    for (const row of requireRows(keywordResult.data, keywordResult.error)) {
      keywordPhrases[row.id] = row.phrase;
    }
  }
  return {
    change,
    theories,
    metrics: requireRows(metricsResult.data, metricsResult.error),
    items: requireRows(itemsResult.data, itemsResult.error),
    assessments: requireRows(assessmentsResult.data, assessmentsResult.error),
    events: requireRows(eventsResult.data, eventsResult.error),
    keywordPhrases,
  };
}

function metricSource(metricKey: string): string {
  if (metricKey.startsWith("gsc_")) return "gsc";
  if (metricKey.startsWith("ga4_")) return "ga4";
  if (metricKey === "rank_position") return "rank";
  if (metricKey === "crawl_health_score") return "crawl";
  return "manual";
}

export async function createSeoChange(
  input: CreateSeoChangeInput,
): Promise<string> {
  const session = await requireAuthenticatedSupabaseSession(supabase);
  const userId = session.user.id;
  const db = supabase.schema("seo");
  const keywordId = input.keywordPhrase.trim()
    ? await ensureKeywordId(input.keywordPhrase)
    : null;
  const observed = input.observedSnapshot;
  const deployedAt = input.deployedAt || observed?.captured_at || null;
  const changeResult = await db
    .from("change_set")
    .insert({
      organization_id: input.organizationId,
      site_id: input.siteId,
      primary_page_id: input.pageId,
      title: input.title.trim(),
      summary: input.summary.trim(),
      rationale: input.rationale.trim(),
      business_outcome: input.businessOutcome.trim(),
      change_kind: input.changeKind,
      confidence: input.confidence,
      status: deployedAt ? "deployed" : "planned",
      deployed_at: deployedAt,
      source: input.source ?? (observed ? "crawl_observation" : "manual"),
      created_by: userId,
      updated_by: userId,
      metadata: observed
        ? ({ observed_snapshot_id: observed.snapshot_id } satisfies Json)
        : {},
    })
    .select("id")
    .single();
  if (changeResult.error) throw changeResult.error;
  const changeId = changeResult.data.id;

  try {
    const theoryResult = await db
      .from("change_theory")
      .insert({
        organization_id: input.organizationId,
        site_id: input.siteId,
        change_set_id: changeId,
        page_id: input.pageId,
        keyword_id: keywordId,
        title: input.theoryTitle.trim(),
        hypothesis: input.hypothesis.trim(),
        mechanism: input.mechanism.trim(),
        business_link: input.businessLink.trim(),
        confidence: input.confidence,
        status: deployedAt ? "watching" : "untested",
        created_by: userId,
        updated_by: userId,
      })
      .select("id")
      .single();
    if (theoryResult.error) throw theoryResult.error;

    const [metricResult, itemResult] = await Promise.all([
      db.from("change_metric").insert({
        organization_id: input.organizationId,
        site_id: input.siteId,
        change_set_id: changeId,
        theory_id: theoryResult.data.id,
        label: input.metricLabel.trim(),
        metric_key: input.metricKey,
        data_source: input.dataSource || metricSource(input.metricKey),
        direction: input.direction,
        target_change_pct: input.targetChangePct,
        target_value: input.targetValue,
        baseline_days: input.baselineDays,
        observation_days: input.observationDays,
        minimum_data_days: input.minimumDataDays,
        is_primary: true,
        created_by: userId,
        updated_by: userId,
      }),
      db.from("change_item").insert({
        organization_id: input.organizationId,
        site_id: input.siteId,
        change_set_id: changeId,
        page_id: input.pageId,
        field_kind: input.fieldKind,
        label: observed
          ? `Observed ${observed.changed_fields?.join(", ") || "page"} change`
          : `Verify ${input.fieldKind.replaceAll("_", " ")}`,
        expected_after: input.expectedAfter.trim() || null,
        observed_after: observed?.changed_fields?.join(", ") ?? null,
        verification_status: observed ? "matched" : "pending",
        verification_method: "crawl",
        source_snapshot_id: observed?.snapshot_id ?? null,
        verified_at: observed?.captured_at ?? null,
        created_by: userId,
        updated_by: userId,
      }),
    ]);
    if (metricResult.error) throw metricResult.error;
    if (itemResult.error) throw itemResult.error;
    return changeId;
  } catch (error) {
    const cleanup = await db.from("change_set").delete().eq("id", changeId);
    if (cleanup.error) {
      throw new Error(
        `${error instanceof Error ? error.message : String(error)} Cleanup also failed: ${cleanup.error.message}`,
      );
    }
    throw error;
  }
}

export async function updateSeoChange(
  changeId: string,
  patch: SeoTables["change_set"]["Update"],
): Promise<void> {
  const session = await requireAuthenticatedSupabaseSession(supabase);
  const response = await supabase
    .schema("seo")
    .from("change_set")
    .update({ ...patch, updated_by: session.user.id })
    .eq("id", changeId)
    .select("id")
    .single();
  if (response.error) throw response.error;
}

export async function verifySeoChangeItemManually(
  item: SeoChangeItem,
  status: "matched" | "mismatch",
  note: string,
): Promise<void> {
  const session = await requireAuthenticatedSupabaseSession(supabase);
  const db = supabase.schema("seo");
  const now = new Date().toISOString();
  const updateResult = await db
    .from("change_item")
    .update({
      verification_status: status,
      verification_method: "manual",
      verified_at: now,
      notes: note,
      updated_by: session.user.id,
    })
    .eq("id", item.id)
    .select("id")
    .single();
  if (updateResult.error) throw updateResult.error;
  const eventResult = await db.from("change_event").insert({
    organization_id: item.organization_id,
    site_id: item.site_id,
    change_set_id: item.change_set_id,
    change_item_id: item.id,
    event_type:
      status === "matched"
        ? "implementation_verified"
        : "implementation_mismatch",
    source: "user",
    title:
      status === "matched"
        ? "Implementation manually verified"
        : "Implementation mismatch recorded",
    detail:
      note.trim() || `Manual verification marked ${item.label} as ${status}.`,
    actor_id: session.user.id,
    created_by: session.user.id,
  });
  if (eventResult.error) throw eventResult.error;
}

function isoDay(date: Date): string {
  return date.toISOString().slice(0, 10);
}

function plusDays(day: string, days: number): Date {
  const date = new Date(`${day}T12:00:00Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return date;
}

export interface MetricEvidence {
  metric: SeoChangeMetric;
  baselineStart: string;
  baselineEnd: string;
  observationStart: string;
  observationEnd: string;
  baselineValue: number | null;
  observedValue: number | null;
  delta: number | null;
  deltaPct: number | null;
  verdict: "supported" | "refuted" | "inconclusive" | "too_early";
  dataDays: number;
  normalizedPerDay: boolean;
}

export function evaluateMetricVerdict(
  metric: Pick<
    SeoChangeMetric,
    "minimum_data_days" | "target_value" | "target_change_pct" | "direction"
  >,
  baseline: number | null,
  observed: number | null,
  dataDays: number,
): MetricEvidence["verdict"] {
  if (dataDays < metric.minimum_data_days) return "too_early";
  if (baseline === null || observed === null) return "inconclusive";
  const delta = observed - baseline;
  const pct = baseline === 0 ? null : (delta / Math.abs(baseline)) * 100;
  const reachedValue =
    metric.target_value === null
      ? true
      : metric.direction === "decrease"
        ? observed <= metric.target_value
        : observed >= metric.target_value;
  const reachedPct =
    metric.target_change_pct === null || pct === null
      ? metric.target_change_pct === null
      : metric.direction === "decrease"
        ? pct <= -Math.abs(metric.target_change_pct)
        : pct >= metric.target_change_pct;
  if (metric.direction === "maintain") {
    const tolerance = Math.abs(metric.target_change_pct ?? 5);
    return pct !== null && Math.abs(pct) <= tolerance ? "supported" : "refuted";
  }
  return reachedValue && reachedPct ? "supported" : "refuted";
}

export async function getMetricEvidence(
  change: SeoChangeSet,
  metric: SeoChangeMetric,
  theory: SeoChangeTheory,
  keywordPhrase: string | null,
  signal?: AbortSignal,
): Promise<MetricEvidence | null> {
  if (!change.deployed_at) return null;
  const deployedDay = change.deployed_at.slice(0, 10);
  const today = isoDay(new Date());
  const observationEnd = isoDay(
    new Date(
      Math.min(
        plusDays(deployedDay, metric.observation_days - 1).getTime(),
        plusDays(today, 0).getTime(),
      ),
    ),
  );
  const baselineEnd = isoDay(plusDays(deployedDay, -1));
  const baselineStart = isoDay(plusDays(deployedDay, -metric.baseline_days));
  const dataDays = Math.max(
    0,
    Math.floor(
      (plusDays(observationEnd, 0).getTime() -
        plusDays(deployedDay, 0).getTime()) /
        86_400_000,
    ) + 1,
  );
  const baselineDataDays = metric.baseline_days;
  let baselineValue: number | null = null;
  let observedValue: number | null = null;
  let normalizedPerDay = false;

  if (metric.data_source === "gsc") {
    const summary = await getGscSummary(
      change.site_id,
      {
        current: { start: deployedDay, end: observationEnd },
        compare: { start: baselineStart, end: baselineEnd },
      },
      {
        ...(theory.page_id ? { page_eq: theory.page_id } : {}),
        ...(keywordPhrase ? { query_eq: keywordPhrase } : {}),
      },
      signal,
    );
    if (summary) {
      const key = metric.metric_key.replace("gsc_", "");
      const current =
        key === "average_position"
          ? summary.avg_position
          : summary[key as "clicks" | "impressions" | "ctr"];
      const compare =
        key === "average_position"
          ? summary.cmp_avg_position
          : summary[
              `cmp_${key}` as "cmp_clicks" | "cmp_impressions" | "cmp_ctr"
            ];
      observedValue = Number.isFinite(current) ? current : null;
      baselineValue = Number.isFinite(compare) ? compare : null;
      if (["gsc_clicks", "gsc_impressions"].includes(metric.metric_key)) {
        observedValue =
          observedValue === null || dataDays === 0
            ? null
            : observedValue / dataDays;
        baselineValue =
          baselineValue === null ? null : baselineValue / baselineDataDays;
        normalizedPerDay = true;
      }
    }
  } else if (metric.data_source === "ga4") {
    await requireAuthenticatedSupabaseSession(supabase);
    const response = await supabase
      .schema("seo")
      .from("web_analytics_daily")
      .select(
        "date,page_id,sessions,users,engaged_sessions,conversions,revenue",
      )
      .eq("site_id", change.site_id)
      .eq("provider", "ga4")
      .gte("date", baselineStart)
      .lte("date", observationEnd)
      .abortSignal(signal ?? new AbortController().signal);
    if (response.error) throw response.error;
    const field = metric.metric_key.replace("ga4_", "") as
      "sessions" | "users" | "engaged_sessions" | "conversions" | "revenue";
    const rows = (response.data ?? []).filter(
      (row) => !theory.page_id || row.page_id === theory.page_id,
    );
    baselineValue = rows
      .filter((row) => row.date >= baselineStart && row.date <= baselineEnd)
      .reduce((sum, row) => sum + Number(row[field] ?? 0), 0);
    observedValue = rows
      .filter((row) => row.date >= deployedDay && row.date <= observationEnd)
      .reduce((sum, row) => sum + Number(row[field] ?? 0), 0);
    baselineValue /= baselineDataDays;
    observedValue = dataDays === 0 ? null : observedValue / dataDays;
    normalizedPerDay = true;
  }

  const delta =
    baselineValue === null || observedValue === null
      ? null
      : observedValue - baselineValue;
  const deltaPct =
    delta === null || baselineValue === null || baselineValue === 0
      ? null
      : (delta / Math.abs(baselineValue)) * 100;
  return {
    metric,
    baselineStart,
    baselineEnd,
    observationStart: deployedDay,
    observationEnd,
    baselineValue,
    observedValue,
    delta,
    deltaPct,
    verdict: evaluateMetricVerdict(
      metric,
      baselineValue,
      observedValue,
      dataDays,
    ),
    dataDays,
    normalizedPerDay,
  };
}

export async function recordMetricAssessment(
  bundle: SeoChangeBundle,
  theory: SeoChangeTheory,
  evidence: MetricEvidence,
  note: string,
): Promise<void> {
  const session = await requireAuthenticatedSupabaseSession(supabase);
  const db = supabase.schema("seo");
  const result = await db.from("change_assessment").insert({
    organization_id: bundle.change.organization_id,
    site_id: bundle.change.site_id,
    change_set_id: bundle.change.id,
    theory_id: theory.id,
    metric_id: evidence.metric.id,
    verdict: evidence.verdict,
    baseline_start: evidence.baselineStart,
    baseline_end: evidence.baselineEnd,
    observation_start: evidence.observationStart,
    observation_end: evidence.observationEnd,
    baseline_value: evidence.baselineValue,
    observed_value: evidence.observedValue,
    delta: evidence.delta,
    delta_pct: evidence.deltaPct,
    evidence_note: note.trim(),
    source: "human",
    assessed_by: session.user.id,
    created_by: session.user.id,
    metadata: { data_days: evidence.dataDays },
  });
  if (result.error) throw result.error;
  const theoryResult = await db
    .from("change_theory")
    .update({
      status: evidence.verdict === "too_early" ? "watching" : evidence.verdict,
      updated_by: session.user.id,
    })
    .eq("id", theory.id);
  if (theoryResult.error) throw theoryResult.error;
}
