"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import {
  ArrowUpRight,
  CircleDot,
  ClipboardCheck,
  FileSearch,
  Globe,
  History,
  Loader2,
  MapPin,
  RefreshCw,
  ScanSearch,
  Swords,
  Target,
} from "lucide-react";
import { useQueryClient } from "@tanstack/react-query";

import { MatrxDataTable } from "@/components/official/matrx-data-table/MatrxDataTable";
import type { CellEditsMap, MatrxColumnDef } from "@/components/official/matrx-data-table/types";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Tabs, TabsContent } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";
import { AssistStrip } from "@/features/assists/components/AssistStrip";
import { LiveRunDisplay } from "@/features/agents/components/live-run/LiveRunDisplay";
import { EntityModeHeader } from "@/features/shell/components/header/templates/EntityModeHeader";
import { SurfaceRuntimeProvider } from "@/features/surfaces/runtime/SurfaceRuntimeContext";
import { createMarketingCompetitorsScope } from "@/features/surfaces/manifests/marketing-competitors.manifest";
import { marketingRoutes } from "@/features/marketing/lib/routes";
import { toast } from "@/lib/toast";
import { formatAbsoluteDate, formatRelativeTime } from "@/utils/datetime";
import { supabase } from "@/utils/supabase/client";
import { useAppDispatch } from "@/lib/redux/hooks";
import { emitAssistTracked } from "@/features/assists/redux/emitTracked";
import { assistPriority } from "@/features/assists/types";

import type {
  CompetitorOpportunityRow,
  CompetitorRow,
  CompetitorRunRow,
  CompetitorSite,
} from "./data";
import { saveCompetitorClassification, updateCompetitorTracking, updateOpportunityStatus } from "./data";
import {
  AUTOPSY_RUN_BOUND_CHOICES,
  LOCAL_SEARCH_AREA_LABEL,
  LOCAL_SEARCH_AREA_PLACEHOLDER,
  LOCAL_SEARCH_KEYWORD_LABEL,
  LOCAL_SEARCH_KEYWORD_PLACEHOLDER,
  parseAutopsyRunPlan,
  parseCompetitorDomainsField,
  parseCompetitorTrackingWrite,
  parseOpportunityStatusWrite,
  serializeCompetitorDomains,
  type CompetitorTrackingStatus,
  type OpportunityStatus,
} from "./autopsy-controls";
import { useCompetitorAutopsy } from "./useCompetitorAutopsy";
import {
  CompetitorClassificationEditor,
  ENTITY_ROLE_EDIT_OPTIONS,
  ManualCompetitorAdd,
  derivedCompetitorLabel,
} from "./CompetitorIdentification";
import { GroundTruthQueue } from "./GroundTruthQueue";
import { LandscapeBriefCard } from "./LandscapeBriefCard";
import {
  discoverCompetitors,
  discoverLocalCompetitors,
  type LocalCompetitorSearchResult,
} from "./landscapeBrief";

type Artifact = {
  executive_verdict?: string;
  summary?: string;
  already_have_percentage?: number;
  evidence_coverage?: {
    competitors_analyzed?: number;
    competitor_pages_crawled?: number;
    keywords_compared?: number;
    limitations?: string[];
  };
};

const COMPETITOR_VIEWS = [
  { id: "run", name: "Run", icon: ScanSearch },
  { id: "review", name: "Review", icon: ClipboardCheck },
  { id: "opportunities", name: "Opportunities", icon: Target },
  { id: "competitors", name: "Competitors", icon: Swords },
  { id: "evidence", name: "Evidence", icon: FileSearch },
  { id: "history", name: "History", icon: History },
] as const;

type CompetitorView = (typeof COMPETITOR_VIEWS)[number]["id"];

function competitorView(raw: string | null): CompetitorView {
  return COMPETITOR_VIEWS.find((view) => view.id === raw)?.id ?? "run";
}

function competitorViewHref(view: CompetitorView, siteId: string | null): string {
  const params = new URLSearchParams();
  if (siteId) params.set("siteId", siteId);
  if (view !== "run") params.set("view", view);
  const query = params.toString();
  return `${marketingRoutes.competitors()}${query ? `?${query}` : ""}`;
}

function siteBrandLabel(site: CompetitorSite): string {
  return site.brand?.name || site.name || site.domain || site.root_url;
}

function object(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function artifactFromRun(run: CompetitorRunRow | undefined): Artifact | null {
  const result = object(run?.result);
  return object(result?.artifact) as Artifact | null;
}

function scoreTone(score: number | null): string {
  if (score === null) return "text-muted-foreground";
  if (score >= 80) return "text-emerald-600 dark:text-emerald-400";
  if (score >= 55) return "text-amber-600 dark:text-amber-400";
  return "text-muted-foreground";
}

const trafficFormatter = new Intl.NumberFormat(undefined, {
  maximumFractionDigits: 0,
});

/** "48,203" instead of the raw provider float — MSR-22. */
function formatTraffic(value: number | null): string {
  if (value === null || Number.isNaN(value)) return "—";
  return trafficFormatter.format(value);
}

/** "12.4" instead of six decimal places off the provider — MSR-22. */
function formatPosition(value: number | null): string {
  if (value === null || Number.isNaN(value)) return "—";
  return value.toFixed(1);
}

/** Relative-time cell with the exact timestamp on hover — MSR-23. */
function dateCell(value: string | null) {
  if (!value) return <span className="text-muted-foreground">—</span>;
  return (
    <span title={formatAbsoluteDate(value)} className="whitespace-nowrap">
      {formatRelativeTime(value)}
    </span>
  );
}

function externalLink(url: string | null, label: string) {
  if (!url) return <span className="text-muted-foreground">—</span>;
  return (
    <a
      href={url}
      target="_blank"
      rel="noreferrer"
      className="inline-flex max-w-64 items-center gap-1 truncate text-primary hover:underline"
      onClick={(event) => event.stopPropagation()}
    >
      <span className="truncate">{label}</span>
      <ArrowUpRight className="size-3 shrink-0" />
    </a>
  );
}

function OpportunityDetail({ row }: { row: CompetitorOpportunityRow }) {
  return (
    <div className="space-y-5 p-4 text-sm">
      <section>
        <p className="mb-1 text-xs font-medium uppercase tracking-wide text-muted-foreground">
          Verdict
        </p>
        <p className="leading-6">{row.verdict}</p>
      </section>
      <section>
        <p className="mb-1 text-xs font-medium uppercase tracking-wide text-muted-foreground">
          Why they win
        </p>
        <p className="leading-6">{row.why_competitor_wins}</p>
      </section>
      <section>
        <p className="mb-1 text-xs font-medium uppercase tracking-wide text-muted-foreground">
          What you already have
        </p>
        <p className="leading-6">{row.current_advantage}</p>
      </section>
      <section className="rounded-lg border border-primary/20 bg-primary/5 p-4">
        <p className="mb-1 text-xs font-medium uppercase tracking-wide text-primary">
          Recommended action
        </p>
        <p className="leading-6">{row.recommended_action}</p>
      </section>
      {Array.isArray(row.evidence) && row.evidence.length ? (
        <section>
          <p className="mb-2 text-xs font-medium uppercase tracking-wide text-muted-foreground">
            Evidence
          </p>
          <ul className="space-y-2">
            {row.evidence.map((item, index) => (
              <li key={index} className="rounded-md bg-muted/50 px-3 py-2">
                {String(item)}
              </li>
            ))}
          </ul>
        </section>
      ) : null}
    </div>
  );
}

export default function CompetitorAutopsyWorkspace() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const requestedSiteId = searchParams.get("siteId");
  const activeView = competitorView(searchParams.get("view"));
  const [domains, setDomains] = useState("");
  const [maxCompetitors, setMaxCompetitors] = useState(3);
  const [pagesPerCompetitor, setPagesPerCompetitor] = useState(3);
  const [forceRefresh, setForceRefresh] = useState(false);
  const queryClient = useQueryClient();
  const dispatch = useAppDispatch();
  const { sites, workspace, run, start, resolvedSiteId } =
    useCompetitorAutopsy(requestedSiteId);

  const data = workspace.data;
  const completedRun = data?.runs.find((item) => item.status === "completed");
  const latestArtifact = artifactFromRun(completedRun);
  const openActions =
    data?.opportunities.filter((item) => item.status === "open").length ?? 0;
  const tracked =
    data?.competitors.filter((item) => item.tracking_status === "tracked")
      .length ?? 0;
  const proposed = useMemo(
    () => data?.competitors.filter((item) => item.classification_status === "proposed") ?? [],
    [data?.competitors],
  );
  const selectedSite = sites.data?.find((site) => site.id === resolvedSiteId) ?? null;
  const [discovering, setDiscovering] = useState(false);
  const [localKeyword, setLocalKeyword] = useState("");
  const [localArea, setLocalArea] = useState("");
  const [localSearching, setLocalSearching] = useState(false);
  const [localStage, setLocalStage] = useState<string | null>(null);
  const [localResult, setLocalResult] = useState<LocalCompetitorSearchResult | null>(null);
  /** MSR-25 — WHICH COMPETITOR UNIVERSE this run should look in. National is
   *  keyword overlap against our own domain; local is the map pack for a real
   *  search in a real place. They return different companies, so the user
   *  chooses rather than the system guessing. Deliberately separate state from
   *  the Review tab's standalone pack search (which spends nothing but a pack
   *  read) — same two questions, but this one commissions a whole autopsy. */
  const [autopsyScope, setAutopsyScope] = useState<"national" | "local">("national");
  const [autopsyLocalKeyword, setAutopsyLocalKeyword] = useState("");
  const [autopsyLocalArea, setAutopsyLocalArea] = useState("");
  const localScopeIncomplete =
    autopsyScope === "local" &&
    (!autopsyLocalKeyword.trim() || !autopsyLocalArea.trim());

  useEffect(() => {
    if (!resolvedSiteId || !proposed.length) return;
    void supabase.auth.getUser().then(({ data: auth }) => {
      if (!auth.user) return;
      for (const competitor of proposed) {
        if (!competitor.business_overlap || !competitor.market_overlap || !competitor.entity_role || !competitor.posture) continue;
        void emitAssistTracked(auth.user.id, {
          sourceKind: competitor.resolved_assessment && typeof competitor.resolved_assessment === "object" && "layer" in competitor.resolved_assessment && competitor.resolved_assessment.layer === "deterministic" ? "deterministic" : "agent",
          sourceKey: "seo.competitor_classification",
          title: `Confirm ${competitor.display_name || competitor.display_domain}`,
          body: `${derivedCompetitorLabel(competitor)} is proposed. Confirm it only if the axes match what you know.`,
          reasoning: competitor.latest_autopsy && typeof competitor.latest_autopsy === "object" && "classification" in competitor.latest_autopsy ? "A deterministic rule or the competitor classifier proposed these axes; you remain the decision-maker." : undefined,
          confidence: undefined,
          surfaceName: "matrx-user/marketing-competitors",
          entityType: "seo_competitor",
          entityId: competitor.id,
          dedupeKey: `seo.competitor_classification:${competitor.id}`,
          // A confirmation queue, not an emergency: nothing is blocked while
          // a proposed competitor sits unconfirmed (THE URGENT BAR). This read
          // 80 — a raw score, never meant as urgency — which rendered every
          // one of these as a red "Urgent" chip above genuinely blocked runs.
          priority: assistPriority("normal", 5),
          evidence: { kind: "competitor", label: competitor.display_name || competitor.display_domain, href: `https://${competitor.normalized_domain}`, ref: competitor.id },
          action: { kind: "surface_write", surfaceName: "matrx-user/marketing-competitors", target: "competitor_classification", value: {
            competitorId: competitor.id,
            business_overlap: competitor.business_overlap,
            market_overlap: competitor.market_overlap,
            entity_role: competitor.entity_role,
            posture: competitor.posture,
            use_for_link_gap: competitor.use_for_link_gap,
            custom_labels: competitor.custom_labels,
          } },
        }, dispatch);
      }
    });
  }, [dispatch, proposed, resolvedSiteId]);

  const refresh = async () => {
    if (!resolvedSiteId) return;
    await queryClient.invalidateQueries({
      queryKey: ["marketing", "competitors", resolvedSiteId],
    });
  };

  /** Find rivals and classify them — the cheap half of the autopsy, no page
   *  crawl. Every row lands proposed and queues up for a ruling. */
  const findCompetitors = async () => {
    if (!resolvedSiteId) return;
    setDiscovering(true);
    setLocalStage("Reading your own search results");
    try {
      const count = await discoverCompetitors(
        resolvedSiteId,
        dispatch,
        setLocalStage,
      );
      await refresh();
      toast.success(
        count
          ? `Found ${count} to look at. Every one is a proposal until you rule.`
          : "Nothing new came back this time.",
      );
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : "Could not find competitors",
      );
    } finally {
      setDiscovering(false);
      setLocalStage(null);
    }
  };

  /** Search Google's local pack for a keyword in a place — the primary
   *  discovery path for LOCAL businesses. Every business with a website lands
   *  as a proposal in the ruling queue below; the whole pack renders inline. */
  const findLocalCompetitors = async () => {
    if (!resolvedSiteId || !localKeyword.trim() || !localArea.trim()) return;
    setLocalSearching(true);
    setLocalStage("Running the local search");
    try {
      const result = await discoverLocalCompetitors(
        resolvedSiteId,
        localKeyword.trim(),
        localArea.trim(),
        dispatch,
        setLocalStage,
      );
      setLocalResult(result);
      await refresh();
      toast.success(
        result.count
          ? `${result.businesses.length} businesses in the pack — ${result.count} proposed for your ruling.`
          : `${result.businesses.length} businesses in the pack — nothing new to propose.`,
      );
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : "Local competitor search failed",
      );
    } finally {
      setLocalSearching(false);
      setLocalStage(null);
    }
  };

  // ── The ONE write path per entity ────────────────────────────────────────
  // Both the user's row-action click and the surface write target go through
  // these. They deliberately do NOT catch: the row-action wrappers below turn a
  // failure into a toast, while the write handlers let it propagate so the
  // writeback seam converts it into the error envelope the agent reads. A
  // shared `try/catch` here would have swallowed the agent's only feedback.
  const applyTracking = useCallback(
    async (id: string, status: CompetitorTrackingStatus) => {
      await updateCompetitorTracking(id, status);
      await refresh();
    },
    [resolvedSiteId, queryClient],
  );

  const applyOpportunityStatus = useCallback(
    async (id: string, status: OpportunityStatus) => {
      await updateOpportunityStatus(id, status);
      await refresh();
    },
    [resolvedSiteId, queryClient],
  );

  const mutateTracking = async (
    id: string,
    status: CompetitorTrackingStatus,
  ) => {
    try {
      await applyTracking(id, status);
      toast.success(
        status === "tracked" ? "Competitor is now tracked" : "Tracking updated",
      );
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : "Could not update competitor",
      );
    }
  };

  /** Inline dropdown edit for the Classification column (MSR-18). Writes
   *  through the same `saveCompetitorClassification` path as the full editor
   *  and the ground-truth ruling, with `confirm=false` — a dropdown pick is
   *  never itself a human ruling; only an explicit Confirm/Right action
   *  stamps `classification_status='confirmed'`. */
  const saveClassificationEdits = async (
    edits: CellEditsMap,
    rows: CompetitorRow[],
  ) => {
    const rowsById = new Map(rows.map((row) => [row.id, row]));
    for (const [rowId, fields] of Object.entries(edits)) {
      if (!Object.hasOwn(fields, "entity_role")) continue;
      const row = rowsById.get(rowId);
      if (!row) throw new Error("That competitor is no longer in this workspace.");
      const nextRole = fields.entity_role;
      if (typeof nextRole !== "string" || !nextRole)
        throw new Error("Choose a classification and try again.");
      await saveCompetitorClassification(
        rowId,
        {
          business_overlap: row.business_overlap,
          market_overlap: row.market_overlap,
          entity_role: nextRole as CompetitorRow["entity_role"],
          peer_scale: row.peer_scale,
          posture: row.posture,
          use_for_link_gap: row.use_for_link_gap,
          custom_labels: row.custom_labels,
        },
        false,
      );
    }
    await refresh();
  };

  const mutateOpportunity = async (id: string, status: OpportunityStatus) => {
    try {
      await applyOpportunityStatus(id, status);
      toast.success(
        status === "completed" ? "Action completed" : "Action status updated",
      );
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : "Could not update action",
      );
    }
  };

  // ── Write half of the marketing-competitors surface ──────────────────────
  // An agent may STAGE the next autopsy (who to look at, how much to buy) and
  // TRIAGE what the last one produced. It may never press Run — that spends
  // provider credits and crawls someone else's pages — and it may never touch
  // a provider fact, a crawl observation, or an AI judgment. See the
  // writeTargets docblock in `marketing-competitors.manifest.ts`.
  //
  // WHY A REF AND NOT THE RENDER CLOSURE: when an agent stages several targets
  // in one turn, the writeback seam resolves EVERY handler closure BEFORE the
  // user confirms the first dialog. A handler that decided which row to write
  // from its render closure could therefore act on a stale snapshot — writing a
  // status onto a row the user is no longer looking at. Both selection-scoped
  // handlers resolve the visible rows (and the run state) through this ref at
  // APPLY time instead, and refuse the whole write on one unknown id.
  const liveRef = useRef<{
    competitors: Array<{ id: string; label: string; peerScale: CompetitorRow["peer_scale"] }>;
    opportunities: Array<{ id: string; label: string }>;
    runStatus: typeof run.status;
  }>({ competitors: [], opportunities: [], runStatus: "idle" });

  useEffect(() => {
    liveRef.current = {
      competitors: (data?.competitors ?? []).map((row) => ({
        id: row.id,
        label: row.display_domain ?? row.normalized_domain ?? row.id,
        // Carried so an agent write that omits peer_scale preserves the axis
        // instead of silently clearing it.
        peerScale: row.peer_scale,
      })),
      opportunities: (data?.opportunities ?? []).map((row) => ({
        id: row.id,
        label: row.title ?? row.id,
      })),
      runStatus: run.status,
    };
  }, [data, run.status]);

  /** A run in flight replaces exactly the rows these targets write to, and
   *  disables the button the staged plan exists to feed. Refuse rather than
   *  land a value onto state that is about to be thrown away. */
  const assertNoRunInFlight = (target: string) => {
    if (liveRef.current.runStatus === "running") {
      throw new Error(
        `${target} is unavailable while a competitor autopsy is running — the run is about to replace these rows. Wait for it to finish, then try again.`,
      );
    }
  };

  const getSurfaceWriteHandlers = () => ({
    autopsy_run_plan: (value: unknown) => {
      assertNoRunInFlight("autopsy_run_plan");
      // Validated in a PURE module, OUTSIDE the state updaters, so the throw is
      // synchronous and lands in the writeback seam's catch. A throw raised
      // inside a setState callback fires during React's commit instead, and the
      // agent would read a success envelope for a value that never landed.
      const patch = parseAutopsyRunPlan(value);
      if (patch.domains !== undefined) {
        setDomains(serializeCompetitorDomains(patch.domains));
      }
      if (patch.maxCompetitors !== undefined) {
        setMaxCompetitors(patch.maxCompetitors);
      }
      if (patch.pagesPerCompetitor !== undefined) {
        setPagesPerCompetitor(patch.pagesPerCompetitor);
      }
    },
    competitor_tracking: async (value: unknown) => {
      assertNoRunInFlight("competitor_tracking");
      const write = parseCompetitorTrackingWrite(
        value,
        liveRef.current.competitors,
      );
      await applyTracking(write.competitorId, write.trackingStatus);
    },
    opportunity_status: async (value: unknown) => {
      assertNoRunInFlight("opportunity_status");
      const write = parseOpportunityStatusWrite(
        value,
        liveRef.current.opportunities,
      );
      await applyOpportunityStatus(write.opportunityId, write.status);
    },
    competitor_classification: async (value: unknown) => {
      const write = object(value);
      if (!write || typeof write.competitorId !== "string") throw new Error("Competitor confirmation is missing its record id.");
      const row = liveRef.current.competitors.find((item) => item.id === write.competitorId);
      if (!row) throw new Error("That competitor is no longer in this workspace.");
      await saveCompetitorClassification(write.competitorId, {
        business_overlap: String(write.business_overlap) as CompetitorRow["business_overlap"],
        market_overlap: String(write.market_overlap) as CompetitorRow["market_overlap"],
        entity_role: String(write.entity_role) as CompetitorRow["entity_role"],
        peer_scale: typeof write.peer_scale === "string"
          ? (write.peer_scale as CompetitorRow["peer_scale"])
          : row.peerScale,
        posture: String(write.posture) as CompetitorRow["posture"],
        use_for_link_gap: write.use_for_link_gap === true,
        custom_labels: Array.isArray(write.custom_labels) ? write.custom_labels.map(String) : [],
      }, true);
      await refresh();
    },
  });

  const competitorColumns = useMemo<MatrxColumnDef<CompetitorRow>[]>(
    () => [
      {
        accessorKey: "display_domain",
        header: "Competitor",
        cell: (row) =>
          externalLink(`https://${row.normalized_domain}`, row.display_domain),
        filter: "text",
      },
      { accessorKey: "tracking_status", header: "Tracking", filter: "select" },
      {
        // Bound to the raw `entity_role` enum (not the derived label string)
        // so the inline `editable: "select"` dropdown's committed value lines
        // up with `editOptions` — MSR-18. The cell still shows the full
        // human label via `derivedCompetitorLabel`, which also folds in
        // business/market overlap for the non-role-driven cases.
        accessorKey: "entity_role",
        header: "Classification",
        filter: "select",
        filterOptions: ENTITY_ROLE_EDIT_OPTIONS,
        editable: "select",
        editOptions: ENTITY_ROLE_EDIT_OPTIONS,
        width: 190,
        cell: (row) => (
          <Badge
            variant={row.classification_status === "confirmed" ? "default" : "secondary"}
            className="max-w-full truncate whitespace-nowrap"
            title={derivedCompetitorLabel(row)}
          >
            {derivedCompetitorLabel(row)}
          </Badge>
        ),
      },
      { accessorKey: "classification_status", header: "Decision", filter: "select" },
      { accessorKey: "threat_level", header: "Threat", filter: "select" },
      {
        accessorKey: "relevance_score",
        header: "Relevance",
        filter: "number",
        align: "right",
        cell: (row) => (
          <span
            className={`font-semibold tabular-nums ${scoreTone(row.relevance_score)}`}
          >
            {row.relevance_score ?? "—"}
          </span>
        ),
      },
      {
        accessorKey: "keyword_intersections",
        header: "Shared keywords",
        filter: "number",
        align: "right",
      },
      {
        accessorKey: "organic_keywords",
        header: "Organic keywords",
        filter: "number",
        align: "right",
      },
      {
        accessorKey: "estimated_traffic",
        header: "Est. traffic",
        filter: "number",
        align: "right",
        cell: (row) => (
          <span className="tabular-nums">{formatTraffic(row.estimated_traffic)}</span>
        ),
      },
      {
        accessorKey: "average_position",
        header: "Avg. position",
        filter: "number",
        align: "right",
        cell: (row) => (
          <span className="tabular-nums">{formatPosition(row.average_position)}</span>
        ),
      },
      { accessorKey: "discovery_source", header: "Source", filter: "select" },
      {
        accessorKey: "last_observed_at",
        header: "Last observed",
        filter: "text",
        cell: (row) => dateCell(row.last_observed_at),
      },
    ],
    [],
  );

  const opportunityColumns = useMemo<
    MatrxColumnDef<CompetitorOpportunityRow>[]
  >(
    () => [
      {
        accessorKey: "priority",
        header: "Priority",
        filter: "number",
        align: "right",
        cell: (row) => (
          <span className={`font-bold tabular-nums ${scoreTone(row.priority)}`}>
            {row.priority}
          </span>
        ),
      },
      {
        accessorKey: "title",
        header: "Opportunity",
        filter: "text",
        width: 280,
      },
      { accessorKey: "status", header: "Status", filter: "select" },
      { accessorKey: "opportunity_type", header: "Type", filter: "select" },
      {
        accessorKey: "competitor_domain",
        header: "Competitor",
        filter: "text",
        cell: (row) => externalLink(row.competitor_url, row.competitor_domain),
      },
      {
        accessorKey: "target_page_url",
        header: "Your page",
        filter: "text",
        cell: (row) =>
          row.target_page_id ? (
            <Link
              href={marketingRoutes.sitePage(
                null,
                row.site_id,
                row.target_page_id,
              )}
              className="block max-w-64 truncate text-primary hover:underline"
              onClick={(event) => event.stopPropagation()}
            >
              {row.target_page_url ?? row.target_page_id}
            </Link>
          ) : (
            <span className="text-muted-foreground">New asset</span>
          ),
      },
      {
        accessorKey: "primary_keyword",
        header: "Primary keyword",
        filter: "text",
      },
      { accessorKey: "impact", header: "Impact", filter: "select" },
      { accessorKey: "effort", header: "Effort", filter: "select" },
      {
        accessorKey: "confidence",
        header: "Confidence",
        filter: "number",
        align: "right",
      },
      {
        accessorKey: "recommended_action",
        header: "Recommended action",
        filter: "text",
        width: 360,
      },
    ],
    [],
  );

  const runColumns = useMemo<MatrxColumnDef<CompetitorRunRow>[]>(
    () => [
      { accessorKey: "status", header: "Status", filter: "select" },
      {
        accessorKey: "created_at",
        header: "Started",
        filter: "text",
        cell: (row) => dateCell(row.created_at),
      },
      {
        accessorKey: "completed_at",
        header: "Completed",
        filter: "text",
        cell: (row) => dateCell(row.completed_at),
      },
      {
        accessorKey: "attempt_count",
        header: "Attempts",
        filter: "number",
        align: "right",
      },
      {
        accessorKey: "reported_cost",
        header: "Reported cost",
        filter: "number",
        align: "right",
      },
      { accessorKey: "id", header: "Run ID", filter: "text" },
    ],
    [],
  );

  const availableSites = sites.data ?? [];
  const brandSiteCounts = new Map<string, number>();
  for (const site of availableSites) {
    const label = siteBrandLabel(site);
    brandSiteCounts.set(label, (brandSiteCounts.get(label) ?? 0) + 1);
  }
  const headerModes = COMPETITOR_VIEWS.map((view) => ({
    name: view.name,
    icon: view.icon,
    href: competitorViewHref(view.id, resolvedSiteId),
  }));
  const headerOptions = availableSites.map((site) => {
    const brandLabel = siteBrandLabel(site);
    return {
      label:
        (brandSiteCounts.get(brandLabel) ?? 0) > 1
          ? `${brandLabel} · ${site.domain}`
          : brandLabel,
      href: competitorViewHref(activeView, site.id),
      active: site.id === resolvedSiteId,
    };
  });

  return (
    <SurfaceRuntimeProvider
      surfaceName="matrx-user/marketing-competitors"
      getScope={() =>
        createMarketingCompetitorsScope({
          site_id: resolvedSiteId ?? undefined,
          site: sites.data?.find((site) => site.id === resolvedSiteId) as
            Record<string, unknown> | undefined,
          competitors: data?.competitors as
            Array<Record<string, unknown>> | undefined,
          opportunities: data?.opportunities as
            Array<Record<string, unknown>> | undefined,
          latest_autopsy: latestArtifact as Record<string, unknown> | undefined,
          active_run: run as unknown as Record<string, unknown>,
          // The staged run plan — the read twins of `autopsy_run_plan`, so the
          // agent can see what is already in the card before it patches it.
          autopsy_competitor_domains: parseCompetitorDomainsField(domains),
          autopsy_max_competitors: maxCompetitors,
          autopsy_pages_per_competitor: pagesPerCompetitor,
          autopsy_force_refresh: forceRefresh,
          selection: resolvedSiteId ?? undefined,
        })
      }
      getWriteHandlers={getSurfaceWriteHandlers}
    >
      <EntityModeHeader
        backHref={marketingRoutes.home()}
        entityLabel={
          selectedSite ? siteBrandLabel(selectedSite) : "Choose a brand"
        }
        entityOptions={headerOptions}
        modes={headerModes}
        activeModeHref={competitorViewHref(activeView, resolvedSiteId)}
        actions={[
          {
            label: "Refresh",
            icon: RefreshCw,
            onPress: () => void refresh(),
            disabled: workspace.isFetching,
          },
        ]}
      />
      <main className="flex h-full min-h-0 w-full flex-col overflow-hidden bg-textured pt-[var(--shell-header-h)]">
        <div className="min-h-0 flex-1 space-y-3 overflow-y-auto px-3 pb-3 sm:px-4">
          <AssistStrip surfaceName="matrx-user/marketing-competitors" />

          {activeView === "run" ? (
            <section className="rounded-lg border border-border bg-card p-3 sm:p-4">
              <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
                <h2 className="text-sm font-semibold text-foreground">
                  Run a fresh autopsy
                </h2>
                <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
                  <span>{data?.competitors.length ?? 0} competitors</span>
                  <span>{openActions} open actions</span>
                  <span>
                    {latestArtifact?.already_have_percentage ?? "—"}
                    {typeof latestArtifact?.already_have_percentage === "number"
                      ? "% covered"
                      : " covered"}
                  </span>
                </div>
              </div>

              <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_20rem]">
                <div className="space-y-3">
                  <div className="flex flex-wrap items-center gap-2">
                    <Label className="mr-1">Competitor market</Label>
                    <Button
                      type="button"
                      size="sm"
                      variant={autopsyScope === "national" ? "default" : "outline"}
                      className="gap-2"
                      onClick={() => setAutopsyScope("national")}
                    >
                      <Globe className="size-3.5" />
                      National
                    </Button>
                    <Button
                      type="button"
                      size="sm"
                      variant={autopsyScope === "local" ? "default" : "outline"}
                      className="gap-2"
                      onClick={() => setAutopsyScope("local")}
                    >
                      <MapPin className="size-3.5" />
                      Local
                    </Button>
                    <span className="text-xs text-muted-foreground">
                      {autopsyScope === "local"
                        ? "Google Maps results for a service and area."
                        : "Nationwide keyword overlap."}
                    </span>
                  </div>

                  {autopsyScope === "local" ? (
                    <div className="grid gap-3 sm:grid-cols-2">
                      <div className="space-y-1.5">
                        <Label htmlFor="autopsy-local-keyword">
                          {LOCAL_SEARCH_KEYWORD_LABEL}
                        </Label>
                        <Input
                          id="autopsy-local-keyword"
                          value={autopsyLocalKeyword}
                          placeholder={LOCAL_SEARCH_KEYWORD_PLACEHOLDER}
                          className="max-sm:text-base"
                          onChange={(event) =>
                            setAutopsyLocalKeyword(event.target.value)
                          }
                        />
                      </div>
                      <div className="space-y-1.5">
                        <Label htmlFor="autopsy-local-area">
                          {LOCAL_SEARCH_AREA_LABEL}
                        </Label>
                        <Input
                          id="autopsy-local-area"
                          value={autopsyLocalArea}
                          placeholder={LOCAL_SEARCH_AREA_PLACEHOLDER}
                          className="max-sm:text-base"
                          onChange={(event) =>
                            setAutopsyLocalArea(event.target.value)
                          }
                        />
                      </div>
                    </div>
                  ) : (
                    <div className="space-y-1.5">
                      <Label htmlFor="competitor-domains">
                        Include specific competitors{" "}
                        <span className="font-normal text-muted-foreground">
                          (optional)
                        </span>
                      </Label>
                      <Textarea
                        id="competitor-domains"
                        value={domains}
                        onChange={(event) => setDomains(event.target.value)}
                        placeholder="One domain per line. Leave blank for automatic discovery."
                        className="min-h-24 resize-none max-sm:text-base"
                      />
                    </div>
                  )}
                </div>

                <div className="flex flex-col gap-3 border-border lg:border-l lg:pl-4">
                  <div className="grid grid-cols-2 gap-3">
                    <div className="space-y-1.5">
                      <Label>Competitors</Label>
                      <Select
                        value={String(maxCompetitors)}
                        onValueChange={(value) =>
                          setMaxCompetitors(Number(value))
                        }
                      >
                        <SelectTrigger className="max-sm:text-base">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          {AUTOPSY_RUN_BOUND_CHOICES.map((value) => (
                            <SelectItem key={value} value={String(value)}>
                              {value}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="space-y-1.5">
                      <Label>Pages each</Label>
                      <Select
                        value={String(pagesPerCompetitor)}
                        onValueChange={(value) =>
                          setPagesPerCompetitor(Number(value))
                        }
                      >
                        <SelectTrigger className="max-sm:text-base">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          {AUTOPSY_RUN_BOUND_CHOICES.map((value) => (
                            <SelectItem key={value} value={String(value)}>
                              {value}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <Checkbox
                      id="force-refresh"
                      checked={forceRefresh}
                      onCheckedChange={(value) =>
                        setForceRefresh(value === true)
                      }
                    />
                    <Label htmlFor="force-refresh" className="font-normal">
                      Ignore today&apos;s cached evidence
                    </Label>
                  </div>
                  <Button
                    className="mt-auto w-full gap-2"
                    disabled={
                      !resolvedSiteId ||
                      run.status === "running" ||
                      localScopeIncomplete
                    }
                    onClick={() =>
                      void start({
                        competitorDomains:
                          autopsyScope === "local"
                            ? []
                            : parseCompetitorDomainsField(domains),
                        maxCompetitors,
                        pagesPerCompetitor,
                        forceRefresh,
                        ...(autopsyScope === "local"
                          ? {
                              localKeyword: autopsyLocalKeyword,
                              localLocation: autopsyLocalArea,
                            }
                          : {}),
                      })
                    }
                  >
                    {run.status === "running" ? (
                      <Loader2 className="size-4 animate-spin" />
                    ) : (
                      <ScanSearch className="size-4" />
                    )}
                    {run.status === "running"
                      ? "Building the autopsy"
                      : autopsyScope === "local"
                        ? "Run local autopsy"
                        : "Run autopsy"}
                  </Button>
                </div>
              </div>
            </section>
          ) : null}

        {/* Only while the run is live. The strategist's output is pure structured
          JSON, so the canonical renderer has no text to show and parks on its
          "Processing…" shimmer — which, left mounted after completion, sat under
          a finished "Autopsy complete" run forever. The verdict card and the
          tables below ARE the finished output. */}
        {activeView === "run" && run.status === "running" ? (
          <LiveRunDisplay
            requestId={run.requestId}
            pending={!run.requestId}
            label={run.stage ?? "Competitor autopsy"}
            bodyClassName="max-h-[34rem]"
          />
        ) : null}
        {activeView === "run" && run.error ? (
          <div className="rounded-lg border border-destructive/30 bg-destructive/5 px-4 py-3 text-sm text-destructive">
            {run.error}
          </div>
        ) : null}

        {/* ONE door to the ruling queue, not a wall of twelve. This used to
            render a button per proposal that scrolled to a table row; the Review
            tab is now where a proposal is ruled on, so a second list of the same
            rows is noise between the reader and the work. */}
        {activeView === "run" && proposed.length ? (
          <Card className="border-amber-500/30 bg-amber-500/[0.04]">
            <CardContent className="flex flex-wrap items-center justify-between gap-3 py-4">
              <div className="min-w-0">
                <p className="text-sm font-medium">
                  {proposed.length} {proposed.length === 1 ? "call is" : "calls are"} waiting on you
                </p>
                <p className="text-xs text-muted-foreground">
                  Nothing here drives spend until you say it is right.
                </p>
              </div>
              <Button
                size="sm"
                className="shrink-0"
                onClick={() =>
                  router.push(competitorViewHref("review", resolvedSiteId))
                }
              >
                Review them
              </Button>
            </CardContent>
          </Card>
        ) : null}

        {activeView === "run" && latestArtifact?.executive_verdict ? (
          <Card className="border-primary/20">
            <CardHeader className="pb-2">
              <CardTitle className="flex items-center gap-2 text-sm">
                <CircleDot className="size-4 text-primary" />
                Latest verdict
              </CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-base font-medium leading-7">
                {latestArtifact.executive_verdict}
              </p>
              {latestArtifact.summary ? (
                <p className="mt-2 text-sm leading-6 text-muted-foreground">
                  {latestArtifact.summary}
                </p>
              ) : null}
            </CardContent>
          </Card>
        ) : null}

        <Tabs value={activeView} className="min-w-0">
          {/* THE STAGED-CONFIDENCE PATTERN, in the real product: establish the
              facts, then rule on the proposals built from them. His rulings ARE
              the ground truth, collected as a side effect of using the tool. */}
          <TabsContent value="review" className="mt-0 space-y-3">
            <ManualCompetitorAdd site={selectedSite} onAdded={refresh} />
            <LandscapeBriefCard site={selectedSite} onGuidanceSaved={refresh} />
            <div className="flex flex-wrap items-center gap-2">
              <Button
                variant="outline"
                size="sm"
                className="gap-2"
                disabled={!selectedSite || discovering}
                onClick={() => void findCompetitors()}
              >
                {discovering ? (
                  <Loader2 className="size-3.5 animate-spin" />
                ) : (
                  <ScanSearch className="size-3.5" />
                )}
                Find my competitors
              </Button>
              <span className="text-xs text-muted-foreground">
                {discovering && localStage
                  ? `${localStage}…`
                  : "Finds rivals in your search results for you to review."}
              </span>
            </div>
            <div className="rounded-md border border-border bg-card p-3">
              <div className="flex flex-wrap items-end gap-2">
                <div className="flex min-w-44 flex-1 flex-col gap-1">
                  <Label htmlFor="local-search-keyword" className="text-xs">
                    {LOCAL_SEARCH_KEYWORD_LABEL}
                  </Label>
                  <Input
                    id="local-search-keyword"
                    value={localKeyword}
                    placeholder={LOCAL_SEARCH_KEYWORD_PLACEHOLDER}
                    className="max-sm:text-base"
                    onChange={(event) => setLocalKeyword(event.target.value)}
                  />
                </div>
                <div className="flex min-w-44 flex-1 flex-col gap-1">
                  <Label htmlFor="local-search-area" className="text-xs">
                    {LOCAL_SEARCH_AREA_LABEL}
                  </Label>
                  <Input
                    id="local-search-area"
                    value={localArea}
                    placeholder={LOCAL_SEARCH_AREA_PLACEHOLDER}
                    className="max-sm:text-base"
                    onChange={(event) => setLocalArea(event.target.value)}
                    onKeyDown={(event) => {
                      if (event.key === "Enter") void findLocalCompetitors();
                    }}
                  />
                </div>
                <Button
                  size="sm"
                  className="gap-2"
                  disabled={
                    !selectedSite ||
                    localSearching ||
                    !localKeyword.trim() ||
                    !localArea.trim()
                  }
                  onClick={() => void findLocalCompetitors()}
                >
                  {localSearching ? (
                    <Loader2 className="size-3.5 animate-spin" />
                  ) : (
                    <MapPin className="size-3.5" />
                  )}
                  Find local competitors
                </Button>
              </div>
              {localSearching && localStage ? (
                <p className="mt-1.5 text-xs text-muted-foreground">
                  {localStage}…
                </p>
              ) : null}
              <p className="mt-1.5 text-xs text-muted-foreground">
                Shows the businesses Google places on the map for this search.
              </p>
              {localResult ? (
                <div className="mt-3 space-y-1">
                  <p className="text-xs font-medium">
                    “{localResult.keyword}” in {localResult.canonical_location}
                  </p>
                  {localResult.businesses.length === 0 ? (
                    <p className="text-xs text-muted-foreground">
                      Google showed no local pack for this search — try a service
                      keyword a customer would actually type.
                    </p>
                  ) : (
                    <ul className="divide-y divide-border rounded-md border border-border">
                      {localResult.businesses.map((business, index) => (
                        <li
                          key={`${business.name}-${index}`}
                          className="flex flex-wrap items-center gap-x-3 gap-y-0.5 px-2.5 py-1.5 text-sm"
                        >
                          <span className="w-5 shrink-0 text-xs tabular-nums text-muted-foreground">
                            {business.position ?? "—"}
                          </span>
                          <span className="font-medium">{business.name}</span>
                          {business.is_own ? (
                            <Badge variant="secondary">Your listing</Badge>
                          ) : business.competitor_id ? (
                            <Badge variant="outline">Proposed below</Badge>
                          ) : business.domain ? null : (
                            <Badge variant="outline" className="text-muted-foreground">
                              No website
                            </Badge>
                          )}
                          {business.rating != null ? (
                            <span className="text-xs text-muted-foreground">
                              ★ {business.rating}
                              {business.reviews != null ? ` (${business.reviews})` : ""}
                            </span>
                          ) : null}
                          {business.domain ? (
                            <a
                              href={business.website ?? `https://${business.domain}`}
                              target="_blank"
                              rel="noreferrer"
                              className="text-xs text-muted-foreground underline-offset-2 hover:underline"
                            >
                              {business.domain}
                            </a>
                          ) : null}
                          {business.address ? (
                            <span className="ml-auto truncate text-xs text-muted-foreground">
                              {business.address}
                            </span>
                          ) : null}
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
              ) : null}
            </div>
            <GroundTruthQueue
              competitors={data?.competitors ?? []}
              onSaved={refresh}
            />
          </TabsContent>

          <TabsContent value="opportunities" className="mt-0">
            <MatrxDataTable
              urlState={{ id: "competitor-opportunities" }}
              data={data?.opportunities ?? []}
              columns={opportunityColumns}
              getRowId={(row) => row.id}
              isLoading={workspace.isLoading}
              isFetching={workspace.isFetching}
              // MSR-19/20: row click opens the canonical WindowPanel, never
              // the side drawer. `detail: { enabled: false }` removes the
              // drawer entirely; `onOpen` is required or the opener falls
              // through to `onRowOpen` instead of opening the window (the
              // same bug already fixed on the search-console insight tables,
              // features/marketing/search-console/components/insights/InsightsTab.tsx).
              detail={{ enabled: false }}
              window={{
                title: (row) => row.title,
                renderView: (row) => <OpportunityDetail row={row} />,
                enabled: true,
                openOnRowClick: true,
                onOpen: () => {},
              }}
              rowActions={(row) => (
                <div className="flex items-center gap-1">
                  {row.status === "open" ? (
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => void mutateOpportunity(row.id, "accepted")}
                    >
                      Accept
                    </Button>
                  ) : null}
                  {row.status === "accepted" ? (
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() =>
                        void mutateOpportunity(row.id, "in_progress")
                      }
                    >
                      Start
                    </Button>
                  ) : null}
                  {row.status === "in_progress" ? (
                    <Button
                      size="sm"
                      onClick={() =>
                        void mutateOpportunity(row.id, "completed")
                      }
                    >
                      Complete
                    </Button>
                  ) : null}
                  {row.status !== "completed" && row.status !== "dismissed" ? (
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() =>
                        void mutateOpportunity(row.id, "dismissed")
                      }
                    >
                      Dismiss
                    </Button>
                  ) : null}
                </div>
              )}
              emptyState={{
                icon: <Target className="size-8" />,
                title: "No opportunities yet",
                description:
                  "Run an autopsy to turn competitive evidence into a prioritized action list.",
              }}
            />
          </TabsContent>

          <TabsContent value="competitors" className="mt-0">
            <MatrxDataTable
              urlState={{ id: "competitors" }}
              data={data?.competitors ?? []}
              columns={competitorColumns}
              getRowId={(row) => row.id}
              isLoading={workspace.isLoading}
              isFetching={workspace.isFetching}
              // MSR-19/20: canonical WindowPanel on row click, no side drawer.
              detail={{ enabled: false }}
              window={{
                title: (row) => row.display_name || row.display_domain,
                renderView: (row) => (
                  <div id={`competitor-review-${row.id}`}>
                    <CompetitorClassificationEditor row={row} onSaved={refresh} />
                  </div>
                ),
                enabled: true,
                openOnRowClick: true,
                onOpen: () => {},
              }}
              edit={{ enabled: true, onSave: saveClassificationEdits }}
              rowActions={(row) =>
                // "tracked" is the server's vocabulary (see autopsy-controls);
                // this row action sent "tracking" until 2026-08-12, which the
                // canonical RPC rejects outright.
                row.tracking_status === "tracked" ? (
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() => void mutateTracking(row.id, "ignored")}
                  >
                    Stop tracking
                  </Button>
                ) : (
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => void mutateTracking(row.id, "tracked")}
                  >
                    Track
                  </Button>
                )
              }
              emptyState={{
                icon: <Swords className="size-8" />,
                title: "No competitors identified",
                description:
                  "Automatic discovery measures real keyword overlap before adding a rival.",
              }}
            />
          </TabsContent>

          <TabsContent value="evidence" className="mt-0">
            <div className="grid gap-4 lg:grid-cols-3">
              <Card>
                <CardHeader>
                  <CardTitle className="text-sm">Coverage</CardTitle>
                </CardHeader>
                <CardContent className="space-y-3 text-sm">
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">
                      Competitors analyzed
                    </span>
                    <strong>
                      {latestArtifact?.evidence_coverage
                        ?.competitors_analyzed ?? 0}
                    </strong>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Pages crawled</span>
                    <strong>
                      {latestArtifact?.evidence_coverage
                        ?.competitor_pages_crawled ?? 0}
                    </strong>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">
                      Keywords compared
                    </span>
                    <strong>
                      {latestArtifact?.evidence_coverage?.keywords_compared ??
                        0}
                    </strong>
                  </div>
                </CardContent>
              </Card>
              <Card className="lg:col-span-2">
                <CardHeader>
                  <CardTitle className="text-sm">Known limitations</CardTitle>
                </CardHeader>
                <CardContent>
                  {latestArtifact?.evidence_coverage?.limitations?.length ? (
                    <ul className="space-y-2 text-sm text-muted-foreground">
                      {latestArtifact.evidence_coverage.limitations.map(
                        (item, index) => (
                          <li
                            key={index}
                            className="rounded-md bg-muted/50 px-3 py-2"
                          >
                            {item}
                          </li>
                        ),
                      )}
                    </ul>
                  ) : (
                    <p className="text-sm text-muted-foreground">
                      No limitations were recorded for the latest run.
                    </p>
                  )}
                </CardContent>
              </Card>
            </div>
          </TabsContent>

          <TabsContent value="history" className="mt-0">
            <MatrxDataTable
              urlState={{ id: "competitor-autopsy-runs" }}
              data={data?.runs ?? []}
              columns={runColumns}
              getRowId={(row) => row.id}
              isLoading={workspace.isLoading}
              isFetching={workspace.isFetching}
              detail={{ enabled: false }}
              window={{
                title: (row) => `Autopsy ${row.id}`,
                enabled: true,
                openOnRowClick: true,
                onOpen: () => {},
              }}
              emptyState={{
                title: "No autopsy history",
                description:
                  "Every run will remain here with its durable result and cost evidence.",
              }}
            />
          </TabsContent>
        </Tabs>

        {activeView !== "run" ? (
          <p className="text-xs text-muted-foreground">
            {tracked} competitor{tracked === 1 ? "" : "s"} tracked.
          </p>
        ) : null}
        </div>
      </main>
    </SurfaceRuntimeProvider>
  );
}
