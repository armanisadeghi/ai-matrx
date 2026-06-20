"use client";

import { useState, useCallback, useMemo, useTransition, useRef } from "react";
import { useRouter } from "next/navigation";
import {
  ExternalLink,
  RefreshCw,
  CheckCircle2,
  AlertTriangle,
  ClipboardPaste,
  ChevronLeft,
  ChevronRight,
  Download,
  Loader2,
  Globe,
  Hash,
  Clock,
  Calendar,
  FileText,
  Tag,
  Info,
  Link2,
  Brain,
  TrendingUp,
  RotateCcw,
  Check,
  X,
  Quote,
  Users,
  Building2,
  Package,
  FlaskConical,
  MapPin,
  ShieldAlert,
} from "lucide-react";
import Image from "next/image";
import Link from "next/link";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  useResearchSource,
  useResearchSources,
  useSourceContent,
  useAnalysisForSource,
  useSourceImportance,
} from "../../hooks/useResearchState";
import { useResearchApi } from "../../hooks/useResearchApi";
import { useResearchStream } from "../../hooks/useResearchStream";
import { useStreamDebug } from "../../context/ResearchContext";
import {
  updateSource,
  updateContentCurated,
  restoreOriginalContent,
} from "../../service";
import { toast } from "sonner";
import { StatusBadge } from "../shared/StatusBadge";
import { SourceTypeIcon } from "../shared/SourceTypeIcon";
import { OriginBadge } from "../shared/OriginBadge";
import { ContentViewer } from "./ContentViewer";
import { PasteContentModal } from "./PasteContentModal";
import { AnalyzeCurationDialog } from "./AnalyzeCurationDialog";
import { AnalysisCard } from "../analysis/AnalysisCard";
import { SourceTagPicker } from "./SourceTagPicker";
import { SourceRankBadges } from "./SourceRankBadges";
import { AuthorityTierBadge } from "./AuthorityTierBadge";
import { SourceVerdictBadge } from "./SourceVerdictBadge";
import MarkdownStream from "@/components/MarkdownStream";
import type {
  ResearchSource,
  ResearchContent,
  ResearchAnalysis,
  ResearchDataEvent,
  PageAnalysis,
  PageFinding,
  EvidenceSignals,
  BiasAndRiskSignals,
  EntitiesMentioned,
} from "../../types";
import {
  jsonArrayLength,
  pageAnalysisFromJson,
  sourceOriginFromDb,
  sourceTypeFromDb,
  stringArrayFromJson,
} from "../../types";

function formatPageAge(pageAge: string | null): string {
  if (!pageAge) return "—";
  const date = new Date(pageAge);
  if (isNaN(date.getTime())) return pageAge;
  const days = Math.floor(
    (Date.now() - date.getTime()) / (1000 * 60 * 60 * 24),
  );
  const formatted = date.toLocaleDateString(undefined, {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
  if (days === 0) return `${formatted} (today)`;
  if (days === 1) return `${formatted} (1 day ago)`;
  if (days < 30) return `${formatted} (${days} days ago)`;
  if (days < 365) return `${formatted} (${Math.floor(days / 30)} months ago)`;
  return `${formatted} (${Math.floor(days / 365)} years ago)`;
}

function MetaRow({
  label,
  children,
  icon,
}: {
  label: string;
  children: React.ReactNode;
  icon?: React.ReactNode;
}) {
  return (
    <div className="flex items-start justify-between gap-3 py-1.5 border-b border-border/50 last:border-0">
      <span className="text-xs text-muted-foreground flex items-center gap-1.5 shrink-0 pt-0.5">
        {icon}
        {label}
      </span>
      <div className="text-xs font-medium text-right">{children}</div>
    </div>
  );
}

// ============================================================================
// PAGE ANALYSIS DOCUMENT — renders the full structured per-page read
// (rs_source.page_analysis). Every field is surfaced; nothing is dropped.
// Restrained, professional treatment: integers only, scores lead as numbers,
// muted accents (no bright pills, no alarm red), light + dark via tokens.
// ============================================================================

/** Round a 0-100 score to an integer; em-dash when absent. */
function fmtScore(n: number | null | undefined): string {
  return n == null ? "—" : String(Math.round(n));
}

/** A 0-100 score with a quiet meter bar + integer value (label stays separate). */
function ScoreBar({
  label,
  score,
  /** When true, a HIGH value is BAD (commercial bias) — flip the fill tone. */
  inverted = false,
  hint,
}: {
  label: string;
  score: number | null;
  inverted?: boolean;
  hint?: string;
}) {
  const pct = score == null ? 0 : Math.max(0, Math.min(100, Math.round(score)));
  // Goodness drives a single restrained fill tone (emerald → neutral → rose,
  // all low-opacity). For an inverted axis, a high score is the bad end.
  const goodness = inverted ? 100 - pct : pct;
  const fill =
    score == null
      ? "bg-muted-foreground/25"
      : goodness >= 67
        ? "bg-emerald-500/55"
        : goodness >= 34
          ? "bg-muted-foreground/45"
          : "bg-rose-500/45";
  return (
    <div className="space-y-1" title={hint}>
      <div className="flex items-baseline justify-between gap-2">
        <span className="text-[11px] text-muted-foreground leading-none">
          {label}
        </span>
        <span className="text-xs font-semibold tabular-nums text-foreground leading-none">
          {fmtScore(score)}
        </span>
      </div>
      <div className="h-1.5 w-full overflow-hidden rounded-full bg-muted/60">
        <div
          className={cn("h-full rounded-full transition-all", fill)}
          style={{ width: `${pct}%` }}
        />
      </div>
    </div>
  );
}

/** Section shell: an uppercase label + icon over its content, with breathing room. */
function AnalysisBlock({
  icon,
  title,
  count,
  children,
}: {
  icon: React.ReactNode;
  title: string;
  count?: number;
  children: React.ReactNode;
}) {
  return (
    <section className="space-y-2.5">
      <div className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
        {icon}
        {title}
        {count != null && count > 0 && (
          <span className="text-muted-foreground/60 tabular-nums">
            ({count})
          </span>
        )}
      </div>
      {children}
    </section>
  );
}

/** One evidence-signal row: a ✓ (present) or ✗ (absent), then the plain label. */
function SignalRow({ present, label }: { present: boolean; label: string }) {
  return (
    <div className="flex items-center gap-2 text-xs">
      {present ? (
        <Check className="h-3.5 w-3.5 shrink-0 text-emerald-600/80 dark:text-emerald-400/80" />
      ) : (
        <X className="h-3.5 w-3.5 shrink-0 text-muted-foreground/40" />
      )}
      <span className={present ? "text-foreground/80" : "text-muted-foreground/60"}>
        {label}
      </span>
    </div>
  );
}

/** A neutral entity chip — monochrome, never coloured (one per entity string). */
function EntityChip({ value }: { value: string }) {
  return (
    <span className="inline-flex max-w-[18rem] truncate rounded-md border border-border/60 bg-muted/40 px-1.5 py-0.5 text-[11px] text-foreground/75">
      {value}
    </span>
  );
}

/** A grouped entity category (People / Organizations / …) — hidden when empty. */
function EntityGroup({
  icon,
  label,
  items,
}: {
  icon: React.ReactNode;
  label: string;
  items: string[];
}) {
  if (items.length === 0) return null;
  return (
    <div className="space-y-1.5">
      <div className="flex items-center gap-1.5 text-[10px] font-medium uppercase tracking-wide text-muted-foreground/70">
        {icon}
        {label}
        <span className="text-muted-foreground/50 tabular-nums">
          ({items.length})
        </span>
      </div>
      <div className="flex flex-wrap gap-1.5">
        {items.map((item, i) => (
          <EntityChip key={`${item}-${i}`} value={item} />
        ))}
      </div>
    </div>
  );
}

/** One core-finding card: the finding + its supporting text + confidence/importance/type. */
function FindingCard({ finding }: { finding: PageFinding }) {
  const confidencePct =
    finding.confidence == null ? null : Math.round(finding.confidence);
  return (
    <div className="rounded-lg border border-border/60 bg-card/40 p-3 space-y-2">
      <p className="text-xs font-medium leading-relaxed text-foreground/90">
        {finding.finding}
      </p>
      {finding.supporting_text && (
        <p className="border-l-2 border-border/70 pl-2.5 text-[11px] italic leading-relaxed text-muted-foreground">
          {finding.supporting_text}
        </p>
      )}
      {(confidencePct != null || finding.importance || finding.finding_type) && (
        <div className="flex flex-wrap items-center gap-3 pt-0.5">
          {confidencePct != null && (
            <span className="inline-flex items-baseline gap-1 text-[10px] uppercase tracking-wide text-muted-foreground">
              Confidence
              <span className="text-[11px] font-semibold tabular-nums text-foreground">
                {confidencePct}%
              </span>
            </span>
          )}
          {finding.importance && (
            <span className="inline-flex items-center gap-1 text-[10px] uppercase tracking-wide text-muted-foreground">
              <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-muted-foreground/50" />
              {finding.importance}
            </span>
          )}
          {finding.finding_type && (
            <span className="text-[10px] uppercase tracking-wide text-muted-foreground/70">
              {finding.finding_type}
            </span>
          )}
        </div>
      )}
    </div>
  );
}

const EVIDENCE_SIGNAL_LABELS: { key: keyof EvidenceSignals; label: string }[] = [
  { key: "has_primary_data", label: "Primary data" },
  { key: "has_citations", label: "Citations" },
  { key: "has_methodology", label: "Methodology" },
  { key: "has_expert_attribution", label: "Expert attribution" },
  { key: "has_specific_numbers", label: "Specific numbers" },
  { key: "has_dates", label: "Dates" },
  { key: "has_named_sources", label: "Named sources" },
  { key: "has_original_reporting", label: "Original reporting" },
  { key: "has_verifiable_claims", label: "Verifiable claims" },
];

const BIAS_SIGNAL_LABELS: { key: keyof BiasAndRiskSignals; label: string }[] = [
  { key: "is_promotional", label: "Reads as promotional" },
  { key: "is_opinion_heavy", label: "Opinion-heavy" },
  { key: "has_undisclosed_conflicts", label: "Possible undisclosed conflicts" },
  { key: "has_sensational_language", label: "Sensational language" },
  { key: "has_unsupported_claims", label: "Unsupported claims" },
  { key: "is_outdated", label: "May be outdated" },
];

function entitiesTotal(e: EntitiesMentioned | null): number {
  if (!e) return 0;
  return (
    e.people.length +
    e.organizations.length +
    e.products.length +
    e.studies.length +
    e.locations.length
  );
}

/**
 * The full "Page analysis" document for a single source. Renders EVERY field of
 * the structured `PageAnalysis`. When `analysis` is null, the caller shows the
 * honest empty state instead of this component.
 */
function PageAnalysisDocument({
  analysis,
  finalScore,
}: {
  analysis: PageAnalysis;
  finalScore: number | null;
}) {
  const activeBias = analysis.bias_and_risk_signals
    ? BIAS_SIGNAL_LABELS.filter(
        ({ key }) => analysis.bias_and_risk_signals![key],
      )
    : [];
  const entityCount = entitiesTotal(analysis.entities_mentioned);
  const dates = analysis.dates;
  const hasAnyDate =
    dates &&
    (dates.published_date || dates.updated_date || dates.content_timeframe);

  return (
    <div className="space-y-6">
      {/* Header: title + the bottom-line verdict + rejection reason if any */}
      <div className="space-y-2">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-primary/10">
              <Brain className="h-4 w-4 text-primary/70" />
            </div>
            <div>
              <h3 className="text-sm font-semibold leading-none">
                Page analysis
              </h3>
              {analysis.page_type && (
                <p className="mt-1 text-[11px] text-muted-foreground">
                  {analysis.page_type}
                </p>
              )}
            </div>
          </div>
          <SourceVerdictBadge
            finalScore={finalScore}
            recommendedUse={analysis.recommended_use}
            analysisStatus={analysis.analysis_status}
          />
        </div>
        {analysis.should_reject && analysis.rejection_reason && (
          <div className="flex items-start gap-2 rounded-lg border border-rose-500/30 bg-rose-500/[0.05] px-3 py-2">
            <ShieldAlert className="mt-0.5 h-3.5 w-3.5 shrink-0 text-rose-500/70" />
            <p className="text-[11px] leading-relaxed text-foreground/80">
              <span className="font-medium text-muted-foreground">
                Recommended for rejection:{" "}
              </span>
              {analysis.rejection_reason}
            </p>
          </div>
        )}
      </div>

      {/* Score panel — the eight axes as meters + the three fused/staged scores */}
      <AnalysisBlock
        icon={<TrendingUp className="h-3 w-3" />}
        title="Scores"
      >
        <div className="rounded-xl border border-border/60 bg-card/40 p-4 space-y-4">
          {/* Headline scores: final · overall page value · staged pre/post */}
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            <HeadlineScore
              label="Final score"
              value={finalScore}
              emphasize
            />
            <HeadlineScore
              label="Page value"
              value={analysis.overall_page_value_score}
            />
            <HeadlineScore
              label="Post-read"
              value={analysis.authority_after_read_score}
            />
            <HeadlineScore
              label="Relevance"
              value={analysis.topic_relevance_score}
            />
          </div>
          {/* The detailed quality axes as meters */}
          <div className="grid grid-cols-1 gap-x-6 gap-y-3 sm:grid-cols-2">
            <ScoreBar
              label="Content quality"
              score={analysis.content_quality_score}
            />
            <ScoreBar
              label="Evidence quality"
              score={analysis.evidence_quality_score}
            />
            <ScoreBar label="Freshness" score={analysis.freshness_score} />
            <ScoreBar label="Originality" score={analysis.originality_score} />
            <ScoreBar
              label="Specificity"
              score={analysis.specificity_score}
            />
            <ScoreBar
              label="Commercial bias"
              score={analysis.commercial_bias_score}
              inverted
              hint="Higher means more commercially biased — lower is better."
            />
          </div>
        </div>
      </AnalysisBlock>

      {/* Summary — the agent's prose, rendered as real markdown */}
      {analysis.summary_markdown && (
        <AnalysisBlock icon={<FileText className="h-3 w-3" />} title="Summary">
          <div className="rounded-xl border border-border/60 bg-card/40 px-4 py-3">
            <MarkdownStream content={analysis.summary_markdown} />
          </div>
        </AnalysisBlock>
      )}

      {/* Key facts */}
      {analysis.key_facts.length > 0 && (
        <AnalysisBlock
          icon={<Info className="h-3 w-3" />}
          title="Key facts"
          count={analysis.key_facts.length}
        >
          <ul className="space-y-1.5">
            {analysis.key_facts.map((fact, i) => (
              <li key={i} className="flex items-start gap-2 text-xs leading-relaxed">
                <span className="mt-1.5 h-1 w-1 shrink-0 rounded-full bg-muted-foreground/50" />
                <span className="text-foreground/85">{fact}</span>
              </li>
            ))}
          </ul>
        </AnalysisBlock>
      )}

      {/* Notable quotes — styled blockquotes with the speaker attributed */}
      {analysis.notable_quotes.length > 0 && (
        <AnalysisBlock
          icon={<Quote className="h-3 w-3" />}
          title="Notable quotes"
          count={analysis.notable_quotes.length}
        >
          <div className="space-y-2.5">
            {analysis.notable_quotes.map((q, i) => (
              <blockquote
                key={i}
                className="rounded-lg border-l-2 border-primary/40 bg-muted/30 px-3 py-2"
              >
                <p className="text-xs italic leading-relaxed text-foreground/85">
                  &ldquo;{q.quote}&rdquo;
                </p>
                {q.speaker && (
                  <footer className="mt-1 text-[11px] font-medium text-muted-foreground">
                    — {q.speaker}
                  </footer>
                )}
              </blockquote>
            ))}
          </div>
        </AnalysisBlock>
      )}

      {/* Core findings — cards */}
      {analysis.core_findings.length > 0 && (
        <AnalysisBlock
          icon={<Brain className="h-3 w-3" />}
          title="Core findings"
          count={analysis.core_findings.length}
        >
          <div className="space-y-2">
            {analysis.core_findings.map((f, i) => (
              <FindingCard key={i} finding={f} />
            ))}
          </div>
        </AnalysisBlock>
      )}

      {/* Notable claims — claim + a supported ✓/✗ + the assessment */}
      {analysis.notable_claims.length > 0 && (
        <AnalysisBlock
          icon={<CheckCircle2 className="h-3 w-3" />}
          title="Notable claims"
          count={analysis.notable_claims.length}
        >
          <div className="space-y-2">
            {analysis.notable_claims.map((c, i) => (
              <div
                key={i}
                className="rounded-lg border border-border/60 bg-card/40 p-3 space-y-1.5"
              >
                <div className="flex items-start gap-2">
                  {c.is_well_supported === true ? (
                    <Check className="mt-0.5 h-3.5 w-3.5 shrink-0 text-emerald-600/80 dark:text-emerald-400/80" />
                  ) : c.is_well_supported === false ? (
                    <X className="mt-0.5 h-3.5 w-3.5 shrink-0 text-rose-500/60" />
                  ) : (
                    <span className="mt-1.5 h-1 w-1 shrink-0 rounded-full bg-muted-foreground/40" />
                  )}
                  <p className="text-xs font-medium leading-relaxed text-foreground/90">
                    {c.claim}
                  </p>
                </div>
                {c.support_assessment && (
                  <p className="pl-5.5 text-[11px] leading-relaxed text-muted-foreground">
                    {c.support_assessment}
                  </p>
                )}
              </div>
            ))}
          </div>
        </AnalysisBlock>
      )}

      {/* Evidence signals — a full ✓/✗ checklist */}
      {analysis.evidence_signals && (
        <AnalysisBlock
          icon={<CheckCircle2 className="h-3 w-3" />}
          title="Evidence signals"
        >
          <div className="grid grid-cols-1 gap-x-6 gap-y-2 rounded-xl border border-border/60 bg-card/40 p-4 sm:grid-cols-2">
            {EVIDENCE_SIGNAL_LABELS.map(({ key, label }) => (
              <SignalRow
                key={key}
                present={analysis.evidence_signals![key]}
                label={label}
              />
            ))}
          </div>
        </AnalysisBlock>
      )}

      {/* Bias & risk — only the TRUE ones, as muted caution flags */}
      {activeBias.length > 0 && (
        <AnalysisBlock
          icon={<AlertTriangle className="h-3 w-3" />}
          title="Caution flags"
          count={activeBias.length}
        >
          <div className="flex flex-wrap gap-2">
            {activeBias.map(({ key, label }) => (
              <span
                key={key}
                className="inline-flex items-center gap-1.5 rounded-md border border-amber-500/30 bg-amber-500/[0.06] px-2 py-1 text-[11px] text-amber-700 dark:text-amber-400/90"
              >
                <AlertTriangle className="h-3 w-3 shrink-0 opacity-70" />
                {label}
              </span>
            ))}
          </div>
        </AnalysisBlock>
      )}

      {/* Dates */}
      {hasAnyDate && (
        <AnalysisBlock icon={<Calendar className="h-3 w-3" />} title="Dates">
          <div className="space-y-0 rounded-xl border border-border/60 bg-card/40 px-4 py-1">
            {dates!.published_date && (
              <DateRow label="Published" value={dates!.published_date} />
            )}
            {dates!.updated_date && (
              <DateRow label="Updated" value={dates!.updated_date} />
            )}
            {dates!.content_timeframe && (
              <DateRow label="Content timeframe" value={dates!.content_timeframe} />
            )}
          </div>
        </AnalysisBlock>
      )}

      {/* Entities mentioned — grouped neutral chips by category */}
      {analysis.entities_mentioned && entityCount > 0 && (
        <AnalysisBlock
          icon={<Users className="h-3 w-3" />}
          title="Entities mentioned"
          count={entityCount}
        >
          <div className="space-y-3 rounded-xl border border-border/60 bg-card/40 p-4">
            <EntityGroup
              icon={<Users className="h-3 w-3" />}
              label="People"
              items={analysis.entities_mentioned.people}
            />
            <EntityGroup
              icon={<Building2 className="h-3 w-3" />}
              label="Organizations"
              items={analysis.entities_mentioned.organizations}
            />
            <EntityGroup
              icon={<Package className="h-3 w-3" />}
              label="Products"
              items={analysis.entities_mentioned.products}
            />
            <EntityGroup
              icon={<FlaskConical className="h-3 w-3" />}
              label="Studies"
              items={analysis.entities_mentioned.studies}
            />
            <EntityGroup
              icon={<MapPin className="h-3 w-3" />}
              label="Locations"
              items={analysis.entities_mentioned.locations}
            />
          </div>
        </AnalysisBlock>
      )}

      {/* Analysis notes — the agent's free-text closing note */}
      {analysis.analysis_notes && (
        <AnalysisBlock
          icon={<FileText className="h-3 w-3" />}
          title="Analysis notes"
        >
          <p className="rounded-xl border border-border/60 bg-card/40 px-4 py-3 text-xs leading-relaxed text-foreground/80">
            {analysis.analysis_notes}
          </p>
        </AnalysisBlock>
      )}
    </div>
  );
}

/** A prominent headline score: big tabular number + small label (kept separate). */
function HeadlineScore({
  label,
  value,
  emphasize = false,
}: {
  label: string;
  value: number | null;
  emphasize?: boolean;
}) {
  return (
    <div className="space-y-1">
      <span className="block text-[10px] uppercase tracking-wide text-muted-foreground">
        {label}
      </span>
      <span
        className={cn(
          "block tabular-nums leading-none",
          emphasize
            ? "text-2xl font-bold text-foreground"
            : "text-xl font-semibold text-foreground/85",
        )}
      >
        {fmtScore(value)}
      </span>
    </div>
  );
}

/** One date row in the Dates block (label left, value right). */
function DateRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between gap-3 border-b border-border/40 py-2 last:border-0">
      <span className="text-[11px] text-muted-foreground">{label}</span>
      <span className="text-xs font-medium text-foreground/85">{value}</span>
    </div>
  );
}

interface SourceDetailProps {
  topicId: string;
  sourceId: string;
}

export default function SourceDetail({ topicId, sourceId }: SourceDetailProps) {
  const router = useRouter();
  const api = useResearchApi();
  const debug = useStreamDebug();
  const [isNavigating, startNavTransition] = useTransition();

  const { data: source, refresh: refetchSource } = useResearchSource(sourceId);
  const { data: contentData, refresh: refetchContent } =
    useSourceContent(sourceId);
  const { data: allSources } = useResearchSources(topicId);
  const { data: importanceMap } = useSourceImportance(topicId);
  const importance = importanceMap?.get(sourceId);
  const { data: allAnalyses, refresh: refetchAnalyses } =
    useAnalysisForSource(sourceId);

  // No optimistic state needed — the backend stream sends metadata only (not full rows).
  // We refetch from Supabase after each analysis_complete / rescrape_complete event.
  // Live token text while analysis LLM is streaming
  const [streamingAnalysisText, setStreamingAnalysisText] = useState("");
  const [isAnalyzing, setIsAnalyzing] = useState(false);

  const [pasteOpen, setPasteOpen] = useState(false);
  const [showRawSearch, setShowRawSearch] = useState(false);

  const sourceIds = useMemo(
    () => (allSources as ResearchSource[] | null)?.map((s) => s.id) ?? [],
    [allSources],
  );
  const currentIndex = sourceIds.indexOf(sourceId);
  const prevSourceId = currentIndex > 0 ? sourceIds[currentIndex - 1] : null;
  const nextSourceId =
    currentIndex >= 0 && currentIndex < sourceIds.length - 1
      ? sourceIds[currentIndex + 1]
      : null;

  const navigateToSource = useCallback(
    (id: string) => {
      if (isNavigating) return;
      startNavTransition(() => {
        router.push(`/research/topics/${topicId}/sources/${id}`);
      });
    },
    [isNavigating, router, topicId],
  );

  // Content versions from DB, newest first
  const contentVersions = useMemo(() => {
    const db = (contentData ?? []) as ResearchContent[];
    return [...db].sort((a, b) => b.version - a.version);
  }, [contentData]);

  const [selectedVersion, setSelectedVersion] = useState(0);
  const currentContent = contentVersions[selectedVersion] ?? null;

  // Analyses for the currently-selected content version — but NEVER hide
  // expensive prior analyses. Editing content writes a NEW version (v+1); the
  // prior analyses stay in the DB attached to the OLD version (verified: they
  // survive, ON DELETE CASCADE only fires if the content row itself is deleted,
  // which editing does not do). A strict `content_id === current` filter made
  // them vanish from view after an edit — reading as catastrophic loss of paid
  // LLM output. So: show the current version's own analyses if it has any;
  // otherwise fall back to the newest prior version that does, flagged stale so
  // the UI can explain the data is preserved (just from before the edit).
  const { currentAnalyses, staleAnalysisVersion } = useMemo<{
    currentAnalyses: ResearchAnalysis[];
    staleAnalysisVersion: number | null;
  }>(() => {
    const db = (allAnalyses ?? []) as ResearchAnalysis[];
    if (!currentContent)
      return { currentAnalyses: db, staleAnalysisVersion: null };
    const own = db.filter((a) => a.content_id === currentContent.id);
    if (own.length > 0)
      return { currentAnalyses: own, staleAnalysisVersion: null };
    // `contentVersions` is newest-first — surface the most recent OTHER version
    // that still carries analyses.
    for (const v of contentVersions) {
      if (v.id === currentContent.id) continue;
      const prior = db.filter((a) => a.content_id === v.id);
      if (prior.length > 0)
        return { currentAnalyses: prior, staleAnalysisVersion: v.version };
    }
    return { currentAnalyses: [], staleAnalysisVersion: null };
  }, [allAnalyses, currentContent, contentVersions]);

  // ── Scrape stream ────────────────────────────────────────────────────────
  const scrapeStream = useResearchStream();

  const handleScrape = useCallback(async () => {
    if (!typedSource || scrapeStream.isStreaming) return;
    const response = await api.scrapeSource(topicId, sourceId);
    scrapeStream.startStream(response, {
      onData: (payload: ResearchDataEvent) => {
        // rescrape_complete = single-source rescrape endpoint result
        // scrape_complete = bulk scrape (also fires for single source)
        if (
          (payload.type === "rescrape_complete" ||
            payload.type === "scrape_complete") &&
          payload.source_id === sourceId
        ) {
          // Fetch the new content version from DB — the stream only has metadata (char_count),
          // not the full content row, so a targeted refetch is needed here
          refetchContent();
          setSelectedVersion(0);
        }
        if (
          payload.type === "scrape_failed" &&
          payload.source_id === sourceId
        ) {
          // Still refresh source to update scrape_status to 'failed'
          refetchSource();
        }
      },
      onEnd: () => {
        // Sync the source scrape_status field
        refetchSource();
      },
    });
    debug.pushEvents(scrapeStream.rawEvents, "scrape");
  }, [
    api,
    topicId,
    sourceId,
    scrapeStream,
    refetchSource,
    refetchContent,
    debug,
  ]);

  // ── Analyze stream ───────────────────────────────────────────────────────
  const analyzeStream = useResearchStream();
  // Accumulates the live tokens in a ref so failure handlers can read the full
  // text (closures over `streamingAnalysisText` would be stale).
  const streamedRef = useRef("");
  // When the provider stops early (e.g. Gemini safety) we PRESERVE what already
  // streamed + the reason, instead of throwing it away and showing nothing.
  const [interrupted, setInterrupted] = useState<{
    text: string;
    reason: string;
  } | null>(null);
  const [analyzeDialogOpen, setAnalyzeDialogOpen] = useState(false);

  const handleAnalyze = useCallback(async () => {
    if (!currentContent || analyzeStream.isStreaming) return;
    setIsAnalyzing(true);
    setInterrupted(null);
    streamedRef.current = "";
    setStreamingAnalysisText("");
    const response = await api.analyzeSource(topicId, sourceId);
    analyzeStream.startStream(response, {
      onChunk: (text) => {
        // Live LLM token streaming — shows the analysis being written in real time
        streamedRef.current += text;
        setStreamingAnalysisText(streamedRef.current);
      },
      onData: (payload: ResearchDataEvent) => {
        if (
          payload.type === "analysis_complete" &&
          payload.source_id === sourceId
        ) {
          // Stream only sends metadata (result_length, model_id) — not the full row.
          // Refetch from DB to get the complete analysis object.
          setInterrupted(null);
          streamedRef.current = "";
          setStreamingAnalysisText("");
          refetchAnalyses();
        }
        if (
          payload.type === "analysis_failed" &&
          payload.source_id === sourceId
        ) {
          // The model stopped early (safety filter, max tokens, etc.). We
          // already received real content — KEEP it and report exactly what
          // happened, rather than wiping it and looking broken.
          if (streamedRef.current.trim()) {
            setInterrupted({
              text: streamedRef.current,
              reason: payload.error || "The AI provider stopped early.",
            });
          }
          setStreamingAnalysisText("");
          setIsAnalyzing(false);
        }
        if (payload.type === "retry_complete") {
          setInterrupted(null);
          streamedRef.current = "";
          setStreamingAnalysisText("");
          refetchAnalyses();
        }
      },
      onEnd: () => {
        setIsAnalyzing(false);
        setStreamingAnalysisText("");
        // Final sync in case analysis_complete wasn't caught (e.g. single-source endpoint)
        refetchAnalyses();
      },
      onError: (msg: string) => {
        // Stream/network error after content streamed — preserve what we got.
        if (streamedRef.current.trim()) {
          setInterrupted({
            text: streamedRef.current,
            reason: msg || "The stream ended unexpectedly.",
          });
        }
        setIsAnalyzing(false);
        setStreamingAnalysisText("");
      },
    });
    debug.pushEvents(analyzeStream.rawEvents, "analyze");
  }, [
    api,
    topicId,
    sourceId,
    currentContent,
    analyzeStream,
    refetchAnalyses,
    debug,
  ]);

  // Plain fns — React Compiler memoizes; no manual useCallback/deps.
  const openAnalyzeDialog = () => setAnalyzeDialogOpen(true);

  // From the curation popup: save the trimmed/edited content (original backed
  // up once), then analyze the now-curated stored content. `null` = analyze the
  // full content as-is.
  const handleCuratedAnalyze = async (curated: string | null) => {
    setAnalyzeDialogOpen(false);
    if (curated !== null && currentContent) {
      try {
        await updateContentCurated(currentContent, curated);
        await refetchContent();
      } catch (err) {
        toast.error(
          `Couldn't save curated content: ${
            err instanceof Error ? err.message : "unknown error"
          }`,
        );
        return;
      }
    }
    handleAnalyze();
  };

  const handleRestoreOriginal = async () => {
    if (!currentContent?.original_content) return;
    try {
      await restoreOriginalContent(currentContent);
      refetchContent();
      toast.success("Restored the original scrape");
    } catch (err) {
      toast.error(
        `Couldn't restore: ${err instanceof Error ? err.message : "unknown error"}`,
      );
    }
  };

  const typedSource = source as ResearchSource | null | undefined;
  const extraSnippets = typedSource
    ? stringArrayFromJson(typedSource.extra_snippets)
    : [];
  const hasBeenScraped = typedSource && typedSource.scrape_status !== "pending";
  // The deep per-page read (rs_source.page_analysis), defensively narrowed.
  // null = never analyzed → the section shows an honest empty state.
  const pageAnalysis: PageAnalysis | null = typedSource
    ? pageAnalysisFromJson(typedSource.page_analysis)
    : null;

  const handleMarkComplete = useCallback(async () => {
    await updateSource(sourceId, { scrape_status: "complete" });
    refetchSource();
  }, [sourceId, refetchSource]);

  const handleMarkStale = useCallback(async () => {
    await updateSource(sourceId, { is_stale: true });
    refetchSource();
  }, [sourceId, refetchSource]);

  const handleContentSaved = useCallback(() => {
    refetchContent();
  }, [refetchContent]);

  const isScraping = scrapeStream.isStreaming;

  return (
    <div className="flex flex-col md:flex-row h-full min-h-0">
      {/* Left Panel — Source Info */}
      <div className="w-full md:w-[340px] lg:w-[380px] shrink-0 border-b md:border-b-0 md:border-r border-border overflow-y-auto pb-16 md:pb-0">
        <div className="p-4 space-y-4">
          <div className="flex items-center justify-between gap-2">
            <Link
              href={`/research/topics/${topicId}/sources`}
              className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground transition-colors"
            >
              <ChevronLeft className="h-4 w-4" />
              Sources
            </Link>
            {sourceIds.length > 1 && (
              <div className="flex items-center gap-1">
                <span className="text-xs text-muted-foreground tabular-nums">
                  {currentIndex + 1}/{sourceIds.length}
                </span>
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-6 w-6 rounded-full"
                  disabled={!prevSourceId || isNavigating}
                  onClick={() => prevSourceId && navigateToSource(prevSourceId)}
                >
                  <ChevronLeft className="h-3.5 w-3.5" />
                </Button>
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-6 w-6 rounded-full"
                  disabled={!nextSourceId || isNavigating}
                  onClick={() => nextSourceId && navigateToSource(nextSourceId)}
                >
                  <ChevronRight className="h-3.5 w-3.5" />
                </Button>
              </div>
            )}
          </div>

          {typedSource && (
            <>
              {/* Hero: thumbnail + title */}
              <div className="space-y-3">
                {typedSource.thumbnail_url ? (
                  <div className="w-full aspect-video rounded-lg overflow-hidden bg-muted">
                    <Image
                      src={typedSource.thumbnail_url}
                      alt={typedSource.title ?? ""}
                      width={380}
                      height={214}
                      className="w-full h-full object-cover"
                      unoptimized
                    />
                  </div>
                ) : (
                  <div className="w-full h-20 rounded-lg bg-muted flex items-center justify-center">
                    <Globe className="h-8 w-8 text-muted-foreground/30" />
                  </div>
                )}
                <div className="flex items-start gap-2">
                  <SourceTypeIcon
                    type={sourceTypeFromDb(typedSource.source_type)}
                  />
                  <h2 className="font-semibold text-sm leading-snug">
                    {typedSource.title || "Untitled"}
                  </h2>
                </div>
                <a
                  href={typedSource.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-xs text-primary hover:underline flex items-start gap-1 break-all"
                >
                  {typedSource.url}
                  <ExternalLink className="h-3 w-3 shrink-0 mt-0.5" />
                </a>
              </div>

              {/* Core metadata */}
              <div className="space-y-0 rounded-lg border border-border p-3">
                <MetaRow label="Host" icon={<Globe className="h-3 w-3" />}>
                  <span>{typedSource.hostname ?? "—"}</span>
                </MetaRow>
                <MetaRow label="Best rank" icon={<Hash className="h-3 w-3" />}>
                  {importance?.bestRank != null ? (
                    <span className="font-mono">#{importance.bestRank}</span>
                  ) : (
                    <span className="text-muted-foreground">—</span>
                  )}
                </MetaRow>
                <MetaRow label="Status" icon={<Info className="h-3 w-3" />}>
                  <StatusBadge status={typedSource.scrape_status} />
                </MetaRow>
                <MetaRow
                  label="Authority"
                  icon={<TrendingUp className="h-3 w-3" />}
                >
                  {typedSource.authority_score != null ? (
                    <div className="flex flex-col items-end gap-1">
                      <AuthorityTierBadge
                        score={typedSource.authority_score}
                        tier={typedSource.authority_tier}
                        reasoning={typedSource.authority_reasoning}
                      />
                      {typedSource.authority_reasoning && (
                        <span className="max-w-[16rem] text-right text-[11px] font-normal text-muted-foreground">
                          {typedSource.authority_reasoning}
                        </span>
                      )}
                    </div>
                  ) : (
                    <span className="text-muted-foreground">Not yet ranked</span>
                  )}
                </MetaRow>
                {(typedSource.final_source_score != null ||
                  typedSource.recommended_use != null ||
                  typedSource.analysis_status != null) && (
                  <MetaRow
                    label="Verdict"
                    icon={<CheckCircle2 className="h-3 w-3" />}
                  >
                    <SourceVerdictBadge
                      finalScore={typedSource.final_source_score}
                      recommendedUse={typedSource.recommended_use}
                      analysisStatus={typedSource.analysis_status}
                      showUnanalyzed
                    />
                  </MetaRow>
                )}
                <MetaRow label="Origin" icon={<Tag className="h-3 w-3" />}>
                  <OriginBadge
                    origin={sourceOriginFromDb(typedSource.origin)}
                  />
                </MetaRow>
                <MetaRow
                  label="Included"
                  icon={<CheckCircle2 className="h-3 w-3" />}
                >
                  <Badge
                    variant={typedSource.is_included ? "default" : "secondary"}
                  >
                    {typedSource.is_included ? "Yes" : "No"}
                  </Badge>
                </MetaRow>
                <MetaRow
                  label="Page Age"
                  icon={<Calendar className="h-3 w-3" />}
                >
                  <span className="text-right block">
                    {formatPageAge(typedSource.page_age)}
                  </span>
                </MetaRow>
                <MetaRow
                  label="Discovered"
                  icon={<Clock className="h-3 w-3" />}
                >
                  <span>
                    {new Date(typedSource.discovered_at).toLocaleDateString(
                      undefined,
                      { year: "numeric", month: "short", day: "numeric" },
                    )}
                  </span>
                </MetaRow>
                <MetaRow label="Last Seen" icon={<Clock className="h-3 w-3" />}>
                  <span>
                    {new Date(typedSource.last_seen_at).toLocaleDateString(
                      undefined,
                      { year: "numeric", month: "short", day: "numeric" },
                    )}
                  </span>
                </MetaRow>
                {typedSource.is_stale && (
                  <MetaRow
                    label="Stale"
                    icon={<AlertTriangle className="h-3 w-3" />}
                  >
                    <Badge variant="destructive">Stale</Badge>
                  </MetaRow>
                )}
              </div>

              {/* Search ranking — total importance + per-keyword ranks (no hiding) */}
              <div className="space-y-2 rounded-lg border border-border p-3">
                <div className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                  <TrendingUp className="h-3 w-3" />
                  Search ranking
                </div>
                <SourceRankBadges importance={importance} />
              </div>

              {/* Tags — assign this source to dimensions for consolidation */}
              <div className="space-y-2 rounded-lg border border-border p-3">
                <div className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                  <Tag className="h-3 w-3" />
                  Tags
                </div>
                <SourceTagPicker topicId={topicId} sourceId={sourceId} />
              </div>

              {/* Content version details */}
              {contentVersions.length > 0 && (
                <div className="rounded-lg border border-border p-3 space-y-2">
                  <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
                    Content Versions
                  </p>
                  {contentVersions.length > 1 ? (
                    <div className="flex items-center justify-between gap-2">
                      <Button
                        variant="ghost"
                        size="sm"
                        disabled={selectedVersion >= contentVersions.length - 1}
                        onClick={() => setSelectedVersion((v) => v + 1)}
                      >
                        &larr;
                      </Button>
                      <span className="text-xs tabular-nums text-center">
                        v
                        {contentVersions[selectedVersion]?.version ??
                          selectedVersion + 1}{" "}
                        of {contentVersions.length}
                      </span>
                      <Button
                        variant="ghost"
                        size="sm"
                        disabled={selectedVersion <= 0}
                        onClick={() => setSelectedVersion((v) => v - 1)}
                      >
                        &rarr;
                      </Button>
                    </div>
                  ) : (
                    <div className="text-xs text-muted-foreground">
                      1 version available
                    </div>
                  )}
                  {currentContent && (
                    <div className="space-y-0 text-xs">
                      <div className="flex justify-between py-1 border-b border-border/50">
                        <span className="text-muted-foreground">Chars</span>
                        <span className="font-mono">
                          {currentContent.char_count.toLocaleString()}
                        </span>
                      </div>
                      <div className="flex justify-between py-1 border-b border-border/50">
                        <span className="text-muted-foreground">Quality</span>
                        <Badge
                          variant={
                            currentContent.is_good_scrape
                              ? "default"
                              : "secondary"
                          }
                          className="text-xs"
                        >
                          {currentContent.quality_override ??
                            (currentContent.is_good_scrape ? "Good" : "Thin")}
                        </Badge>
                      </div>
                      <div className="flex justify-between py-1 border-b border-border/50">
                        <span className="text-muted-foreground">Method</span>
                        <span>{currentContent.capture_method}</span>
                      </div>
                      <div className="flex justify-between py-1 border-b border-border/50">
                        <span className="text-muted-foreground">Type</span>
                        <span>{currentContent.content_type}</span>
                      </div>
                      {currentContent.published_at && (
                        <div className="flex justify-between py-1 border-b border-border/50">
                          <span className="text-muted-foreground">
                            Published
                          </span>
                          <span>
                            {new Date(
                              currentContent.published_at,
                            ).toLocaleDateString()}
                          </span>
                        </div>
                      )}
                      {currentContent.modified_at && (
                        <div className="flex justify-between py-1 border-b border-border/50">
                          <span className="text-muted-foreground">
                            Modified
                          </span>
                          <span>
                            {new Date(
                              currentContent.modified_at,
                            ).toLocaleDateString()}
                          </span>
                        </div>
                      )}
                      <div className="flex justify-between py-1">
                        <span className="text-muted-foreground">Scraped</span>
                        <span>
                          {new Date(
                            currentContent.scraped_at,
                          ).toLocaleDateString()}
                        </span>
                      </div>
                    </div>
                  )}
                </div>
              )}

              {/* Extracted links count */}
              {currentContent &&
                jsonArrayLength(currentContent.extracted_links) > 0 && (
                  <div className="flex items-center gap-2 text-xs text-muted-foreground">
                    <Link2 className="h-3 w-3" />
                    <span>
                      {jsonArrayLength(currentContent.extracted_links)}{" "}
                      extracted links
                    </span>
                  </div>
                )}

              {/* Description */}
              {typedSource.description && (
                <p className="text-xs leading-relaxed text-foreground/80">
                  {typedSource.description}
                </p>
              )}

              {/* Extra snippets */}
              {extraSnippets.length > 0 && (
                <div className="space-y-2">
                  {extraSnippets.map((snippet, i) => (
                    <p
                      key={i}
                      className="text-xs text-foreground/70 leading-relaxed"
                    >
                      {snippet}
                    </p>
                  ))}
                </div>
              )}

              {/* Raw search result toggle */}
              {typedSource.raw_search_result && (
                <div className="space-y-2">
                  <button
                    onClick={() => setShowRawSearch((v) => !v)}
                    className="text-xs text-muted-foreground hover:text-foreground transition-colors flex items-center gap-1"
                  >
                    <FileText className="h-3 w-3" />
                    {showRawSearch ? "Hide" : "Show"} raw search result
                  </button>
                  {showRawSearch && (
                    <pre className="text-xs bg-muted rounded-lg p-3 overflow-x-auto max-h-64 overflow-y-auto leading-relaxed whitespace-pre-wrap break-all">
                      {JSON.stringify(typedSource.raw_search_result, null, 2)}
                    </pre>
                  )}
                </div>
              )}
            </>
          )}
        </div>
      </div>

      {/* Right Panel — Actions + Content + Analysis */}
      <div className="flex-1 min-w-0 overflow-y-auto p-4 pb-20 md:pb-4 space-y-6">
        {/* Actions bar */}
        {typedSource && (
          <div className="flex items-center gap-2 flex-wrap">
            <Button
              size="sm"
              className="gap-1.5 h-8"
              onClick={handleScrape}
              disabled={isScraping || analyzeStream.isStreaming}
            >
              {isScraping ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
              ) : hasBeenScraped ? (
                <RefreshCw className="h-3.5 w-3.5" />
              ) : (
                <Download className="h-3.5 w-3.5" />
              )}
              {isScraping
                ? "Scraping…"
                : hasBeenScraped
                  ? "Re-scrape"
                  : "Scrape"}
            </Button>
            <Button
              variant="outline"
              size="sm"
              className="gap-1.5 h-8"
              onClick={() => setPasteOpen(true)}
            >
              <ClipboardPaste className="h-3.5 w-3.5" />
              Paste Content
            </Button>
            {currentContent?.original_content && (
              <Button
                variant="outline"
                size="sm"
                className="gap-1.5 h-8"
                onClick={handleRestoreOriginal}
                title="Replace the curated content with the original scrape"
              >
                <RotateCcw className="h-3.5 w-3.5" />
                Restore original
              </Button>
            )}
            <Button
              variant="outline"
              size="sm"
              className="gap-1.5 h-8"
              onClick={handleMarkComplete}
            >
              <CheckCircle2 className="h-3.5 w-3.5" />
              Mark Complete
            </Button>
            <Button
              variant="outline"
              size="sm"
              className="gap-1.5 h-8"
              onClick={handleMarkStale}
            >
              <AlertTriangle className="h-3.5 w-3.5" />
              Mark Stale
            </Button>
          </div>
        )}

        {/* Scrape progress messages */}
        {isScraping && scrapeStream.messages.length > 0 && (
          <div className="rounded-lg border border-border/50 bg-muted/30 px-3 py-2 space-y-1">
            {scrapeStream.messages.slice(-3).map((msg) => (
              <p key={msg.id} className="text-[10px] text-muted-foreground">
                {msg.message}
              </p>
            ))}
          </div>
        )}

        {/* Page Analysis Section — the deep structured per-page read. Prominent,
            above the raw content, because it's the agent's verdict on the page. */}
        {typedSource && (
          <div className="rounded-2xl border border-border/60 bg-card/30 backdrop-blur-sm p-4 sm:p-5">
            {pageAnalysis ? (
              <PageAnalysisDocument
                analysis={pageAnalysis}
                finalScore={typedSource.final_source_score}
              />
            ) : (
              <div className="flex flex-col items-center justify-center gap-2 py-6 text-center">
                <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-muted/50">
                  <Brain className="h-5 w-5 text-muted-foreground/30" />
                </div>
                <p className="text-sm font-medium text-foreground/70">
                  Not analyzed yet
                </p>
                <p className="max-w-[280px] text-[11px] leading-relaxed text-muted-foreground">
                  Once this page is read and analyzed, the full per-page
                  breakdown — scores, key facts, findings, quotes, claims, and
                  the use verdict — appears here.
                </p>
              </div>
            )}
          </div>
        )}

        {/* Content Section */}
        <div className="min-h-[220px]">
          {currentContent ? (
            <ContentViewer
              topicId={topicId}
              content={currentContent}
              onSaved={handleContentSaved}
            />
          ) : typedSource ? (
            <div className="rounded-xl border border-dashed border-border/50 bg-card/30 backdrop-blur-sm min-h-[220px] flex flex-col items-center justify-center gap-3 p-6 text-center">
              {isScraping ? (
                <>
                  <div className="h-10 w-10 rounded-xl bg-primary/8 flex items-center justify-center">
                    <Loader2 className="h-5 w-5 text-primary/60 animate-spin" />
                  </div>
                  <p className="text-xs font-medium text-foreground/70">
                    Scraping…
                  </p>
                  {scrapeStream.messages.length > 0 && (
                    <p className="text-[10px] text-muted-foreground max-w-[240px]">
                      {
                        scrapeStream.messages[scrapeStream.messages.length - 1]
                          .message
                      }
                    </p>
                  )}
                </>
              ) : typedSource.scrape_status === "failed" ? (
                <>
                  <div className="h-10 w-10 rounded-xl bg-destructive/10 flex items-center justify-center">
                    <AlertTriangle className="h-5 w-5 text-destructive/60" />
                  </div>
                  <div>
                    <p className="text-xs font-medium text-foreground/70">
                      Scrape failed
                    </p>
                    <p className="text-[10px] text-muted-foreground mt-0.5 max-w-[240px]">
                      The scraper couldn&apos;t retrieve this page. Try
                      re-scraping or paste content manually.
                    </p>
                  </div>
                  <div className="flex items-center gap-2">
                    <button
                      onClick={handleScrape}
                      disabled={isScraping}
                      className="inline-flex items-center gap-1.5 h-8 px-4 rounded-full text-xs font-medium bg-primary text-primary-foreground hover:bg-primary/90 disabled:opacity-40 transition-all min-h-[44px]"
                    >
                      <RefreshCw className="h-3 w-3" />
                      Re-scrape
                    </button>
                    <button
                      onClick={() => setPasteOpen(true)}
                      className="inline-flex items-center gap-1.5 h-8 px-4 rounded-full matrx-glass-card text-xs font-medium text-muted-foreground hover:text-foreground transition-colors min-h-[44px]"
                    >
                      <ClipboardPaste className="h-3 w-3" />
                      Paste
                    </button>
                  </div>
                </>
              ) : (
                <>
                  <div className="h-10 w-10 rounded-xl bg-primary/8 flex items-center justify-center">
                    <Download className="h-5 w-5 text-primary/60" />
                  </div>
                  <div>
                    <p className="text-xs font-medium text-foreground/70">
                      No content yet
                    </p>
                    <p className="text-[10px] text-muted-foreground mt-0.5 max-w-[240px]">
                      Scrape this source to fetch its page content, or paste
                      content manually.
                    </p>
                  </div>
                  <div className="flex items-center gap-2">
                    <button
                      onClick={handleScrape}
                      disabled={isScraping}
                      className="inline-flex items-center gap-1.5 h-8 px-4 rounded-full text-xs font-medium bg-primary text-primary-foreground hover:bg-primary/90 disabled:opacity-40 transition-all min-h-[44px]"
                    >
                      <Download className="h-3 w-3" />
                      Scrape
                    </button>
                    <button
                      onClick={() => setPasteOpen(true)}
                      className="inline-flex items-center gap-1.5 h-8 px-4 rounded-full matrx-glass-card text-xs font-medium text-muted-foreground hover:text-foreground transition-colors min-h-[44px]"
                    >
                      <ClipboardPaste className="h-3 w-3" />
                      Paste
                    </button>
                  </div>
                </>
              )}
            </div>
          ) : (
            <div className="rounded-xl border border-dashed border-border/50 bg-card/30 min-h-[220px] flex items-center justify-center text-muted-foreground text-xs">
              <Loader2 className="h-4 w-4 animate-spin mr-2" />
              Loading source...
            </div>
          )}
        </div>

        {/* Analysis Section */}
        <div className="space-y-2 min-h-[180px]">
          <div className="flex items-center justify-between px-0.5">
            <span className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
              Analysis
              {currentAnalyses.length > 0 && (
                <span className="ml-1.5 text-muted-foreground">
                  ({currentAnalyses.length})
                </span>
              )}
            </span>
            {currentContent && currentAnalyses.length > 0 && !isAnalyzing && (
              <AnalysisCard
                analysis={null}
                topicId={topicId}
                sourceId={sourceId}
                contentId={currentContent.id}
                onAnalyzed={openAnalyzeDialog}
                triggerOnly
              />
            )}
          </div>

          {currentContent ? (
            <>
              {/* Live streaming analysis card — shown while generating */}
              {isAnalyzing && (
                <AnalysisCard
                  analysis={null}
                  streamingText={streamingAnalysisText || " "}
                  topicId={topicId}
                  sourceId={sourceId}
                />
              )}
              {/* Provider stopped early (e.g. safety) — content preserved with
                  an honest reason, instead of wiping it and looking broken. */}
              {interrupted && !isAnalyzing && (
                <div className="rounded-xl border border-amber-500/40 bg-amber-500/[0.06] overflow-hidden">
                  <div className="flex items-start gap-2 px-4 py-2.5 border-b border-amber-500/20">
                    <AlertTriangle className="h-4 w-4 text-amber-500 shrink-0 mt-0.5" />
                    <div className="min-w-0 flex-1">
                      <p className="text-xs font-semibold text-amber-700 dark:text-amber-400">
                        The AI provider stopped early — content kept
                      </p>
                      <p className="text-[11px] text-muted-foreground mt-0.5 break-words">
                        {interrupted.reason}
                      </p>
                    </div>
                    <button
                      onClick={() => setInterrupted(null)}
                      className="text-[10px] text-muted-foreground hover:text-foreground shrink-0"
                    >
                      Dismiss
                    </button>
                  </div>
                  <div className="px-4 py-3">
                    <MarkdownStream content={interrupted.text} />
                  </div>
                </div>
              )}
              {/* Stale-analysis notice — prior analyses preserved after an edit */}
              {staleAnalysisVersion != null && currentAnalyses.length > 0 && (
                <div className="rounded-lg border border-amber-500/40 bg-amber-500/[0.06] px-3 py-2 flex items-start gap-2">
                  <AlertTriangle className="h-3.5 w-3.5 text-amber-500 shrink-0 mt-0.5" />
                  <p className="text-[11px] text-amber-700 dark:text-amber-400 leading-relaxed">
                    Showing analysis from <b>v{staleAnalysisVersion}</b> of this
                    content. You&rsquo;ve edited it since (now v
                    {currentContent?.version}), so this may be out of date —
                    re-analyze to refresh. Your previous analysis was kept, not
                    deleted.
                  </p>
                </div>
              )}
              {/* Completed analyses */}
              {currentAnalyses.length > 0 ? (
                <div className="space-y-2">
                  {currentAnalyses.map((analysis) => (
                    <AnalysisCard
                      key={analysis.id}
                      analysis={analysis}
                      topicId={topicId}
                      sourceId={sourceId}
                      contentId={currentContent.id}
                      onAnalyzed={openAnalyzeDialog}
                    />
                  ))}
                </div>
              ) : !isAnalyzing ? (
                <AnalysisCard
                  analysis={null}
                  topicId={topicId}
                  sourceId={sourceId}
                  contentId={currentContent.id}
                  onAnalyzed={openAnalyzeDialog}
                />
              ) : null}
            </>
          ) : (
            <div className="rounded-xl border border-dashed border-border/50 bg-card/30 backdrop-blur-sm min-h-[160px] flex flex-col items-center justify-center gap-2 p-6 text-center">
              <div className="h-10 w-10 rounded-xl bg-muted/50 flex items-center justify-center">
                <Brain className="h-5 w-5 text-muted-foreground/30" />
              </div>
              <p className="text-[10px] text-muted-foreground max-w-[200px]">
                Scrape content first, then run analysis to extract insights.
              </p>
            </div>
          )}
        </div>
      </div>

      {/* Paste Content Modal */}
      <PasteContentModal
        open={pasteOpen}
        onOpenChange={setPasteOpen}
        topicId={topicId}
        sourceId={sourceId}
        onSaved={() => {
          setPasteOpen(false);
          refetchContent();
        }}
      />

      <AnalyzeCurationDialog
        open={analyzeDialogOpen}
        onOpenChange={setAnalyzeDialogOpen}
        content={currentContent?.content ?? ""}
        onAnalyze={handleCuratedAnalyze}
        busy={isAnalyzing}
      />
    </div>
  );
}
