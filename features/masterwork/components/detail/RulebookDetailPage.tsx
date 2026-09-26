"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useDeepLinkArrival } from "@/lib/deep-link/useDeepLinkArrival";
import { formatDurationSeconds } from "@ai-matrx/kit/format";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import {
  BookOpen,
  CheckCircle2,
  FileUp,
  Hammer,
  ChevronDown,
  ChevronRight,
  ExternalLink,
  ListFilter,
  ListTodo,
  MessageCircleQuestion,
  MessageSquareWarning,
  Pencil,
  Stethoscope,
  Plus,
  RefreshCw,
  RotateCcw,
  Quote,
  Workflow,
  Library,
  Signature,
} from "lucide-react";
import { recordToast, toast } from "@/lib/toast";
import { cn } from "@/lib/utils";
import { EntityRef } from "@/components/official/entity-ref/EntityRef";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { BulkApproveDialog } from "./BulkApproveDialog";
import {
  ArchivedDisclosure,
  EditableLabel,
  Input,
} from "@ai-matrx/design-system";
import LoadingSpinner from "@/components/ui/loading-spinner";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { useAppSelector } from "@/lib/redux/hooks";
import {
  selectIsSuperAdmin,
  selectUserId,
} from "@/lib/redux/selectors/userSelectors";
import { resolveLibraryOrgId } from "@/lib/organizations/systemOrg";
import { LibraryPublishPanel } from "@/features/rag/components/library/LibraryPublishPanel";
import { AccessGate } from "@/features/access-gate/components/AccessGate";
import { ShareButton } from "@/features/sharing/components/ShareButton";
import { AssistStrip } from "@/features/assists/components/AssistStrip";
import { NonEditableContextMenu } from "@/features/context-menu-v3/NonEditableContextMenu";
import type { ContextMenuExtraSection } from "@/features/context-menu-v3/types";
import { buildApplicationScopeFromMenuContext } from "@/features/context-menu-v3/utils/build-application-scope";
import { MASTERWORK_RULEBOOK_SURFACE_NAME } from "@/features/surfaces/manifests/masterwork-rulebook.manifest";
import {
  SurfaceRuntimeProvider,
  useSurfaceClientTools,
  useSurfaceWriteHandlers,
} from "@/features/surfaces/runtime/SurfaceRuntimeContext";
import { fetchAssistLaunch, MASTERWORK_RULEBOOK_SURFACE } from "../../assists";
import {
  getRulebook,
  listMasterworksAfterBuild,
  listMasterworksForRulebook,
  saveRules,
  splitMasterworksByArchive,
  updateRulebookMeta,
  setExpertDescription,
  upsertRuleWithRetry,
} from "../../service";
import {
  applyManualRuleEdit,
  disagreesWith,
  expertDescription,
  heldByOneSourceOnly,
  intakeGoal,
  recurrencePieces,
  ruleState,
  SEVERITY_LABELS,
  stampRuled,
  suggestedDescription,
  type Masterwork,
  type Rulebook,
  type RulebookRule,
  type RuleReview,
  type RuleSeverity,
  type RuleSourceRef,
} from "../../types";
import { TriageDraftsDialog } from "../../triage/TriageDraftsDialog";
import { SuggestedWording } from "./SuggestedWording";
import { useRulebookDialogSession } from "../../durable-run/rulebookDialogSession";
import { RuleRelations, ruleAnchorId } from "./RuleRelations";
import { RuleMove, ruleMoveIsEmpty } from "./RuleMove";
import { RuleHistory } from "./RuleHistory";
import {
  RuleKeptExpressions,
  RuleRecurrenceBadge,
  useRecurrenceThreshold,
} from "./RuleRecurrenceBadge";
import { RuleDecision, RuleDecisionBadge } from "./RuleDecision";
import { BodyOfWorkDialog } from "./BodyOfWorkDialog";
import { ChatImportDialog } from "./ChatImportDialog";
import { MeetingScavengerDialog } from "./MeetingScavengerDialog";
import { ShadowInboxDialog } from "./ShadowInboxDialog";
import { IngestSourceDialog } from "./IngestSourceDialog";
import { RedPenDialog } from "./RedPenDialog";
import { IngestTimelineDialog } from "./IngestTimelineDialog";
import { PredictionLedgerDialog } from "@/features/masterwork/prediction/PredictionLedgerDialog";
import { DailyDripDialog } from "@/features/masterwork/drip/DailyDripDialog";
import { DripStreakReadout } from "@/features/masterwork/drip/DripStreakReadout";
import { dripOf } from "@/features/masterwork/drip/service";
import { CalibrationReadout } from "@/features/masterwork/prediction/CalibrationReadout";
import { ledgerOf } from "@/features/masterwork/prediction/service";
import { ApproachPickerDialog } from "@/features/masterwork/browse/ApproachPickerDialog";
import {
  fetchDistillationApproaches,
  type DistillationApproach,
} from "@/features/masterwork/browse/approaches";
import {
  resolveApproachLane,
  toIngestLane,
  type IngestLane,
} from "@/features/masterwork/browse/approachLane";
import {
  DEFAULT_INGEST_LANE,
  useIngestDialogSession,
} from "@/features/masterwork/durable-run/liveIngestLane";
import { RulebookInputsSection } from "./RulebookInputsSection";
import { ConductorPanel } from "@/features/masterwork/conduct/ConductorPanel";
import { RulebookVersionHistory } from "./RulebookVersionHistory";
import { WhatsWhatDialog } from "./WhatsWhatDialog";
import { ScoutInterviewPanel } from "./ScoutInterviewPanel";
import { RuleEditorDialog, type RuleEditorResult } from "./RuleEditorDialog";
import { DuplicateRuleError, findIdenticalRule } from "../../duplicateRules";
import {
  RuleFeedbackDialog,
  type RuleFeedbackMode,
} from "./RuleFeedbackDialog";
import { ImproveRuleDialog } from "./ImproveRuleDialog";
import { RuleDecisionActions } from "../../review/RuleDecisionActions";
// THE EXPERT'S OWN WORDS (2026-09-15) — "mine / not mine / mine but wrong",
// the agenda they produce, and the signature on a finished result. All three
// are readings of state this page already holds; none of them is a new store.
import {
  NOT_MINE_REASON,
  REVIEW_VOCABULARY_LABELS,
  useReviewVocabulary,
  type ReviewVocabulary,
} from "../../review/vocabulary";
import {
  NextSessionAgenda,
  useAgendaPanelEnabled,
} from "../../review/NextSessionAgenda";
import { countSignedOutputs, type SignedOutputTally } from "../../review/signature";
import { RuleReviewWizard } from "./RuleReviewWizard";
import {
  computeKpis,
  computeMasterworkKpis,
  MasterworkKpiStrip,
  LARGE_RULEBOOK,
  RulebookKpiStrip,
  type RuleKpiFilter,
} from "./RulebookKpiStrip";
import {
  computeJourney,
  journeyFactsFromRulebook,
} from "@/features/masterwork/journey";
import {
  OpenQuestionsCard,
  OPEN_QUESTIONS_ANCHOR,
} from "@/features/masterwork/coherence/OpenQuestionsCard";
import { UnderstudyCard } from "../../understudy/UnderstudyCard";
import {
  buildRulebookSurfaceScope,
  type RulebookDraftSnapshot,
} from "../../agent-context/rulebookSurfaceScope";
import { requireRuleDraftInput } from "../../agent-context/ruleDraftInput";
// The Final Checkup window (features/masterwork/checkup/) — its one entry point.
import { useOpenMasterworkCheckupWindow } from "@/features/overlays/openers/masterworkCheckupWindow";
// "Add rule" is a WindowPanel (With AI default + Manually) — never a blocking
// modal. The RuleEditorDialog keeps only EDIT plus agent-staged drafts.
import { useOpenAddRuleWindow } from "@/features/overlays/openers/masterworkAddRuleWindow";
import { useOpenBuildWindow } from "@/features/overlays/openers/masterworkBuildWindow";
import { BuildInFlightNotice } from "../../build/BuildInFlightNotice";
import { useOpenMasterworkYourWordsWindow } from "@/features/overlays/openers/masterworkYourWordsWindow";
import { RulePassageLink } from "../../kept-sources/RulePassageLink";
import { AGENT_ICON } from "@/components/icons/domain-icons";

/**
 * The Expert surface: read your Rulebook, correct it, grow it. Rules are
 * grouped by section; each expands to why / how-to-spot-it / the source's own
 * words. Every save bumps the Rulebook version (Masterworks show drift
 * against it).
 */

function severityBadge(severity: RuleSeverity) {
  const cls =
    severity === "critical"
      ? "border-destructive/50 text-destructive"
      : severity === "major"
        ? "border-primary/40 text-primary"
        : "border-border text-muted-foreground";
  return (
    <Badge variant="outline" className={`px-1.5 py-0 text-[10px] ${cls}`}>
      {SEVERITY_LABELS[severity]}
    </Badge>
  );
}

/** Format `[11, 12, 13, 20]` as "pages 11-13, 20". */
function formatPages(pages: number[]): string {
  const sorted = [...new Set(pages)].sort((a, b) => a - b);
  const groups: string[] = [];
  let start = sorted[0];
  let prev = start;
  for (const n of sorted.slice(1)) {
    if (n === prev + 1) {
      prev = n;
      continue;
    }
    groups.push(start === prev ? `${start}` : `${start}-${prev}`);
    start = n;
    prev = n;
  }
  groups.push(start === prev ? `${start}` : `${start}-${prev}`);
  return `${sorted.length === 1 ? "page" : "pages"} ${groups.join(", ")}`;
}

/**
 * Where a rule came from — and THE DOOR back to it. Every id we can resolve is
 * rendered AND linked: the uploaded document opens in the file viewer, the
 * extraction that read it opens in the extraction workspace. A rule whose
 * quote could not be machine-verified says so here, because that is the one
 * thing the Expert must check by eye.
 */
/** Seconds → "12:34" (or "1:02:34" past an hour) for recording time anchors. */
function formatClock(seconds: number): string {
  return formatDurationSeconds(seconds, { style: "clock" });
}

/**
 * A time range with no `granularity` (a rule distilled before W10) reads as
 * a real moment only when it's short enough to plausibly be one — anything
 * wider is almost certainly an un-stamped chunk range. A few sentences of
 * speech rarely runs past a minute and a half.
 */
const NARROW_UNSTAMPED_RANGE_SECONDS = 90;

/**
 * Render a recording rule's time anchor per its granularity (W10, aidream
 * `dd86f564d`): "segment" (or an absent-but-narrow range, for rules
 * distilled before the field existed) is a real moment — "at 2:54–3:30".
 * "chunk" is honest about being a whole ingestion chunk, not a moment —
 * "somewhere in 0:00–34:38".
 */
/**
 * The container's own chapter label — "Chapter 4" from `index` when the
 * source declared no title of its own, or the title verbatim when it did.
 * Per-row safe: a chapter object missing BOTH `title` and `index` (a shape
 * the server never emits, but jsonb makes no promises) renders as nothing
 * rather than a bare "Chapter" — the row keeps every other field it has.
 */
export function formatChapterLabel(
  chapter: NonNullable<RuleSourceRef["chapter"]>,
): string | null {
  if (chapter.title) return chapter.title;
  if (typeof chapter.index === "number" && Number.isFinite(chapter.index)) {
    return `Chapter ${chapter.index}`;
  }
  return null;
}

export function formatTimeAnchor(timeRange: NonNullable<RuleSourceRef["time_range"]>): string {
  const startLabel = formatClock(timeRange.start);
  if (timeRange.end == null) {
    return `at ${startLabel}`;
  }
  const endLabel = formatClock(timeRange.end);
  const granularity = timeRange.granularity;
  const isChunk =
    granularity === "chunk" ||
    (granularity == null && timeRange.end - timeRange.start > NARROW_UNSTAMPED_RANGE_SECONDS);
  return isChunk ? `somewhere in ${startLabel}–${endLabel}` : `at ${startLabel}–${endLabel}`;
}

/**
 * THE MOMENT THIS RULE CAME FROM, in the row itself.
 *
 * Doctrine CORE.md §5: "Each rule carries its origin so the expert can say
 * 'yes, that's mine' rule by rule." Until 2026-09-15 the origin lived only
 * inside the expanded row, so an Expert scanning the list was asked to own a
 * sentence with nothing behind it and had to open every rule to see where it
 * came from. This is the same provenance, at a glance — the SAME
 * `formatTimeAnchor` rendering the expanded row uses, never a second format.
 *
 * Renders nothing when the rule carries no moment. A rule with no recorded
 * origin is a real state and it must not be given a manufactured one.
 */
export function RuleProvenanceMoment({ rule }: { rule: RulebookRule }) {
  const sourceRef = rule.source_ref;
  if (!sourceRef) return null;
  const rawTime =
    sourceRef.time_range && Number.isFinite(sourceRef.time_range.start)
      ? formatTimeAnchor(sourceRef.time_range)
      : null;
  // The audiobook lane's chapter anchor (B4c) rides the SAME time text —
  // "Chapter 4 · at 2:54–3:30" — never a second, competing provenance line.
  const chapterLabel = sourceRef.chapter ? formatChapterLabel(sourceRef.chapter) : null;
  const time = chapterLabel && rawTime ? `${chapterLabel} · ${rawTime}` : (chapterLabel ?? rawTime);
  // A meeting rule's moment is WHO plus WHEN: "Dana Whitfield, at 4:12". The
  // clock alone cannot answer the only question the Expert is being asked —
  // was that me? — because a meeting has several people in it.
  const spoken = sourceRef.speaker
    ? time
      ? `${sourceRef.speaker}, ${time}`
      : sourceRef.speaker
    : null;
  const where =
    spoken ??
    time ??
    (sourceRef.source_pages?.length
      ? formatPages(sourceRef.source_pages)
      : sourceRef.pages
        ? `page ${sourceRef.pages}`
        : sourceRef.section_label
          ? sourceRef.section_label
          : sourceRef.interview
            ? "your interview"
            : (sourceRef.note ?? null));
  const quote = rule.quote?.trim() || null;
  if (!where && !quote) return null;
  return (
    <span className="inline-flex min-w-0 items-baseline gap-1 text-xs text-muted-foreground">
      <Quote className="h-3 w-3 shrink-0 self-center" aria-hidden="true" />
      {where ? <span className="shrink-0">{where}</span> : null}
      {quote ? (
        <span className="min-w-0 truncate italic">“{quote}”</span>
      ) : null}
    </span>
  );
}

function RuleProvenance({ sourceRef }: { sourceRef: RuleSourceRef }) {
  const pages = sourceRef.source_pages?.length
    ? formatPages(sourceRef.source_pages)
    : sourceRef.pages
      ? `page ${sourceRef.pages}`
      : null;
  // The recording lane's anchor — where in the audio the expert said it.
  const time =
    sourceRef.time_range && Number.isFinite(sourceRef.time_range.start)
      ? formatTimeAnchor(sourceRef.time_range)
      : null;
  // The container's own chapter division at that moment (B4c) — "Chapter 4",
  // right beside the time it names, never a separate provenance line.
  const chapterLabel = sourceRef.chapter ? formatChapterLabel(sourceRef.chapter) : null;
  const label =
    sourceRef.note ?? (sourceRef.interview ? "your interview" : "ingested");

  return (
    <div className="space-y-1 text-xs text-muted-foreground">
      <div className="flex flex-wrap items-center gap-x-1.5 gap-y-1">
        <span>From the source:</span>
        {sourceRef.meeting_slug ? (
          // THE DOOR LAW: the meeting is a real record with a durable link —
          // the rule's origin opens the room, never sits as dead prose.
          <Link
            href={`/meet/${sourceRef.meeting_slug}`}
            target="_blank"
            className="text-primary underline-offset-2 hover:underline"
          >
            {sourceRef.meeting_title ?? label}
          </Link>
        ) : sourceRef.meeting_title && !sourceRef.file_id ? (
          <span>{sourceRef.meeting_title}</span>
        ) : sourceRef.entity ? (
          // The dump Approach: the rule came from an ATTACHED entity — the
          // registry renders its name and its doors (open in new tab + peek).
          <EntityRef
            token={sourceRef.entity.token}
            id={sourceRef.entity.id}
            name={sourceRef.note ?? null}
            showIcon={false}
            openInNewTab
            className="inline-flex text-xs text-primary"
          />
        ) : sourceRef.url ? (
          // The dump Approach's URL source — the link IS the door.
          <a
            href={sourceRef.url}
            target="_blank"
            rel="noopener noreferrer"
            className="text-primary underline-offset-2 hover:underline"
          >
            {sourceRef.note ?? sourceRef.url}
          </a>
        ) : sourceRef.file_id ? (
          <Link
            href={`/files/f/${sourceRef.file_id}`}
            target="_blank"
            className="text-primary underline-offset-2 hover:underline"
          >
            {label}
          </Link>
        ) : sourceRef.conversation_id ? (
          // THE DOOR LAW: the interview is a real conversation with an id —
          // "your interview" must open it, never sit as dead prose.
          <Link
            href={`/chat/${sourceRef.conversation_id}`}
            target="_blank"
            className="text-primary underline-offset-2 hover:underline"
          >
            {label}
          </Link>
        ) : (
          <span>{label}</span>
        )}
        {pages ? <span>· {pages}</span> : null}
        {sourceRef.speaker ? <span>· said by {sourceRef.speaker}</span> : null}
        {chapterLabel ? <span>· {chapterLabel}</span> : null}
        {time ? <span>· {time}</span> : null}
        {sourceRef.exemplar ? <span>· worked out from an example</span> : null}
        {sourceRef.approach ? (
          // The registry stamp — which Distillation Approach produced this rule.
          <span>
            · via the {sourceRef.approach.replace(/-/g, " ")} Approach
          </span>
        ) : null}
        {sourceRef.page_extraction_job_id ? (
          <Link
            href={`/knowledge/extractions/${sourceRef.page_extraction_job_id}`}
            target="_blank"
            className="text-primary underline-offset-2 hover:underline"
          >
            · see everything it found
          </Link>
        ) : null}
      </div>
      {sourceRef.quote_unverified ? (
        <p className="text-amber-600 dark:text-amber-500">
          The wording above could not be matched word-for-word to the source —
          check it against the original before you approve this rule.
        </p>
      ) : null}
      {sourceRef.confidence === "low" ? (
        <p className="text-amber-600 dark:text-amber-500">
          You only touched on this in passing — double-check it says what you
          actually meant before approving.
        </p>
      ) : null}
    </div>
  );
}

// Exported ONLY so the policy-rule guard can drive the real card.
export function RuleRow({
  rule,
  allRules,
  canEdit,
  onEdit,
  onToggleRetired,
  onApprove,
  onReject,
  onImprove,
  onRequestChanges,
  onReconsider,
  selected,
  onToggleSelected,
  recurrenceThreshold,
  vocabulary = "standard",
}: {
  rule: RulebookRule;
  /** Every rule in the Rulebook — a `relates_to` link resolves its sibling's
   * real name from here, so the connection is a named door, not a raw id. */
  allRules: RulebookRule[];
  canEdit: boolean;
  onEdit: () => void;
  onToggleRetired: () => void;
  onApprove: () => void;
  onReject: () => void;
  onImprove: () => void;
  onRequestChanges: () => void;
  onReconsider: () => void;
  /** In the current bulk selection — the scope of any bulk verb, made visible. */
  selected: boolean;
  onToggleSelected: () => void;
  /** From `useRecurrenceThreshold`; `null` renders no badge. */
  recurrenceThreshold: number | null;
  /**
   * Which words this reviewer sees — `../../review/vocabulary`. Optional so a
   * surface that has not thought about the wording gets the standard verbs
   * rather than a crash; the Rulebook page always passes the resolved value.
   */
  vocabulary?: ReviewVocabulary;
}) {
  const [openRow, setOpenRow] = useState(false);
  const state = ruleState(rule);
  const retired = state === "retired";
  const rejected = state === "rejected";
  const words = REVIEW_VOCABULARY_LABELS[vocabulary];
  const ownership = vocabulary === "ownership";
  return (
    <div
      // THE DOOR a sibling rule's `relates_to` link opens. `scroll-mt` keeps
      // the row clear of the shell header when jumped to.
      id={ruleAnchorId(rule.id)}
      className={`scroll-mt-24 rounded-md border bg-card ${
        retired
          ? "border-border opacity-60"
          : rejected
            ? "border-destructive/40"
            : "border-border"
      }`}
    >
      {/* MOBILE: at 390px the row's own action buttons (Approve / Improve /
          Reject / Edit, `shrink-0 flex-nowrap`) refused to shrink or wrap,
          squeezing the sibling min-w-0 text column toward zero width — the
          browser then wrapped "Chapter 1. Accepting a Load at the Gate · at
          0:02–0:08" one character per line (reproduced on Rulebook
          950b80c1-7dc5-4542-b776-d977eed7d3d5, 2026-09-19). Same fix as the
          Rulebook header two-hundred lines below: `flex-wrap` on the row lets
          a `w-full`-below-`sm` actions block drop to its own line instead of
          fighting the title/badges/statement/provenance column for space. */}
      <div className="flex w-full flex-wrap items-start gap-2 px-3 py-2">
        {canEdit ? (
          // 16px is the right SIZE for a tick box and the wrong TAP TARGET on a
          // phone (measured 16×16 at 390px, 2026-09-17). The subtree touch
          // floor deliberately refuses to grow a checkbox — it would paint a
          // 44px empty square — so the label carries the platform's hit-area
          // ring instead (`.matrx-tap-area`, app/globals.css): the tick stays
          // 16px and the finger gets 44. `mt-1` moves to the label so the ring
          // is centred on the box, not above it.
          <label className="matrx-tap-area mt-1 inline-flex shrink-0">
            <input
              type="checkbox"
              checked={selected}
              onChange={onToggleSelected}
              aria-label={`Select "${rule.name}" for a bulk action`}
              className="h-4 w-4 shrink-0 accent-primary"
            />
          </label>
        ) : null}
        <button
          type="button"
          className="flex min-w-0 flex-1 items-start gap-2 text-left"
          onClick={() => setOpenRow((v) => !v)}
          aria-expanded={openRow}
        >
          {openRow ? (
            <ChevronDown className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" />
          ) : (
            <ChevronRight className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" />
          )}
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-sm font-medium text-foreground">
                {rule.name}
              </span>
              {severityBadge(rule.severity)}
              <RuleDecisionBadge rule={rule} />
              {state === "draft" ? (
                <Badge
                  variant="outline"
                  className="px-1.5 py-0 text-[10px] border-primary/40 text-primary"
                >
                  {ownership
                    ? "Waiting on you — is this yours?"
                    : "Draft — needs your approval"}
                </Badge>
              ) : null}
              {rejected ? (
                <Badge
                  variant="outline"
                  className="px-1.5 py-0 text-[10px] border-destructive/50 text-destructive"
                >
                  {ownership
                    ? "Not mine — with the interviewer"
                    : "Rejected — with the interviewer"}
                </Badge>
              ) : null}
              {rule.feedback && !rejected ? (
                <Badge
                  variant="outline"
                  className="px-1.5 py-0 text-[10px] border-primary/40 text-primary"
                >
                  {ownership ? "Mine but wrong" : "Change requested"}
                </Badge>
              ) : null}
              {retired ? (
                <Badge
                  variant="outline"
                  className="px-1.5 py-0 text-[10px] text-muted-foreground"
                >
                  Retired
                </Badge>
              ) : null}
              <RuleRecurrenceBadge
                rule={rule}
                threshold={recurrenceThreshold}
              />
              {/* 🚨 NOTHING FAILS SILENTLY. A rule approved in a bulk action
              says so, with how much of that batch a person actually read —
              never wearing a decision it did not get. */}
              {rule.reviewed?.mode === "sampled" ? (
                <Badge
                  variant="outline"
                  className="border-amber-500/50 px-1.5 py-0 text-[10px] text-amber-600 dark:text-amber-400"
                  title="This rule was approved as part of a bulk action, not opened on its own."
                >
                  Approved in bulk, {rule.reviewed.sample_size ?? 0} of{" "}
                  {rule.reviewed.of ?? 0} read
                </Badge>
              ) : null}
            </div>
            <p className="mt-0.5 text-sm text-muted-foreground">
              {rule.statement}
            </p>
            {/* WHERE IT CAME FROM, in the same row — so "is this mine?" is a
                question the Expert can actually answer without opening it. */}
            <RuleProvenanceMoment rule={rule} />
          </div>
        </button>
        {canEdit && state === "draft" ? (
          // The four review verbs come from the ONE shared primitive
          // (features/masterwork/review/RuleDecisionActions) — Approve /
          // Improve / Reject / Edit, never redeclared per surface.
          <RuleDecisionActions
            // MOBILE: even on its own full-width line, the ownership
            // vocabulary's FIVE verbs (Mine / Mine but wrong / Improve / Not
            // mine / Edit) still don't fit unbroken at 390px — `flex-nowrap`
            // squeezed the buttons into each other instead of the provenance
            // text this time. Wrap onto a second line below `sm`; `sm:` and up
            // keeps the original single-line row where the width is there.
            className="w-full shrink-0 flex-wrap justify-end gap-1 sm:w-auto sm:flex-nowrap sm:justify-start"
            size="sm"
            vocabulary={vocabulary}
            onApprove={onApprove}
            onImprove={onImprove}
            onReject={onReject}
            onEdit={onEdit}
            // The ownership wording needs all THREE of its words together;
            // the standard wording keeps the change request in the panel
            // below, exactly where it has always been.
            onRequestChanges={ownership ? onRequestChanges : undefined}
          />
        ) : null}
        {canEdit && rejected ? (
          <Button
            size="sm"
            variant="outline"
            className="h-7 w-full shrink-0 justify-center sm:w-auto"
            onClick={onReconsider}
            title="Take it back from the interviewer and review it yourself again."
          >
            <RotateCcw className="h-3.5 w-3.5" />
            Reconsider
          </Button>
        ) : null}
      </div>
      {rule.feedback ? (
        <div className="mx-3 mb-2 rounded-md border border-primary/30 bg-primary/5 px-2.5 py-1.5 text-xs">
          <span className="font-medium text-foreground">
            {rejected
              ? ownership
                ? "Why it isn't yours: "
                : "Why you rejected it: "
              : ownership
                ? "What it got wrong: "
                : "Your change request: "}
          </span>
          <span className="text-muted-foreground">{rule.feedback}</span>
          <span className="ml-1 text-muted-foreground">
            — the interviewer picks this up on their next turn.
          </span>
        </div>
      ) : null}
      {openRow ? (
        <div className="space-y-2 border-t border-border px-9 py-2 text-sm">
          {/* 🚨 THE DECISION HALF first — for a policy rule it IS the rule.
              THE MOVE sits immediately under it: same judgment, broken into
              the parts a machine can rank (what was still unknown, what the
              next step buys, what it costs on the 1-5 ladder). ONE place a
              rule's "when → next" lives, at two depths — never two competing
              renderers of the same fields. Renders nothing for a rule that
              carries neither. */}
          <RuleDecision rule={rule} />
          {ruleMoveIsEmpty(rule) ? null : <RuleMove rule={rule} />}
          {rule.rationale ? (
            <div>
              <div className="text-xs font-medium text-muted-foreground">
                Why it matters
              </div>
              <p className="text-foreground">{rule.rationale}</p>
            </div>
          ) : null}
          {rule.detection ? (
            <div>
              <div className="text-xs font-medium text-muted-foreground">
                How to spot a violation
              </div>
              <p className="text-foreground">{rule.detection}</p>
            </div>
          ) : null}
          {rule.quote ? (
            <div>
              <div className="text-xs font-medium text-muted-foreground">
                In the source&apos;s own words
              </div>
              <blockquote className="border-l-2 border-border pl-2 italic text-foreground">
                “{rule.quote}”
              </blockquote>
            </div>
          ) : null}
          <RuleRelations rule={rule} allRules={allRules} />
          {/* What this rule used to say, when a machine rewrote it. */}
          <RuleHistory rule={rule} />
          {/* 🚨 NEITHER EXPRESSION WINS: the other ways this rule's own source
              stated the same judgment, kept instead of thrown away as a
              duplicate. */}
          <RuleKeptExpressions rule={rule} />
          {rule.source_ref ? (
            <RuleProvenance sourceRef={rule.source_ref} />
          ) : null}
          {/* THE JUMP: this rule's quote, lit up inside the material it was
              drawn out of. Renders nothing when that material was not kept —
              every rule older than the Source system points at words that were
              read and discarded, and this must not promise them. */}
          <RulePassageLink rule={rule} />
          <div className="text-xs text-muted-foreground">
            Rule id: <code className="font-mono">{rule.id}</code> — audits cite
            this id.
          </div>
          {canEdit ? (
            <div className="flex flex-wrap gap-2 pt-1">
              <Button size="sm" variant="outline" onClick={onEdit}>
                <Pencil className="h-3.5 w-3.5" />
                Edit
              </Button>
              {!retired && !rejected ? (
                <Button size="sm" variant="outline" onClick={onImprove}>
                  <AGENT_ICON className="h-3.5 w-3.5" />
                  Improve
                </Button>
              ) : null}
              {!retired && !rejected ? (
                <Button size="sm" variant="outline" onClick={onRequestChanges}>
                  <MessageSquareWarning className="h-3.5 w-3.5" />
                  {rule.feedback
                    ? "Change what you said"
                    : words.requestChanges}
                </Button>
              ) : null}
              <Button size="sm" variant="ghost" onClick={onToggleRetired}>
                <RotateCcw className="h-3.5 w-3.5" />
                {retired ? "Restore" : "Retire"}
              </Button>
            </div>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}

/**
 * 🚨 A RULEBOOK PAGE NEVER CARRIES THE PREVIOUS RULEBOOK'S WORDS
 * (jobs-bar-2026-09-16 cold walk 2, finding #1's strongest remaining lead).
 *
 * `/masterwork/<id>` is one element position: a Rulebook→Rulebook navigation
 * changes a prop, React keeps the mounted instance, and every piece of state
 * derived from the first Rulebook survives into the second — the search box,
 * the chosen KPI view, an open rule editor holding the other Rulebook's rule,
 * the staged draft, the description expansion. The record IS the page's
 * identity, so the mount is keyed by it: a different Rulebook is a different
 * page. Its lane twin does the same at
 * `features/masterwork/components/RulebookLaneRoute.tsx`; between the two,
 * every rulebook-scoped route in the module is covered, and neither a lane nor
 * a dialog below has to hand-roll a per-id reset.
 *
 * Guard: `features/masterwork/__tests__/a-rulebook-page-never-carries-the-previous-rulebooks-words.test.tsx`.
 */
export function RulebookDetailPage({ rulebookId }: { rulebookId: string }) {
  return <RulebookDetailPageInstance key={rulebookId} rulebookId={rulebookId} />;
}

function RulebookDetailPageInstance({ rulebookId }: { rulebookId: string }) {
  const [rulebook, setRulebook] = useState<Rulebook | null>(null);
  const [masterworks, setMasterworks] = useState<Masterwork[]>([]);
  // THE ARCHIVED-ITEMS LAW (common-docs/policies/archived-items.md, Arman
  // 2026-09-09). Archived Masterworks are hidden by default EVERYWHERE on this
  // page — the KPI strip, the built count, the Understudy card, the journey
  // facts and the agent surface scope all read `activeMasterworks`, so nothing
  // here (human or agent) mistakes an archived system for a live one. The
  // archived half is one click away, under the disclosure in the Masterworks
  // section.
  const [showArchivedMasterworks, setShowArchivedMasterworks] = useState(false);
  const { active: activeMasterworks, archived: archivedMasterworks } =
    splitMasterworksByArchive(masterworks);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<unknown>(null);
  const [search, setSearch] = useState("");
  // 🚨 THE DEFAULT VIEW IS NOT EVERYTHING. `null` means "nobody has chosen a
  // view yet", and the effective view is computed from the Rulebook's size the
  // moment it loads: a Rulebook past LARGE_RULEBOOK rules opens on `attention`.
  // Kept as an explicit null rather than set in the load effect so a person's
  // own click is never overwritten by a refresh.
  const [chosenFilter, setChosenFilter] = useState<RuleKpiFilter | null>(null);
  // 🚨 BULK ACTIONS TAKE AN EXPLICIT SELECTION (Notion/Airtable). Nothing
  // world-class ships a destructive bulk verb whose scope is invisible, which
  // is what "Approve all" was.
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [bulkConfirm, setBulkConfirm] = useState<{
    rules: RulebookRule[];
    pairs: [RulebookRule, RulebookRule][];
  } | null>(null);
  const [readCount, setReadCount] = useState("");
  const recurrenceThreshold = useRecurrenceThreshold();
  const rulesSectionRef = useRef<HTMLDivElement | null>(null);
  const descriptionRef = useRef<HTMLParagraphElement | null>(null);
  const [descriptionExpanded, setDescriptionExpanded] = useState(false);
  const [descriptionOverflows, setDescriptionOverflows] = useState(false);
  const [editorOpen, setEditorOpen] = useState(false);
  const [editing, setEditing] = useState<RulebookRule | undefined>();
  const [editorSection, setEditorSection] = useState<string | undefined>();
  const [stagedRuleDraft, setStagedRuleDraft] = useState<
    Partial<RulebookDraftSnapshot> | undefined
  >();
  const [activeRuleDraft, setActiveRuleDraft] =
    useState<RulebookDraftSnapshot | null>(null);
  const [draftRevision, setDraftRevision] = useState(0);
  const [confirmActivate, setConfirmActivate] = useState(false);
  const [buildOpen, setBuildOpen] = useState(false);
  // THE MATRX LIBRARY (common-docs/systems/platform/library/STATE.md): a
  // Rulebook that lives in the Library org can be GIVEN to an industry — or to
  // everyone — through the ONE generic publish panel. Only Library-owned rows
  // can be published (`library_publish` asserts it), so the door only appears
  // there, and only for the platform admins who issue grants.
  const [libraryOrgId, setLibraryOrgId] = useState<string | null>(null);
  const [publishOpen, setPublishOpen] = useState(false);
  // The ingest dialog's lane is owned by ONE session primitive
  // (`durable-run/liveIngestLane.ts` § THE INGEST DIALOG SESSION), declared
  // below once `rulebook` exists: null means closed, and a latched lane is the
  // identity of what is on screen.
  const [wizardOpen, setWizardOpen] = useState(false);
  // W59 + W61: sorting the DRAFT pile by what the Rulebook is FOR.
  //
  // 🚨 A TRIAGE SESSION BELONGS TO ONE RULEBOOK (Bugbot, 2026-09-13) — the same
  // rule the ingest session lives by, and for the same reason: this page
  // instance is REUSED across Rulebooks. A bare `useState(false)` left the sort
  // dialog on screen after navigating, holding the purpose typed for the
  // Rulebook she left. Story + why the dialog is also remounted per Rulebook:
  // `../../durable-run/rulebookDialogSession.ts`.
  const triage = useRulebookDialogSession(rulebook?.id ?? null);
  const triageOpen = triage.open;
  const setTriageOpen = triage.setOpen;
  const [feedbackTarget, setFeedbackTarget] = useState<{
    rule: RulebookRule;
    mode: RuleFeedbackMode;
  } | null>(null);
  // The Improve verb — the dialog stays MOUNTED (not conditionally rendered)
  // so a run submitted from the wizard keeps going after "Keep reviewing".
  const [improveTarget, setImproveTarget] = useState<RulebookRule | null>(null);
  const [improveOpen, setImproveOpen] = useState(false);
  // Nudges the wizard to put an improved rule back at the end of its queue.
  const [wizardRequeue, setWizardRequeue] = useState<{
    id: string;
    token: number;
  } | null>(null);
  const searchParams = useSearchParams();
  // The guided start ("Distill your expertise") lands here with ?interview=1
  // when the knowledge lives in the Expert's head — the Scout interview IS the
  // next step.
  const [interviewOpen, setInterviewOpen] = useState(false);
  // Which interview the panel opens INTO — set by the Conversations section
  // (Continue resumes that conversation; New skips the chooser into a fresh
  // one). Cleared whenever the panel closes, so a plain "Interview me" always
  // shows the chooser.
  const [interviewTarget, setInterviewTarget] = useState<{
    conversationId?: string;
    newNonce: number;
  }>({ newNonce: 0 });
  // THE CONDUCTOR — the one canonical Masterwork system, held as a live
  // streaming conversation with this Rulebook attached. ?conduct=1 deep-links
  // straight into it.
  const [conductorOpen, setConductorOpen] = useState(false);
  // The Conductor is handed `rulebook.id`, so the arrival waits for it — the class fix beside the
  // interview's (cold walk 13): a `true` here spends the arrival on mount.
  useDeepLinkArrival(
    searchParams.get("conduct") === "1",
    Boolean(rulebook?.id),
    () => setConductorOpen(true),
  );
  // THE MEETING SCAVENGER lands here with ?meeting=1 — its dialog IS the next
  // step (`intake_query = {"meeting":"1"}` on the registry row).
  const [meetingOpen, setMeetingOpen] = useState(false);
  // The Meeting Scavenger dialog reads the Rulebook, so the arrival waits for it — the class fix beside the
  // interview's (cold walk 13): a `true` here spends the arrival on mount.
  useDeepLinkArrival(
    searchParams.get("meeting") === "1",
    Boolean(rulebook?.id),
    () => setMeetingOpen(true),
  );
  // 🚨 THE TRIAD GAME'S DEEP LINK. The guided start (`/masterwork/new?approach=
  // triad_game`) creates the Rulebook and then appends the registry row's own
  // `intake_query` to this page's URL — `?triad=1`. Every other lane's query
  // opens a dialog HERE; this one's lane is a whole route, so the only honest
  // thing this page can do with it is hand the Expert straight on to it.
  // Without this the card would be live, selectable, and land her on a bare
  // Rulebook page with no game and no error — census row 3's exact defect, the
  // one `approachLane.ts` exists to stop happening a second time.
  // The dump Approach ("Dump everything you have") lands here with ?dump=1 —
  // the Sources panel opens and scrolls into view as the next step.
  const dumpParam = searchParams.get("dump") === "1";
  /**
   * 🚨 THE INGEST DIALOG SESSION. One lane, resolved at open time and latched
   * until close — the remount `key`, the dialog's `initialLane` and
   * `timeline_open` in the agent surface scope all read it, so they cannot
   * disagree about what is on screen. While the dialog is CLOSED the lane
   * follows the live-run probe, which is how a case distillation started before
   * a refresh is picked back up instead of running invisibly; while it is OPEN
   * the probe is ignored, so a run settling can never remount the dialog out
   * from under the summary its owner is reading. Full story + the two Bugbot
   * defects: `features/masterwork/durable-run/liveIngestLane.ts`.
   */
  const ingest = useIngestDialogSession(rulebook?.id ?? null);
  const ingestOpen = ingest.open;
  const activeIngestLane = ingest.lane;
  /**
   * 🚨 EVERY EXPLICIT DOOR NAMES ITS LANE. "From a source", the assist
   * `open: "ingest"` chip and the Approach picker all come through here. A door
   * that opened the dialog without a lane inherited whatever the probe was
   * holding, and could launch a case distillation from a menu item that says
   * "From a source".
   */
  const openIngestLane = ingest.openOn;
  const setIngestOpen = ingest.setOpen;
  // The Approach picker's deep link (`platform.approach.intake_query`): choosing
  // the source / exemplar / file Approach must land ON that lane. Before this
  // param existed (2026-08-19) those three enabled Approaches dead-ended on a
  // bare detail page — the mechanical cause of exemplar's zero rules.
  const ingestParam = searchParams.get("ingest");
  // The lane names come from ONE list (`browse/approachLane.ts`) so a registry
  // row, a deep link, and the dialog can never disagree about what lanes
  // exist — the drift that left `timeline` with a live card and no capture UI.
  const ingestLane = toIngestLane(ingestParam);
  useEffect(() => {
    if (ingestLane) openIngestLane(ingestLane);
  }, [ingestLane, openIngestLane]);
  // THE APPROACH PICKER (2026-08-20). Every lane below is opened by a query
  // param read ONCE at mount, so the in-page picker cannot reach them by
  // changing the URL. Each param therefore gets a state twin the picker sets;
  // the param stays the deep-link entry and the twin is the in-page one, and
  // `launchApproach` is the ONE place that maps a registry row to a lane.
  const [approachPickerOpen, setApproachPickerOpen] = useState(false);
  const [dumpRequested, setDumpRequested] = useState(false);
  const [chatImportTab, setChatImportTab] = useState<"upload" | "matrx">(
    searchParams.get("tab") === "matrx" ? "matrx" : "upload",
  );
  /** The dump lane is focused by the deep link OR by the in-page picker. */
  const dumpFocus = dumpParam || dumpRequested;
  const router = useRouter();

  const triadParam = searchParams.get("triad") === "1";
  useDeepLinkArrival(triadParam, Boolean(rulebook?.id), () => {
    router.replace(`/masterwork/${rulebook!.id}/triad`);
  });


  // The body_of_work Approach ("Everything you've published") lands here with
  // ?body_of_work=1 — the corpus dialog IS the next step.
  const [corpusOpen, setCorpusOpen] = useState(false);
  // The corpus dialog reads the Rulebook, so the arrival waits for it — the class fix beside the
  // interview's (cold walk 13): a `true` here spends the arrival on mount.
  useDeepLinkArrival(
    searchParams.get("body_of_work") === "1",
    Boolean(rulebook?.id),
    () => setCorpusOpen(true),
  );
  // The chat-import Approach ("Import your AI chats") lands here with
  // ?chatImport=1 — the import dialog IS the next step. Full page:
  // /masterwork/[id]/import.
  const [chatImportOpen, setChatImportOpen] = useState(false);
  // The chat-import dialog reads the Rulebook, so the arrival waits for it — the class fix beside the
  // interview's (cold walk 13): a `true` here spends the arrival on mount.
  useDeepLinkArrival(
    searchParams.get("chatImport") === "1",
    Boolean(rulebook?.id),
    () => setChatImportOpen(true),
  );
  // SHADOW-THE-INBOX ("Shadow your inbox") lands here with ?shadowInbox=1 —
  // the inbox dialog IS the next step. The registry row carries the same
  // `{"shadowInbox":"1"}` in its `intake_query`, so the deep link and the
  // in-page picker can never drift apart. Full page: /masterwork/[id]/inbox.
  //
  // 🚨 AN INBOX SESSION BELONGS TO ONE RULEBOOK, the same rule triage, ingest,
  // unfolding, the ledger and the red pen already live by: this page instance
  // is REUSED across Rulebooks, and a bare `useState` would leave one Expert's
  // pasted mail thread — their real correspondence — on screen after
  // navigating to another Rulebook, and then distil it there.
  const shadowInboxSession = useRulebookDialogSession(rulebook?.id ?? null);
  const shadowInboxOpen = shadowInboxSession.open;
  const setShadowInboxOpen = shadowInboxSession.setOpen;
  const shadowInboxDeepLink = searchParams.get("shadowInbox") === "1";
  useDeepLinkArrival(shadowInboxDeepLink, Boolean(rulebook?.id), () =>
    setShadowInboxOpen(true),
  );
  // The TIMELINE Approach ("a case that unfolded") lands here with
  // ?intake=timeline — the unfolding dialog IS the next step. The registry row
  // carries the same `{"intake":"timeline"}` in its `intake_query`, so the
  // deep link and the in-page picker can never drift apart.
  //
  // 🚨 AN UNFOLDING SESSION BELONGS TO ONE RULEBOOK (Bugbot HIGH, 2026-09-13),
  // the same rule triage and ingest already live by — and the sharpest case of
  // the three. This was a bare `useState`, and this page instance is REUSED
  // across Rulebooks, so an open unfolding session stayed on screen after
  // navigating: the form fields, the durable-run pointer, and a teaching
  // case's RESOLUTION, all belonging to the Rulebook she left, while the run
  // actually going on the one she arrived at stayed invisible. The deep link
  // still opens it, now bound to the Rulebook that was on screen when it was
  // read. Second half at the call site: `key={rulebook.id}` on the dialog.
  const timelineSession = useRulebookDialogSession(rulebook?.id ?? null);
  const timelineOpen = timelineSession.open;
  const setTimelineOpen = timelineSession.setOpen;
  const timelineDeepLink = searchParams.get("intake") === "timeline";
  useDeepLinkArrival(timelineDeepLink, Boolean(rulebook?.id), () =>
    setTimelineOpen(true),
  );

  // THE BAD EXAMPLE PROBE Approach lands here with ?probe=1 from the guided
  // start, and its next step is a PAGE, not a dialog — so the deep link does
  // the one thing the picker's `case "probe"` does: go there.
  //
  // 🚨 THE CENSUS ROW 3 CLASS, on the other side of the door. `launchApproach`
  // is only called when the Expert picks an Approach from THIS page; a Rulebook
  // the funnel created and deep-linked arrives with nobody having picked
  // anything. Until this effect existed, `?probe=1` was a query string nothing
  // read: the funnel created the Rulebook, the card had been a real door all
  // the way through, and the Expert landed on a bare Rulebook page being told
  // to start an interview — the exact shape of the `timeline` defect, one step
  // further in. Found by driving the funnel end to end, 2026-09-15.
  const probeDeepLink = searchParams.get("probe") === "1";
  useDeepLinkArrival(probeDeepLink, Boolean(rulebook?.id), () => {
    router.replace(`/masterwork/${rulebook!.id}/probe`);
  });

  // THE SORTING TABLE lands here with ?sort=1 from the guided start, and its
  // next step is a PAGE, not a dialog — so the deep link does the one thing the
  // picker's `case "sortingTable"` does: go there.
  //
  // 🚨 FOUND LIVE, 2026-09-15, driving the funnel end to end as a user: the
  // registry row was live, `approachLane.ts` resolved it, `launchApproach`
  // dispatched it — and the funnel still dropped the Expert on a bare Rulebook
  // page, because `launchApproach` ONLY fires when somebody picks an Approach
  // ON this page, and a Rulebook the funnel just created arrives with nobody
  // having picked anything. Census row 3's defect, one step further in, for the
  // third time (timeline, then probe, then this). The guard that catches it for
  // every future lane is
  // `features/masterwork/browse/__tests__/approachLaneCoverage.test.ts`.
  const sortDeepLink = searchParams.get("sort") === "1";
  useDeepLinkArrival(sortDeepLink, Boolean(rulebook?.id), () => {
    router.replace(`/masterwork/${rulebook!.id}/sort`);
  });

  // THE TEACH-BACK Approach lands here with ?teachBack=1 from the guided start,
  // and its next step is a PAGE, not a dialog — so the deep link does the one
  // thing the picker's `case "teachBack"` does: go there. Same census-row-3
  // reasoning as the probe above: `launchApproach` only fires when the Expert
  // picks an Approach ON this page, and a Rulebook the funnel created and
  // deep-linked arrives with nobody having picked anything.
  const teachBackDeepLink = searchParams.get("teachBack") === "1";
  useDeepLinkArrival(teachBackDeepLink, Boolean(rulebook?.id), () => {
    router.replace(`/masterwork/${rulebook!.id}/teach-back`);
  });

  // THE CAPTURE PLAN lands here with ?plan=1 from the guided start, and its
  // next step is its own PAGE. Same census-row-3 reasoning as the probe and the
  // teach-back above: `launchApproach` only fires when the Expert picks an
  // Approach ON this page, and a Rulebook the funnel just created arrives with
  // nobody having picked anything — without this the card is a real door all
  // the way through and the Expert still lands on a bare Rulebook.
  const planDeepLink = searchParams.get("plan") === "1";
  useDeepLinkArrival(planDeepLink, Boolean(rulebook?.id), () => {
    router.replace(`/masterwork/${rulebook!.id}/plan`);
  });

  // THE PREDICTION LEDGER Approach ("Call it before you know") lands here with
  // ?predictions=1 — the ledger dialog IS the next step. The registry row
  // carries the same `{"predictions":"1"}` in its `intake_query`, so the deep
  // link and the in-page picker can never drift apart.
  //
  // 🚨 A LEDGER SESSION BELONGS TO ONE RULEBOOK, the same rule triage, ingest
  // and unfolding already live by: this page instance is REUSED across
  // Rulebooks, and a bare `useState` would leave a half-typed call about one
  // Expert's open case on screen after navigating to another Rulebook — and
  // then write it there.
  const predictionSession = useRulebookDialogSession(rulebook?.id ?? null);
  const predictionOpen = predictionSession.open;
  const setPredictionOpen = predictionSession.setOpen;
  const predictionDeepLink = searchParams.get("predictions") === "1";
  useDeepLinkArrival(predictionDeepLink, Boolean(rulebook?.id), () =>
    setPredictionOpen(true),
  );

  // THE DAILY DRIP ("One question a day") lands here with ?drip=1 — the drip
  // dialog IS the next step, because the first thing to do is pick a channel
  // and a time. The registry row carries the same `{"drip":"1"}` in its
  // `intake_query`, so the deep link and the in-page picker can never drift.
  //
  // 🚨 The ANSWERING does not happen here: it happens on
  // `/masterwork/[id]/drip`, which is where every daily question links, because
  // the person tapping that link is on a phone with thirty seconds and one
  // question in front of them.
  //
  // A drip session belongs to ONE Rulebook, the same rule the ledger above
  // lives by: this page instance is REUSED across Rulebooks, and a bare
  // `useState` would leave a half-typed answer about one Expert's morning on
  // screen after navigating to another Rulebook — and then write it there.
  const dripSession = useRulebookDialogSession(rulebook?.id ?? null);
  const dripOpen = dripSession.open;
  const setDripOpen = dripSession.setOpen;
  const dripDeepLink = searchParams.get("drip") === "1";
  useDeepLinkArrival(dripDeepLink, Boolean(rulebook?.id), () => setDripOpen(true));
  // THE RED-PEN LANE ("Mark it up here instead") lands here with ?red_pen=1 —
  // the markup dialog IS the next step. The registry row carries the same
  // `{"red_pen":"1"}` in its `intake_query`, so the deep link and the in-page
  // picker can never drift apart.
  //
  // 🚨 A MARKUP SESSION BELONGS TO ONE RULEBOOK, the same rule triage, ingest,
  // unfolding and the ledger already live by: this page instance is REUSED
  // across Rulebooks, and a bare `useState` would leave one Expert's
  // half-marked draft on screen after navigating to another Rulebook — and
  // then distil it there.
  const redPenSession = useRulebookDialogSession(rulebook?.id ?? null);
  const redPenOpen = redPenSession.open;
  const setRedPenOpen = redPenSession.setOpen;
  const redPenDeepLink = searchParams.get("red_pen") === "1";
  useDeepLinkArrival(redPenDeepLink, Boolean(rulebook?.id), () =>
    setRedPenOpen(true),
  );

  // Read straight off the Rulebook already in hand — the ledger lives on
  // `metadata.prediction_ledger`, so the page owes it no query of its own.
  const predictionEntries = rulebook ? ledgerOf(rulebook).entries : [];
  const drip = rulebook ? dripOf(rulebook) : null;
  const predictionEntryCount = predictionEntries.length;

  /**
   * THE ONE MAP from a `platform.approach` row to the lane it opens on this
   * page. A row's `intake_query` is the same contract the deep links use, so
   * the picker and a pasted URL can never drift apart; `launch_href` covers an
   * Approach whose lane is its own page (the Vision Interview, the Oracle tap).
   *
   * NO DEAD ENDS, AND NOTHING FAILS SILENTLY: the mapping itself lives in the
   * pure `resolveApproachLane` (so one list of lanes serves the registry, the
   * deep links and the dialog), and a row it cannot map is SAID OUT LOUD.
   * Until 2026-09-12 an unmapped row was pushed at its own query string
   * instead — a URL nothing read, which is how the live `timeline` card landed
   * Experts on a bare, empty Rulebook with no error and no capture UI.
   */
  const launchApproach = useCallback(
    (approach: DistillationApproach) => {
      const lane = resolveApproachLane(approach);
      if (!lane) {
        console.error(
          `[masterwork] the Approach "${approach.key}" has no lane in the product: ` +
            `intake_query=${JSON.stringify(approach.intakeQuery)} launch_href=${approach.launchHref}`,
        );
        toast.error(
          `“${approach.label}” has no way in yet — nothing on this page can take it. ` +
            "Pick another way to add rules; this has been logged as a defect.",
        );
        return;
      }
      switch (lane.kind) {
        case "href":
          router.push(lane.href);
          return;
        case "interview":
          setInterviewTarget({ newNonce: Date.now() });
          setInterviewOpen(true);
          return;
        case "ingest":
          openIngestLane(lane.lane);
          return;
        case "body_of_work":
          setCorpusOpen(true);
          return;
        case "chatImport":
          setChatImportTab(lane.tab);
          setChatImportOpen(true);
          return;
        case "dump":
          setDumpRequested(true);
          return;
        case "meeting":
          setMeetingOpen(true);
          return;
        case "conduct":
          setConductorOpen(true);
          return;
        // THE TRIAD GAME has no dialog on this page on purpose: it takes the
        // whole screen, on a phone, with a sticky footer and a swipe. The
        // picker sends the Expert to its route instead of half-rendering it
        // inside a Rulebook panel.
        case "triad":
          router.push(`/masterwork/${rulebookId}/triad`);
          return;
        // Trial 7's UNFOLDING-CASE door — the dialog that can also SEAL a case
        // as a held-out exam, which the `timeline` ingest lane has no notion
        // of. A registry row reaches it with `intake_query.intake="timeline"`.
        case "unfolding":
          setTimelineOpen(true);
          return;
        // THE PREDICTION LEDGER — calls on live cases, scored when the answer
        // arrives. A registry row reaches it with `intake_query.predictions="1"`.
        case "prediction":
          setPredictionOpen(true);
          return;
        // THE DAILY DRIP — one question a day by text or email. The DIALOG is
        // the right first step and not a page, because what an Expert does here
        // once is choose a channel and a time; the ANSWERING lives at
        // `/masterwork/[id]/drip`, which is where every daily question links,
        // because that reader is on a phone with thirty seconds. A registry row
        // reaches this with `intake_query.drip="1"`.
        case "drip":
          setDripOpen(true);
          return;
        // THE RED-PEN LANE — somebody else's work, marked up correction by
        // correction. A registry row reaches it with `intake_query.red_pen="1"`.
        case "redPen":
          setRedPenOpen(true);
          return;
        // THE BAD EXAMPLE PROBE — boundary hunting. Its own PAGE, not a dialog
        // or a panel: a probe is minutes of back-and-forth (a bad example, a
        // dictated catch, the next bad example), which is a working mode and
        // therefore owed a real URL like the interview and the Conductor.
        case "probe":
          router.push(`/masterwork/${rulebookId}/probe`);
          return;
        // THE TEACH-BACK — we explain their method back to them and they
        // interrupt. Its own PAGE for the probe's reason and one more: a round
        // plays AUDIO, and a voice coming out of a dialog somebody opened over
        // their Rulebook is not a working mode, it is an ambush.
        case "teachBack":
          router.push(`/masterwork/${rulebookId}/teach-back`);
          return;
        // THE SORTING TABLE — a pile of real cases sorted wordlessly, then the
        // boundary questions the edges between the piles produce. Its own PAGE
        // and not a dialog, for the Triad's reason: a phone-first sort needs the
        // whole screen and a sticky thumb-reachable row of piles.
        case "sortingTable":
          router.push(`/masterwork/${rulebookId}/sort`);
          return;
        // THE CAPTURE PLAN — a PROGRAM over the other lanes rather than a lane.
        // Its own PAGE because it is the longest-lived working mode here: an
        // Expert comes back to it daily, and every session reminder links to it.
        case "plan":
          router.push(`/masterwork/${rulebookId}/plan`);
          return;
        // SHADOW-THE-INBOX — the Expert's real mail, diffed against the reply
        // a competent generalist would have written. A registry row reaches it
        // with `intake_query.shadowInbox="1"`.
        case "shadowInbox":
          setShadowInboxOpen(true);
          return;
      }
    },
    [
      router,
      rulebookId,
      openIngestLane,
      setPredictionOpen,
      setRedPenOpen,
      setShadowInboxOpen,
      setTimelineOpen,
    ],
  );

  // Composer seed for the Scout panel — set when a recording distillation
  // reports gaps and the Expert chooses "Interview me about the gaps", or by
  // an improvement-brain assist chip (?assist=<dedupe_key>) whose launch
  // contract stages a seeded interview or opens the ingest dialog. Seeding
  // only pre-fills; the Expert always presses send.
  // Declared above the ?assist= effect below: a journey chip whose lane is the
  // Final Checkup opens it directly.
  const openCheckup = useOpenMasterworkCheckupWindow();
  const [interviewSeed, setInterviewSeed] = useState<string | undefined>();
  // Set by the `tensions_open` journey chip: the open-questions card is
  // already on the page, so the chip highlights it instead of opening a
  // second surface over the same rows. Cleared on the first settle.
  const [coherenceFlash, setCoherenceFlash] = useState(false);
  const assistKey = searchParams.get("assist");

  useEffect(() => {
    setDescriptionExpanded(false);
  }, [rulebookId, rulebook?.description]);

  useEffect(() => {
    if (descriptionExpanded) return;
    const description = descriptionRef.current;
    if (!description) {
      setDescriptionOverflows(false);
      return;
    }
    const measure = () => {
      setDescriptionOverflows(
        description.scrollHeight > description.clientHeight + 1,
      );
    };
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(description);
    return () => observer.disconnect();
  }, [descriptionExpanded, rulebook?.description]);

  useEffect(() => {
    if (!assistKey) return;
    let cancelled = false;
    void fetchAssistLaunch(assistKey).then((launch) => {
      if (cancelled || !launch) return;
      if (launch.open === "ingest") {
        // The chip says "add rules from a source" — it opens THAT lane, never
        // whatever lane a still-held rejoin probe happens to be naming.
        openIngestLane(DEFAULT_INGEST_LANE);
        return;
      }
      if (launch.open === "approaches") {
        // `masterwork.approach_selector` names the next move; a named key goes
        // straight into that lane, anything else opens the whole picker.
        if (launch.approachKey) {
          void fetchDistillationApproaches()
            .then((rows) => {
              if (cancelled) return;
              const hit = rows.find((a) => a.key === launch.approachKey);
              if (hit && hit.availability !== "coming_soon")
                launchApproach(hit);
              else setApproachPickerOpen(true);
            })
            .catch(() => {
              if (!cancelled) setApproachPickerOpen(true);
            });
          return;
        }
        setApproachPickerOpen(true);
        return;
      }
      // THE JOURNEY LANES (masterwork_assists/journey.py). Each one is a real
      // door on this page already — the chip only has to open it.
      if (launch.open === "checkup") {
        openCheckup({ rulebookId });
        return;
      }
      if (launch.open === "coherence") {
        // The questions live in a card the page always renders; the chip
        // scrolls to it and flags it, rather than forking a second surface
        // for the same rows.
        setCoherenceFlash(true);
        window.setTimeout(() => {
          document
            .getElementById(OPEN_QUESTIONS_ANCHOR)
            ?.scrollIntoView({ behavior: "smooth", block: "center" });
        }, 0);
        return;
      }
      if (launch.open === "conduct") {
        // No seed: the Conductor opens with this Rulebook already attached and
        // its whole job is to walk the method input by input. Staging words in
        // its composer would be telling it what it already knows.
        setConductorOpen(true);
        return;
      }
      if (launch.seed) setInterviewSeed(launch.seed);
      setInterviewOpen(true);
    });
    return () => {
      cancelled = true;
    };
  }, [assistKey, launchApproach, openCheckup, openIngestLane, rulebookId]);
  const userId = useAppSelector(selectUserId);
  // THE EXPERT'S WORDING for this Rulebook's review, and the agenda panel's
  // knob. Both are read once here and handed down — never re-read per row.
  const vocabulary = useReviewVocabulary(
    rulebook,
    rulebook?.organization_id ?? null,
    userId,
  );
  const agendaPanelEnabled = useAgendaPanelEnabled(
    rulebook?.organization_id ?? null,
    userId,
  );
  // THE MOST IMPORTANT SIGNAL WE HAVE (Arman, 2026-09-15) — how many of this
  // Rulebook's results the Expert has actually put their name to. `null` means
  // we could not read it, and the line SAYS so rather than printing a zero.
  const [signedTally, setSignedTally] = useState<SignedOutputTally | null>(null);
  const [signedUnreadable, setSignedUnreadable] = useState(false);
  const masterworkIdKey = masterworks.map((m) => m.id).join(",");
  useEffect(() => {
    let cancelled = false;
    const ids = masterworkIdKey ? masterworkIdKey.split(",") : [];

    void countSignedOutputs({ rulebookId, masterworkIds: ids })
      .then((tally) => {
        if (cancelled) return;
        setSignedTally(tally);
        setSignedUnreadable(false);
      })
      .catch((error: unknown) => {
        if (cancelled) return;
        setSignedTally(null);
        setSignedUnreadable(true);
        console.warn(
          "[masterwork] could not count signed outputs:",
          error instanceof Error ? error.message : error,
        );
      });
    return () => {
      cancelled = true;
    };
  }, [masterworkIdKey, rulebookId]);
  const isSuperAdmin = useAppSelector(selectIsSuperAdmin);
  const openAddRule = useOpenAddRuleWindow();

  // Resolved once, and only for the admins who can actually issue a grant.
  useEffect(() => {
    if (!isSuperAdmin) return;
    let cancelled = false;
    resolveLibraryOrgId()
      .then((id) => {
        if (!cancelled) setLibraryOrgId(id);
      })
      .catch((e) => {
        console.error(
          "[RulebookDetailPage] could not resolve the Library org:",
          e,
        );
      });
    return () => {
      cancelled = true;
    };
  }, [isSuperAdmin]);
  const openBuild = useOpenBuildWindow();
  const openYourWords = useOpenMasterworkYourWordsWindow();

  const reloadRulebook = useCallback(async () => {
    const r = await getRulebook(rulebookId);
    if (r) setRulebook(r);
  }, [rulebookId]);

  const reloadMasterworks = useCallback(() => {
    // The Masterworks section owns the reveal control — read both halves.
    void listMasterworksForRulebook(rulebookId, { includeArchived: true })
      .then(setMasterworks)
      .catch(() => undefined);
  }, [rulebookId]);

  /**
   * 🚨 THE COUNT AFTER A BUILD IS CONFIRMED, NEVER GUESSED (cold walk 5,
   * finding 6). The Build's terminal event fires the moment the run completes,
   * and the plain reload above read `workflow.definition` before the new row
   * was visible — so this page said "0 Built" about a Masterwork it had just
   * watched being built, and only a fresh navigation corrected it. The read now
   * waits for the id the Build announced, and if it still never appears it SAYS
   * so with the remedy instead of leaving a wrong number on screen.
   */
  const reloadMasterworksAfterBuild = useCallback(
    (workflowId: string) => {
      void listMasterworksAfterBuild(rulebookId, workflowId)
        .then(({ masterworks: next, confirmed }) => {
          setMasterworks(next);
          if (!confirmed) {
            toast.warning(
              "Your new Masterwork was built, but it has not shown up on this page yet — reload in a moment and it will be here.",
            );
          }
        })
        .catch(() => reloadMasterworks());
    },
    [reloadMasterworks, rulebookId],
  );

  // Every human "Add rule" entry point opens the WindowPanel (With AI default
  // + Manually) — the Rulebook stays visible behind it. The old blocking
  // dialog path is gone; RuleEditorDialog keeps only edit + staged drafts.
  const openAddRuleWindow = useCallback(
    (section?: string) => {
      openAddRule({
        rulebookId,
        defaultSection: section ?? null,
        onAdded: (e) => setRulebook(e.rulebook),
      });
    },
    [openAddRule, rulebookId],
  );

  // Building a Masterwork is the payoff moment of the product, so it opens as
  // a WindowPanel — draggable, resizable, minimisable, and survivable — never
  // the blocking dialog it lived in until 2026-08-18. The Rulebook stays
  // usable behind it while the Build runs.
  const openBuildWindow = useCallback(() => {
    setBuildOpen(true);
    openBuild({
      rulebookId,
      onBuilt: (e) => reloadMasterworksAfterBuild(e.workflowId),
      onWindowClose: () => setBuildOpen(false),
    });
  }, [openBuild, rulebookId, reloadMasterworksAfterBuild]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const [r, m] = await Promise.all([
          getRulebook(rulebookId),
          listMasterworksForRulebook(rulebookId, {
            includeArchived: true,
          }).catch(() => [] as Masterwork[]),
        ]);
        if (cancelled) return;
        if (r) {
          setRulebook(r);
          setMasterworks(m);
        }
      } catch (err) {
        // NEVER swallow this — the error is what tells AccessGate whether the
        // Expert is denied, signed out, or looking at a real fault.
        if (!cancelled) setError(err);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [rulebookId]);

  const canEdit =
    rulebook !== null && userId !== null && rulebook.created_by === userId;

  // 🚨 AN ARRIVAL IS HELD UNTIL THE SURFACE IT OPENS CAN EXIST (cold walk 13,
  // 2026-09-20, Friction). "Start" on New Masterwork navigates here with
  // `?interview=1` and the walker was "left on the Rulebook home with no panel
  // for 25 seconds"; a manual reload of the identical URL opened it.
  //
  // This hook's `ready` argument exists precisely for that — "may we act yet",
  // with the arrival HELD rather than dropped while it is false — and eleven
  // of the fifteen deep links on this page already pass the real answer
  // (`Boolean(rulebook?.id)`). Five passed a bare `true`, and the interview
  // was the worst of them: its panel is additionally gated on `canEdit`, which
  // cannot be true until the Rulebook row has loaded AND the viewer has been
  // resolved. So the arrival fired on MOUNT, into a page whose door did not
  // exist yet — and an arrival latches itself handled, so nothing re-ran it.
  //
  // `canEdit` is the honest readiness for THIS link: it is exactly the
  // condition under which `<ScoutInterviewPanel>` is rendered below. A reload
  // and a client-side arrival now fire at the same moment, which is the whole
  // point. A viewer who genuinely cannot edit never had a panel to open, and
  // the page is unchanged for them.
  useDeepLinkArrival(searchParams.get("interview") === "1", canEdit, () =>
    setInterviewOpen(true),
  );


  const existingIds = useMemo(
    () => new Set((rulebook?.rules ?? []).map((r) => r.id)),
    [rulebook?.rules],
  );

  // Every rule this Rulebook holds that only ONE source states — computed once
  // over the whole Rulebook, because "nobody else said this" is a statement
  // about the Rulebook, not about the rules currently on screen.
  const onlyOneSourceHolds = useMemo(
    () => heldByOneSourceOnly(rulebook?.rules ?? []),
    [rulebook?.rules],
  );

  /**
   * 🚨 THE OPENING VIEW. A small Rulebook opens on everything, because
   * everything is reviewable. A large one opens on `attention`: the
   * disagreements and the rules only one source holds — the judgments a bulk
   * approve would otherwise swallow without anyone reading them.
   */
  const ruleFilter: RuleKpiFilter =
    chosenFilter ??
    ((rulebook?.rules.length ?? 0) > LARGE_RULEBOOK ? "attention" : "all");
  const setRuleFilter = setChosenFilter;
  const isLargeRulebook = (rulebook?.rules.length ?? 0) > LARGE_RULEBOOK;

  const inAttentionView = useCallback(
    (r: RulebookRule) =>
      disagreesWith(r).length > 0 || onlyOneSourceHolds.has(r.id),
    [onlyOneSourceHolds],
  );

  const grouped = useMemo(() => {
    if (!rulebook)
      return [] as { code: string; label: string; rules: RulebookRule[] }[];
    const q = search.trim().toLowerCase();
    const match = (r: RulebookRule) => {
      const state = ruleState(r);
      const matchesFilter =
        ruleFilter === "all" ||
        (ruleFilter === "approved" && state === "approved") ||
        (ruleFilter === "draft" && state === "draft") ||
        (ruleFilter === "rejected" && state === "rejected") ||
        (ruleFilter === "changes" &&
          Boolean(r.feedback) &&
          state !== "rejected" &&
          state !== "retired") ||
        // ── the saved views ──────────────────────────────────────────────
        (ruleFilter === "attention" && inAttentionView(r)) ||
        (ruleFilter === "disagreements" && disagreesWith(r).length > 0) ||
        (ruleFilter === "seen_once" && recurrencePieces(r) <= 1) ||
        (ruleFilter === "only_source" && onlyOneSourceHolds.has(r.id));
      return (
        matchesFilter &&
        (!q ||
          r.name.toLowerCase().includes(q) ||
          r.statement.toLowerCase().includes(q) ||
          r.id.includes(q))
      );
    };
    const codes = Object.keys(rulebook.sections);
    const known = new Set(codes);
    const groups = codes.map((code) => ({
      code,
      label: rulebook.sections[code]?.label ?? code,
      rules: rulebook.rules.filter((r) => r.section === code && match(r)),
    }));
    const orphans = rulebook.rules.filter(
      (r) => !known.has(r.section) && match(r),
    );
    if (orphans.length > 0) {
      groups.push({ code: "?", label: "Unsorted", rules: orphans });
    }
    return groups;
  }, [rulebook, ruleFilter, search, inAttentionView, onlyOneSourceHolds]);

  const showRules = useCallback((filter: RuleKpiFilter) => {
    setRuleFilter(filter);
    setSearch("");
    requestAnimationFrame(() => {
      rulesSectionRef.current?.scrollIntoView({
        behavior: "smooth",
        block: "start",
      });
    });
  }, []);

  const visibleRules = useMemo(
    () => grouped.flatMap((group) => group.rules),
    [grouped],
  );

  const refreshWorkspace = useCallback(async () => {
    const [nextRulebook, nextMasterworks] = await Promise.all([
      getRulebook(rulebookId),
      listMasterworksForRulebook(rulebookId, { includeArchived: true }),
    ]);
    if (!nextRulebook) {
      throw new Error(
        "This Rulebook no longer exists, or you no longer have access to it.",
      );
    }
    setRulebook(nextRulebook);
    setMasterworks(nextMasterworks);
    return {
      rulebook_version: nextRulebook.version,
      // Honest count: the LIVE Masterworks, matching the agent surface scope.
      masterwork_count: splitMasterworksByArchive(nextMasterworks).active
        .length,
    };
  }, [rulebookId]);

  const buildSurfaceScope = useCallback(() => {
    if (!rulebook) {
      throw new Error("The Rulebook surface is still loading.");
    }
    return buildRulebookSurfaceScope({
      rulebook,
      masterworks: activeMasterworks,
      canEdit,
      searchQuery: search,
      visibleRules,
      activeRule: editing ?? null,
      activeRuleDraft,
      workspaceState: {
        editor_open: editorOpen,
        interview_open: interviewOpen,
        ingest_open: ingestOpen,
        // The timeline lane is a mode of this dialog, so it is live exactly
        // when the session on screen was opened on that lane.
        timeline_open: ingest.timelineOpen,
        triage_open: triageOpen,
        corpus_open: corpusOpen,
        chat_import_open: chatImportOpen,
        build_open: buildOpen,
        review_wizard_open: wizardOpen,
        activate_confirmation_open: confirmActivate,
        feedback_rule_id: feedbackTarget?.rule.id ?? null,
        feedback_mode: feedbackTarget?.mode ?? null,
        dump_focus: dumpFocus,
        assist_key: assistKey,
      },
    });
  }, [
    activeRuleDraft,
    assistKey,
    buildOpen,
    canEdit,
    chatImportOpen,
    confirmActivate,
    corpusOpen,
    dumpFocus,
    editing,
    editorOpen,
    feedbackTarget,
    ingestOpen,
    interviewOpen,
    activeMasterworks,
    rulebook,
    search,
    visibleRules,
    wizardOpen,
    ingest.timelineOpen,
    triageOpen,
  ]);

  const getPageApplicationScope = useCallback(
    () =>
      buildApplicationScopeFromMenuContext({
        selectedText: window.getSelection()?.toString() ?? "",
        selectionRange: null,
        contextData: buildSurfaceScope() as Record<string, unknown>,
      }),
    [buildSurfaceScope],
  );

  useSurfaceWriteHandlers(MASTERWORK_RULEBOOK_SURFACE_NAME, {
    rule_draft: (value: unknown) => {
      if (!rulebook) throw new Error("The Rulebook is still loading.");
      if (!canEdit) throw new Error("You cannot edit this Rulebook.");
      const next = requireRuleDraftInput(value, rulebook);
      setEditing(next.initial);
      setEditorSection(next.draft.section);
      setStagedRuleDraft(next.draft);
      setActiveRuleDraft(null);
      setDraftRevision((revision) => revision + 1);
      setEditorOpen(true);
    },
    search_query: (value: unknown) => {
      if (typeof value !== "string") {
        throw new Error("Rule search must be text.");
      }
      setSearch(value);
    },
  });

  useSurfaceClientTools(MASTERWORK_RULEBOOK_SURFACE_NAME, {
    masterwork_refresh_rulebook: async () => refreshWorkspace(),
  });

  const handleEditorOpenChange = useCallback((open: boolean) => {
    setEditorOpen(open);
    if (!open) {
      setStagedRuleDraft(undefined);
      setActiveRuleDraft(null);
    }
  }, []);

  const pageMenuSections = useMemo<ContextMenuExtraSection[]>(
    () => [
      {
        id: "masterwork-rulebook-actions",
        label: "Rulebook",
        anchor: "after-compare",
        items: [
          {
            kind: "item",
            id: "refresh-rulebook",
            label: "Refresh Rulebook",
            icon: RefreshCw,
            onSelect: () => {
              void refreshWorkspace()
                .then(() => toast.success("Rulebook refreshed"))
                .catch((err: unknown) =>
                  toast.error(
                    err instanceof Error ? err.message : "Could not refresh",
                  ),
                );
            },
          },
          ...(canEdit
            ? ([
                {
                  kind: "item" as const,
                  id: "add-rule",
                  label: "Add rule",
                  icon: Plus,
                  onSelect: () => openAddRuleWindow(),
                },
                {
                  kind: "item" as const,
                  id: "interview-me",
                  label: "New interview",
                  icon: MessageCircleQuestion,
                  onSelect: () => setInterviewOpen(true),
                },
                {
                  kind: "item" as const,
                  id: "ingest-source",
                  label: "From a source",
                  icon: FileUp,
                  onSelect: () => openIngestLane(DEFAULT_INGEST_LANE),
                },
              ] satisfies ContextMenuExtraSection["items"])
            : []),
          {
            kind: "item",
            id: "open-record-window",
            label: "Your words",
            icon: Quote,
            onSelect: () => openYourWords({ rulebookId }),
          },
          {
            kind: "link",
            id: "open-record-new-tab",
            label: "Your words in a new tab",
            icon: ExternalLink,
            href: `/masterwork/${rulebookId}/record`,
            target: "_blank",
          },
          {
            kind: "link",
            id: "open-masterworks",
            label: "Systems",
            icon: Workflow,
            href: `/masterwork/${rulebookId}/masterworks`,
          },
        ],
      },
    ],
    [canEdit, openYourWords, refreshWorkspace, rulebookId],
  );

  /**
   * 🚨 THE ONE WRITE PATH, and the one place a ruling is stamped. Every rule
   * whose review state or words this save changes gets `ruled_by`/`ruled_at`
   * here — a caller cannot forget to, and a caller cannot claim a ruling it did
   * not make. `reviewed` rides along only when the caller knows HOW the rules
   * were read (one opened and approved, or a bulk approve over a selection);
   * it is applied only to the rules this save actually changed.
   */
  const persist = useCallback(
    async (next: RulebookRule[], reviewed?: RuleReview) => {
      if (!rulebook) return;
      const before = new Map(rulebook.rules.map((r) => [r.id, r]));
      const stamped = next.map((rule) => {
        const prev = before.get(rule.id);
        if (!prev) return rule;
        const changed =
          ruleState(prev) !== ruleState(rule) ||
          prev.statement !== rule.statement ||
          prev.name !== rule.name ||
          (prev.feedback ?? "") !== (rule.feedback ?? "");
        return changed ? stampRuled(rule, userId, reviewed) : rule;
      });
      try {
        const saved = await saveRules({
          base: rulebook,
          rules: stamped,
        });
        setRulebook(saved);
      } catch (err) {
        // A lost version swap (the Scout or another tab saved first) is
        // recoverable: pull the fresh Rulebook so the NEXT save works, then
        // surface what happened. Without this, every later save 409s forever.
        void reloadRulebook();
        throw err;
      }
    },
    [rulebook, reloadRulebook, userId],
  );

  // 🚨 SAVING AN EDIT IS NOT APPROVING (Arman, 2026-08-17 — "You're updating
  // the data, not approving it"). This replaced the opposite doctrine that
  // silently approved a draft on save. The merge lives in ONE place
  // (`applyManualRuleEdit`, types.ts): draft stays draft (still awaiting the
  // explicit Approve button), approved stays approved; rejected/feedback
  // survive a no-op save but are RESOLVED by a content-changing edit (the
  // Expert's own hand supersedes the note they wrote for the Scout). A NEW
  // hand-authored rule lands live — the Expert typing it IS the human act
  // (AI-drafted rules land as drafts through the Improve/Add-with-AI paths).
  // Full matrix: FEATURE.md § The review-verb matrix.
  const saveRule = useCallback(
    async ({ rule, isNew }: RuleEditorResult) => {
      if (!rulebook) return;
      // 🚨 THE SAME REFUSAL AS THE CAS APPEND (wall W50). This page saves the
      // WHOLE rules list rather than going through `upsertRuleWithRetry`, so
      // the guard has to stand here too — otherwise a re-staged draft that the
      // Add-rule window would refuse lands silently from the editor dialog.
      if (isNew) {
        const identical = findIdenticalRule(rulebook.rules, rule);
        if (identical) throw new DuplicateRuleError(identical);
      }
      const prev = isNew
        ? undefined
        : rulebook.rules.find((r) => r.id === rule.id);
      const merged = prev ? applyManualRuleEdit(prev, rule) : rule;
      const next = isNew
        ? [...rulebook.rules, merged]
        : rulebook.rules.map((r) => (r.id === merged.id ? merged : r));
      await persist(next);
      toast.success(
        isNew
          ? "Rule added"
          : ruleState(merged) === "draft"
            ? "Rule saved — still waiting for your approval"
            : "Rule saved",
        { description: `Rulebook is now version ${rulebook.version + 1}.` },
      );
    },
    [rulebook, persist],
  );

  // Approval clears review state: rejected and feedback are transient — an
  // approved rule carries neither. Returns whether the save actually landed
  // so callers that auto-advance (the wizard) can stop instead of counting a
  // failed save as a decision.
  const approveRule = useCallback(
    async (rule: RulebookRule): Promise<boolean> => {
      if (!rulebook) return false;
      const next = rulebook.rules.map((r) => {
        if (r.id !== rule.id) return r;
        const { rejected: _rejected, feedback: _feedback, ...rest } = r;
        return { ...rest, draft: false };
      });
      try {
        // One rule, opened and approved: the honest record is "read".
        await persist(next, { mode: "read" });
        recordToast.success(
          { type: "rulebook_rule", id: rule.id, title: rule.name },
          `"${rule.name}" approved`,
        );
        return true;
      } catch (err) {
        toast.error(err instanceof Error ? err.message : "Could not approve");
        return false;
      }
    },
    [rulebook, persist],
  );

  // The Expert's self-service exit from "rejected": bring the rule back into
  // their own review queue (a rejected rule must never be a dead end that
  // only the interviewer can clear).
  const reconsiderRule = useCallback(
    async (rule: RulebookRule) => {
      if (!rulebook) return;
      const next = rulebook.rules.map((r) => {
        if (r.id !== rule.id) return r;
        const { rejected: _rejected, feedback: _feedback, ...rest } = r;
        return { ...rest, draft: true };
      });
      try {
        await persist(next);
        recordToast.success(
          { type: "rulebook_rule", id: rule.id, title: rule.name },
          `"${rule.name}" is back in your review queue`,
        );
      } catch (err) {
        toast.error(err instanceof Error ? err.message : "Could not save");
      }
    },
    [rulebook, persist],
  );

  // The Improve verb's landing: the rewrite becomes a DRAFT revision of the
  // same rule id through the canonical CAS upsert (bounded retry — a single-
  // rule upsert is commutative with concurrent Scout writes). Never approved
  // here; the Approve button stays the only approval.
  const landImprovedRule = useCallback(
    async (revised: RulebookRule) => {
      const saved = await upsertRuleWithRetry({ rulebookId, rule: revised });
      setRulebook(saved);
      setWizardRequeue({ id: revised.id, token: Date.now() });
    },
    [rulebookId],
  );

  const openImprove = useCallback((rule: RulebookRule) => {
    setImproveTarget(rule);
    setImproveOpen(true);
  }, []);

  // ── BULK APPROVE OVER AN EXPLICIT SELECTION ──────────────────────────────
  //
  // 🚨 What this replaced, and why (2026-09-12). `approveAllDrafts` flipped
  // every draft in the Rulebook with no selection, no count and no record. On
  // the one Rulebook where the volume actually occurred it fired on all 416
  // (Newsroom Desk: 416 rules, zero drafts), and on Watson's 206 twice — each
  // recorded as a cheat. The result on screen was indistinguishable from 416
  // real decisions.
  //
  // Three things changed, all of them load-bearing:
  //   1. the scope is an EXPLICIT selection the Expert made and can see
  //      ("37 selected → Approve");
  //   2. a selection containing a `disagrees_with` pair NAMES the pair before
  //      anything fires — approving both sides of a disagreement without
  //      reading it is exactly the consensus collapse the mandate forbids;
  //   3. every rule it touches records `reviewed: {mode: "sampled",
  //      sample_size, of}`, so the rule says "approved in bulk, 12 of 416 read"
  //      on its own face instead of wearing a real decision it never got.
  const selectedRules = useMemo(
    () => (rulebook?.rules ?? []).filter((r) => selectedIds.has(r.id)),
    [rulebook?.rules, selectedIds],
  );

  const toggleSelected = useCallback((ruleId: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(ruleId)) next.delete(ruleId);
      else next.add(ruleId);
      return next;
    });
  }, []);

  /** The `disagrees_with` pairs BOTH of whose sides are in this selection. */
  const pairsIn = useCallback(
    (rules: RulebookRule[]): [RulebookRule, RulebookRule][] => {
      const byId = new Map(rules.map((r) => [r.id, r]));
      const seen = new Set<string>();
      const pairs: [RulebookRule, RulebookRule][] = [];
      for (const rule of rules) {
        for (const otherId of disagreesWith(rule)) {
          const other = byId.get(otherId);
          if (!other) continue;
          const key = [rule.id, other.id].sort().join("|");
          if (seen.has(key)) continue;
          seen.add(key);
          pairs.push([rule, other]);
        }
      }
      return pairs;
    },
    [],
  );

  const openBulkApprove = useCallback(() => {
    const approvable = selectedRules.filter((r) => ruleState(r) === "draft");
    if (approvable.length === 0) {
      toast.error("Nothing in this selection is waiting on you.");
      return;
    }
    setReadCount("");
    setBulkConfirm({ rules: approvable, pairs: pairsIn(approvable) });
  }, [selectedRules, pairsIn]);

  const confirmBulkApprove = useCallback(async () => {
    if (!rulebook || !bulkConfirm) return;
    const ids = new Set(bulkConfirm.rules.map((r) => r.id));
    const sampleSize = Math.max(
      0,
      Math.min(bulkConfirm.rules.length, Number.parseInt(readCount, 10) || 0),
    );
    const next = rulebook.rules.map((r) => {
      if (!ids.has(r.id)) return r;
      const { feedback: _feedback, ...rest } = r;
      return { ...rest, draft: false };
    });
    try {
      await persist(next, {
        mode: "sampled",
        sample_size: sampleSize,
        of: bulkConfirm.rules.length,
      });
      setBulkConfirm(null);
      setSelectedIds(new Set());
      toast.success(
        `${bulkConfirm.rules.length} rule(s) approved in bulk`,
        {
          description: `Each one now says "approved in bulk, ${sampleSize} of ${bulkConfirm.rules.length} read" — so nobody later mistakes this for ${bulkConfirm.rules.length} decisions.`,
        },
      );
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not approve");
    }
  }, [rulebook, bulkConfirm, readCount, persist]);

  // Reject: the rule leaves the Expert's queue and waits for the interviewer,
  // who must rewrite it per this feedback (fresh draft) or withdraw it. A
  // rejected rule keeps draft=true so a Build can never include it.
  const rejectRule = useCallback(
    async (rule: RulebookRule, feedbackText: string) => {
      if (!rulebook) return;
      const next = rulebook.rules.map((r) =>
        r.id === rule.id
          ? { ...r, draft: true, rejected: true, feedback: feedbackText }
          : r,
      );
      await persist(next);
      recordToast.success(
        { type: "rulebook_rule", id: rule.id, title: rule.name },
        `"${rule.name}" rejected`,
        {
          description:
            "The interviewer will rewrite it or drop it on their next turn.",
        },
      );
    },
    [rulebook, persist],
  );

  // Request changes: the rule keeps its state (approved stays approved); the
  // note rides along until the interviewer applies it.
  const requestChanges = useCallback(
    async (rule: RulebookRule, feedbackText: string) => {
      if (!rulebook) return;
      const next = rulebook.rules.map((r) =>
        r.id === rule.id ? { ...r, feedback: feedbackText } : r,
      );
      await persist(next);
      recordToast.success(
        { type: "rulebook_rule", id: rule.id, title: rule.name },
        `Change request saved for "${rule.name}"`,
        { description: "It is applied on the interviewer's next turn." },
      );
    },
    [rulebook, persist],
  );

  const toggleRetired = useCallback(
    async (rule: RulebookRule) => {
      if (!rulebook) return;
      const next = rulebook.rules.map((r) =>
        r.id === rule.id ? { ...r, retired: r.retired !== true } : r,
      );
      try {
        await persist(next);
        toast.success(
          rule.retired ? `"${rule.name}" restored` : `"${rule.name}" retired`,
        );
      } catch (err) {
        toast.error(err instanceof Error ? err.message : "Could not save");
      }
    },
    [rulebook, persist],
  );

  // THE GUIDE LINE IS HERS (cold walk 22, friction): a rewrite by the
  // interviewer is a suggestion she accepts or declines — see
  // `SuggestedWording` and `suggestedDescription`.
  const guideSuggestion = rulebook ? suggestedDescription(rulebook) : null;
  const useSuggestedGuide = useCallback(async () => {
    if (!rulebook?.description) return;
    try {
      const saved = await setExpertDescription(rulebook, rulebook.description);
      setRulebook(saved);
      toast.success("Using the suggested wording");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not save that");
    }
  }, [rulebook]);
  const keepMyGuide = useCallback(async () => {
    if (!rulebook) return;
    const hers = expertDescription(rulebook);
    if (hers === null) return;
    try {
      const saved = await updateRulebookMeta({
        rulebookId: rulebook.id,
        patch: { description: hers },
      });
      setRulebook(saved);
      toast.success("Kept your wording");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not save that");
    }
  }, [rulebook]);

  const renameRulebook = useCallback(
    async (next: string) => {
      if (!rulebook) return;
      const name = next.trim();
      if (name === "" || name === rulebook.name) return;
      try {
        const saved = await updateRulebookMeta({
          rulebookId: rulebook.id,
          patch: { name },
        });
        setRulebook(saved);
        toast.success(`Renamed to "${saved.name}"`);
      } catch (err) {
        toast.error(
          err instanceof Error ? err.message : "Could not rename the Rulebook",
        );
        // Rejecting keeps the field open with her words in it, to retry.
        throw err;
      }
    },
    [rulebook],
  );

  const activate = useCallback(async () => {
    if (!rulebook) return;
    try {
      const saved = await updateRulebookMeta({
        rulebookId: rulebook.id,
        patch: { status: "active" },
      });
      setRulebook(saved);
      setConfirmActivate(false);
      toast.success("Marked as ready — this Rulebook now shows as Active.");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not activate");
    }
  }, [rulebook]);

  // THE JOURNEY (features/masterwork/journey.ts) — where this Rulebook is in
  // its life, from what this page already holds. No extra read, no endpoint:
  // the Rulebook row (rules + metadata.coherence + metadata.checkup) and the
  // Masterworks it was built into. It sees no runs and says so, so the
  // run-dependent moves stay silent here rather than guessing; the improvement
  // brain, which DOES read runs, raises those as chips below.
  //
  // 🚨 THIS MUST STAY ABOVE THE EARLY RETURNS BELOW. It sat under them until
  // 2026-08-22, so on the first (loading) render React saw 83 hooks and on the
  // second it saw 84 — "Rendered more hooks than during the previous render"
  // (React #310), which took the WHOLE Rulebook page down on every load. Hence
  // the null-safe body: the guards have not run yet at this point, so
  // `rulebook` can still be null here.
  const journey = useMemo(
    () =>
      rulebook
        ? computeJourney(
            journeyFactsFromRulebook(
              rulebook,
              activeMasterworks,
              // THE ARCHIVED-ITEMS LAW, honesty half: the journey's headline
              // is the page's header stat, and "no Masterwork yet" may not be
              // said from the live half alone (row F10 review, 2026-09-10).
              archivedMasterworks,
            ),
          )
        : null,
    [rulebook, activeMasterworks, archivedMasterworks],
  );

  if (loading) {
    return (
      <div className="flex h-full items-center justify-center">
        <LoadingSpinner />
      </div>
    );
  }
  if (error || !rulebook) {
    // NEVER hand-write "couldn't load it" copy. Under RLS an empty read means
    // four different things (denied · deleted · never existed · signed out),
    // and asserting one is wrong most of the time. AccessGate resolves the
    // TRUE state and gives a blocked Expert a way to ask the owner for access
    // — the alternative is telling someone their own work does not exist.
    return (
      <AccessGate
        token="rulebook"
        id={rulebookId}
        error={error}
        onRetry={() => void reloadRulebook()}
        fallbackHref="/masterwork/all"
        fallbackLabel="Back to Masterwork Studio"
      />
    );
  }

  // Only approved rules power a Masterwork — the Build excludes drafts and
  // rejected rules, so the button must not promise what it will refuse.
  const kpis = computeKpis(rulebook);
  const draftCount = kpis.drafts;
  const approvedCount = kpis.approved;
  // The Understudy (running-from-minute-one) is rendered as its own card and
  // never counted among the built Masterworks.
  const understudy = activeMasterworks.find((m) => m.understudy) ?? null;
  const builtCount = activeMasterworks.filter((m) => !m.understudy).length;
  const masterworkKpis = computeMasterworkKpis(
    activeMasterworks,
    rulebook.version,
    // The archived half feeds ONLY the never-built claim; every tile stays the
    // live count (THE ARCHIVED-ITEMS LAW — a screen never lies about how many
    // working systems the Expert has, nor about how many they ever built).
    archivedMasterworks,
  );
  // What the disclosure would reveal: the archived BUILT systems (an archived
  // Understudy is not one of the Expert's built Masterworks either way).
  const archivedBuilt = archivedMasterworks.filter((m) => !m.understudy);
  // The section must also appear when every built Masterwork is ARCHIVED:
  // otherwise the disclosure that reveals them has nowhere to live and the
  // archived half becomes unreachable from this page.
  const showMasterworksSection =
    builtCount > 0 || approvedCount > 0 || archivedBuilt.length > 0;

  return (
    <SurfaceRuntimeProvider
      surfaceName={MASTERWORK_RULEBOOK_SURFACE_NAME}
      getScope={buildSurfaceScope}
      isEditable={canEdit}
    >
      <NonEditableContextMenu
        sourceFeature="masterwork"
        surfaceName={MASTERWORK_RULEBOOK_SURFACE_NAME}
        menuVersion={1}
        getApplicationScope={getPageApplicationScope}
        contextData={buildSurfaceScope() as Record<string, unknown>}
        contentSource={{ type: "raw" }}
        entity={{
          type: "rulebook",
          id: rulebook.id,
          title: rulebook.name,
        }}
        extraSections={pageMenuSections}
      >
        <div
          className="mx-auto max-w-4xl space-y-4 px-4 pb-8 sm:px-6"
          data-surface-value="rulebook"
        >
          {/* THE PERSON, NOT THE ORG (2026-09-23): this Rulebook opens whatever
              organization is selected and never moves the selection itself.
              No organization notice (Arman, 2026-09-26): every child written
              under it takes the RULEBOOK's organization. */}
          {/* Rulebook summary */}
          <div className="rounded-lg border border-border bg-card p-4">
            {/* MOBILE: the Rulebook's NAME is the sentence the expert typed,
                and it shared this row with the icon utilities. At 390px that
                left the heading 182px — "An assistant that deci…" — so the one
                thing on the page that is hers was the one thing she could not
                read. The row wraps on a phone (`basis-full`): the name takes
                the card's full width on its own line and the utilities drop
                below it, right-aligned. From `sm:` up nothing changes. */}
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div className="min-w-0 flex-1 basis-full sm:basis-0">
                <div className="flex items-center gap-2">
                  <BookOpen className="h-4 w-4 text-muted-foreground" />
                  {/* MOBILE: `truncate` gave this heading ONE line. At 390px
                      that line is 182px wide and a Rulebook's name is the
                      sentence the expert typed — 528px of it here — so the
                      phone showed "An assistant that deci…" and the expert
                      could not read back her own goal anywhere on the page.
                      Two lines on a phone, one truncated line from `sm:` up
                      where the row has the width for it. */}
                  {/* 🚨 THE NAME IS RENAMED WHERE IT IS READ (cold walk 22, A).
                      The duplicate-name notice tells her to "rename either
                      from its own page" — and this page had no rename. The
                      owner clicks the name to edit it in place (the platform's
                      one inline-title primitive, `EditableLabel`): Enter or
                      leaving the field saves through the Rulebook's one meta
                      door, Esc cancels, an empty name is refused. */}
                  <h2
                    className="line-clamp-2 min-w-0 text-base font-semibold text-foreground sm:truncate"
                    data-surface-value="rulebook_name"
                  >
                    {canEdit ? (
                      <EditableLabel
                        value={rulebook.name}
                        commitMode="await"
                        ariaLabel="Rulebook name"
                        truncate={false}
                        validate={(next) =>
                          next.trim() === "" ? "A Rulebook needs a name" : null
                        }
                        onCommit={renameRulebook}
                        displayClassName="text-base font-semibold"
                        inputClassName="text-base font-semibold"
                      />
                    ) : (
                      rulebook.name
                    )}
                  </h2>
                </div>
              </div>
              {/* Rulebook-level utilities only. Rule actions live with the
                  rule KPIs below; Masterwork actions live in their own section. */}
              <div className="ml-auto flex shrink-0 items-center gap-1.5 sm:ml-0">
                {/* CANONICAL SHARING, NEVER A BESPOKE ONE (Arman, 2026-08-20):
                    a Rulebook is a registered shareable resource
                    (`platform.shareable_resource_registry` token `rulebook`,
                    RLS via `iam.has_access`). ICON ONLY since 2026-08-21 — "this
                    is a share icon. The icon is all we need. We don't need the
                    word Share, and it doesn't need to be up there taking prime
                    real estate." */}
                <ShareButton
                  resourceType="rulebook"
                  resourceId={rulebook.id}
                  resourceName={rulebook.name}
                  size="icon"
                  variant="ghost"
                  showStatus={false}
                />
                {/* THE MATRX LIBRARY — sharing by NAME (above) reaches people
                    you can name; this reaches a whole INDUSTRY, or everyone.
                    ONE spine, one panel: `platform.entity_grants` via
                    `public.library_publish`
                    (common-docs/systems/platform/library/STATE.md). Only a
                    Library-owned Rulebook can be published — the RPC asserts
                    it — so the door appears nowhere else. */}
                {isSuperAdmin &&
                libraryOrgId &&
                rulebook.organization_id === libraryOrgId ? (
                  <>
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <Button
                          size="icon"
                          variant="ghost"
                          className="h-8 w-8"
                          aria-label="Give this Rulebook to an industry"
                          onClick={() => setPublishOpen(true)}
                        >
                          <Library className="h-4 w-4" />
                        </Button>
                      </TooltipTrigger>
                      <TooltipContent className="max-w-xs">
                        <p>
                          Give this Rulebook to a whole industry, one
                          organization, or everyone. Each recipient gets their
                          own editable copy.
                        </p>
                      </TooltipContent>
                    </Tooltip>
                    <LibraryPublishPanel
                      isOpen={publishOpen}
                      onClose={() => setPublishOpen(false)}
                      entityType="rulebook"
                      entityId={rulebook.id}
                      entityName={rulebook.name}
                      recipientHint="Each organization that adds it gets its OWN editable copy of these rules — never a view of yours."
                    />
                  </>
                ) : null}
                <WhatsWhatDialog
                  triggerLabel="Guide"
                  triggerClassName="h-8 px-2 text-xs"
                />
              </div>
            </div>
            {/* THE SAME SENTENCE TWICE IS NOT A HEADER, IT IS A BUG.
                A Rulebook auto-named from its goal gets a NAME that is the
                first N characters of its DESCRIPTION, so the header printed
                "Replying to client emails about data destruction scheduling"
                and then, directly under it, "Replying to client emails about
                data destruction scheduling and pricing"
                (jobs-bar-2026-09-16, item 19). When the description only
                repeats the name it adds nothing and is left out. */}
            {rulebook.description &&
            !rulebook.description
              .trim()
              .toLowerCase()
              .startsWith(rulebook.name.trim().toLowerCase().replace(/…$/, "")) ? (
              <div className="mt-2">
                <p
                  ref={descriptionRef}
                  className={cn(
                    "text-sm leading-5 text-muted-foreground",
                    !descriptionExpanded && "line-clamp-2",
                  )}
                  data-surface-value="rulebook_description"
                >
                  {rulebook.description}
                </p>
                {canEdit && guideSuggestion ? (
                  <SuggestedWording
                    hers={guideSuggestion.hers}
                    onUse={useSuggestedGuide}
                    onKeepMine={keepMyGuide}
                  />
                ) : null}
              </div>
            ) : null}
            <div className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-muted-foreground">
              {rulebook.source.author ? (
                <span>
                  {rulebook.source.title ? `“${rulebook.source.title}” — ` : ""}
                  {rulebook.source.author}
                  {rulebook.source.year ? `, ${rulebook.source.year}` : ""}
                </span>
              ) : null}
              {/* THE DOOR LAW — the version number is an identity, so it
                  opens: the full version log from `rulebook_versions`. */}
              <RulebookVersionHistory
                rulebookId={rulebook.id}
                version={rulebook.version}
              />
              <Badge variant="outline" className="px-1.5 py-0 text-[10px]">
                {rulebook.status === "draft"
                  ? "Draft"
                  : rulebook.status === "active"
                    ? "Active"
                    : "Archived"}
              </Badge>
              {descriptionOverflows || descriptionExpanded ? (
                <button
                  type="button"
                  className="font-medium text-primary underline-offset-2 hover:underline"
                  onClick={() =>
                    setDescriptionExpanded((expanded) => !expanded)
                  }
                  aria-expanded={descriptionExpanded}
                >
                  {descriptionExpanded ? "Show less" : "Read more"}
                </button>
              ) : null}
            </div>
            <div className="mt-4">
              <RulebookKpiStrip
                kpis={kpis}
                journey={journey ?? undefined}
                live={understudy !== null}
                activeFilter={ruleFilter}
                onFilterChange={showRules}
              />
              {/* BESIDE THE QUICK CHECK: the Expert's own signature count. A
                  score a judge produced is a check; a result the Expert signed
                  is the signal. Only shown once something exists to run. */}
              {masterworks.length > 0 ||
              signedUnreadable ||
              (signedTally !== null &&
                signedTally.signed + signedTally.corrected > 0) ? (
                <p className="mt-2 flex flex-wrap items-center gap-1.5 text-xs text-muted-foreground">
                  <Signature className="h-3.5 w-3.5 shrink-0 text-primary" />
                  {signedUnreadable ? (
                    <span>
                      Couldn&apos;t read the signatures on this Rulebook&apos;s
                      results just now — reload to try again.
                    </span>
                  ) : (
                    <>
                      <span className="font-medium text-foreground">
                        {signedTally?.signed ?? 0}{" "}
                        {signedTally?.signed === 1 ? "output" : "outputs"} signed
                        by the expert
                      </span>
                      {signedTally && signedTally.corrected > 0 ? (
                        <span>
                          · {signedTally.corrected} corrected — each one a rule
                          waiting to be written
                        </span>
                      ) : null}
                    </>
                  )}
                </p>
              ) : null}
            </div>
            {agendaPanelEnabled ? (
              <NextSessionAgenda
                rulebook={rulebook}
                vocabulary={vocabulary}
                className="mt-3"
              />
            ) : null}
            {/* Rules-only actions. Masterwork creation and inventory have a
                separate section so these controls never imply mixed scope. */}
            <div className="mt-3 grid grid-cols-2 gap-1.5 sm:grid-flow-col sm:auto-cols-fr sm:grid-cols-none">
              {canEdit && approvedCount > 0 ? (
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Button
                      size="sm"
                      variant="outline"
                      className="h-8 w-full min-w-0 justify-center px-2 text-xs"
                      onClick={() => openCheckup({ rulebookId: rulebook.id })}
                    >
                      <Stethoscope className="h-3.5 w-3.5" />
                      Check gaps
                    </Button>
                  </TooltipTrigger>
                  <TooltipContent className="max-w-xs">
                    <p>
                      Reads back everything you have ever told us and finds what
                      your {approvedCount} rules still do not say.
                    </p>
                    <p className="mt-1 text-[11px] opacity-70">
                      Agent: masterwork_checkup_auditor
                    </p>
                  </TooltipContent>
                </Tooltip>
              ) : null}
              {/* Status is a LABEL, not a gate — nothing reads `active` except
                  the badge and the browse list, and building works in either
                  state. The confirm dialog says exactly that. */}
              {canEdit && rulebook.status === "draft" ? (
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Button
                      size="sm"
                      variant="ghost"
                      className="h-8 w-full min-w-0 justify-center px-2 text-xs"
                      onClick={() => setConfirmActivate(true)}
                    >
                      <CheckCircle2 className="h-3.5 w-3.5" />
                      Ready
                    </Button>
                  </TooltipTrigger>
                  <TooltipContent className="max-w-xs">
                    <p>
                      A label for other people, nothing more — it changes the
                      badge and where this shows up in lists. Nothing here waits
                      on it.
                    </p>
                  </TooltipContent>
                </Tooltip>
              ) : null}
              {/* 🚨 "Approve all" is GONE (2026-09-12). It flipped every draft
              in the Rulebook with no selection, no count and no record, and on
              the one Rulebook where the volume occurred it fired on all 416.
              Bulk approval now lives below the rules, on an explicit selection
              the Expert can see. Nothing replaces it here. */}
              {draftCount > 0 && canEdit ? (
                <>
                  <Button
                    size="sm"
                    className="h-8 w-full min-w-0 justify-center px-2 text-xs"
                    onClick={() => setWizardOpen(true)}
                  >
                    <ListTodo className="h-3.5 w-3.5" />
                    Review
                  </Button>
                  {/* W59 + W61, 2026-09-12. A distiller reads the page in
                      front of it, never the Rulebook's purpose, so one workbook
                      landed 336 drafts about infection control on a Rulebook
                      about deciding the next test — and the only doors were
                      Approve-all or 336 clicks. This is the third door. */}
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <Button
                        size="sm"
                        variant="outline"
                        className="h-8 w-full min-w-0 justify-center px-2 text-xs"
                        onClick={() => setTriageOpen(true)}
                      >
                        <ListFilter className="h-3.5 w-3.5" />
                        Sort the drafts
                      </Button>
                    </TooltipTrigger>
                    <TooltipContent className="max-w-xs">
                      <p>
                        Say what this Rulebook is for, in your own words, and we
                        read all {draftCount} drafts against it — keeping what
                        serves it, setting aside what does not, and rewriting
                        the ones that are right but written too narrowly.
                      </p>
                      <p className="mt-1 text-[11px] opacity-70">
                        Agent: masterwork.draft_triage
                      </p>
                    </TooltipContent>
                  </Tooltip>
                </>
              ) : null}
            </div>
            {draftCount > 0 && canEdit && approvedCount === 0 ? (
              <p className="mt-2 text-xs text-muted-foreground">
                Approved rules are what power a Masterwork — none yet.
              </p>
            ) : null}
          </div>

          {showMasterworksSection ? (
            <div className="space-y-3" data-surface-value="masterworks_summary">
              <section className="rounded-lg border border-border bg-card p-4">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      <Workflow className="h-4 w-4 text-muted-foreground" />
                      <h3 className="text-sm font-semibold text-foreground">
                        Masterworks
                      </h3>
                    </div>
                    <p className="mt-2 text-xs text-muted-foreground">
                      Working systems built from your approved rules.
                    </p>
                  </div>
                  {builtCount > 0 ? (
                    <Button
                      asChild
                      size="sm"
                      variant="ghost"
                      className="h-8 shrink-0 px-2 text-xs"
                    >
                      <Link href={`/masterwork/${rulebook.id}/masterworks`}>
                        View all
                        <ChevronRight className="h-3.5 w-3.5" />
                      </Link>
                    </Button>
                  ) : null}
                </div>

                <div className="mt-4">
                  <MasterworkKpiStrip
                    kpis={masterworkKpis}
                    rulebookId={rulebook.id}
                  />
                </div>

                {/* 🚨 "0 Built" OVER A LIVE BUILD IS NOT A COUNT, IT IS A LIE
                    (cold walk 7, finding 1, 2026-09-17). The Build keeps going
                    without the person who started it — the window says so —
                    but every signal that one was in flight lived in the tab
                    that launched it (a `localStorage` receipt, and the window
                    that renders the progress). The walk started a Quick Build,
                    closed the browser context entirely, came back inside the
                    build's own stated minute, and got a page identical to one
                    where nothing had ever been started. This asks the SERVER
                    row instead, on mount, in any browser. */}
                <BuildInFlightNotice
                  rulebookId={rulebook.id}
                  onSettled={reloadMasterworks}
                />

                {/* THE ARCHIVED-ITEMS LAW: the KPI strip above counts only the
                    LIVE systems, so the archived ones get their own honest
                    count and are one click from being read — here, on this
                    page, not buried behind another route. Nothing renders when
                    there are none. */}
                <ArchivedDisclosure
                  className="mt-2"
                  count={archivedBuilt.length}
                  open={showArchivedMasterworks}
                  onOpenChange={setShowArchivedMasterworks}
                  label="Archived Masterworks"
                >
                  <ul className="space-y-1">
                    {archivedBuilt.map((m) => (
                      <li
                        key={m.id}
                        className="flex items-center justify-between gap-2 rounded-md border border-border bg-muted/30 px-2 py-1.5"
                      >
                        <span className="min-w-0 truncate text-xs text-foreground">
                          {m.name}
                        </span>
                        <Link
                          href={`/masterwork/${rulebook.id}/masterworks`}
                          className="shrink-0 text-[11px] text-muted-foreground hover:text-foreground hover:underline"
                        >
                          Open
                        </Link>
                      </li>
                    ))}
                  </ul>
                </ArchivedDisclosure>

                {canEdit && approvedCount > 0 ? (
                  <div className="mt-3 grid grid-cols-2 gap-1.5">
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <Button
                          size="sm"
                          variant="outline"
                          className="h-8 w-full min-w-0 justify-center px-2 text-xs"
                          onClick={openBuildWindow}
                        >
                          <Hammer className="h-3.5 w-3.5" />
                          Quick build
                        </Button>
                      </TooltipTrigger>
                      <TooltipContent className="max-w-xs">
                        <p>
                          Builds a system straight from your {approvedCount}
                          approved rules, no questions asked.
                        </p>
                        <p className="mt-1 text-[11px] opacity-70">
                          Agents: masterwork_template_maker ·
                          masterwork_rulebook_auditor ·
                          masterwork_template_chief_generate
                        </p>
                      </TooltipContent>
                    </Tooltip>
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <Button
                          size="sm"
                          className="h-8 w-full min-w-0 justify-center px-2 text-xs"
                          onClick={() => setConductorOpen(true)}
                        >
                          <AGENT_ICON className="h-3.5 w-3.5" />
                          Build with me
                        </Button>
                      </TooltipTrigger>
                      <TooltipContent className="max-w-xs">
                        <p>
                          Reads your approved rules, asks what is missing, and
                          builds the system with you.
                        </p>
                        <p className="mt-1 text-[11px] opacity-70">
                          Agent: masterwork_conductor
                        </p>
                      </TooltipContent>
                    </Tooltip>
                  </div>
                ) : null}
              </section>

              {understudy ? (
                <div data-surface-value="understudy">
                  <UnderstudyCard
                    rulebookId={rulebook.id}
                    understudy={understudy}
                    approvedCount={approvedCount}
                    rulebookVersion={rulebook.version}
                    canEdit={canEdit}
                    onCreated={reloadMasterworks}
                  />
                </div>
              ) : null}
            </div>
          ) : null}

          {/* THE ONE INPUTS SECTION — interviews, documents, published work,
          AI chats and the record, together. Arman, 2026-08-18: "all of the
          things I'm putting in to get a result should be together, not put
          all across the fucking code." Nothing that feeds a rule may live
          anywhere else on this page. */}
          <RulebookInputsSection
            rulebook={rulebook}
            canEdit={canEdit}
            dumpFocus={dumpFocus}
            onRulebookChanged={setRulebook}
            onIngested={reloadRulebook}
            onContinueInterview={(conversationId) => {
              setInterviewTarget({ conversationId, newNonce: 0 });
              setInterviewOpen(true);
            }}
            onStartInterview={() => {
              setInterviewTarget({ newNonce: Date.now() });
              setInterviewOpen(true);
            }}
            onOpenApproaches={() => setApproachPickerOpen(true)}
          />

          {/* THE UNDERSTUDY — the system that runs from minute one (vision doc
          13). One crude agent does the whole job now; every rules save
          rebuilds it for free, so the Expert watches it get better instead
          of filling in a form and waiting for value. */}
          {!showMasterworksSection ? (
            <div data-surface-value="understudy">
              <UnderstudyCard
                rulebookId={rulebook.id}
                understudy={understudy}
                approvedCount={approvedCount}
                rulebookVersion={rulebook.version}
                canEdit={canEdit}
                onCreated={reloadMasterworks}
              />
            </div>
          ) : null}

          {/* THE PREDICTION LEDGER — what she called before she knew, and how
          close those calls land. Renders only once there is a ledger: a
          Rulebook built any other way shows nothing here, which is the true
          state. With calls recorded but no outcomes yet, the readout says so
          in words and draws no chart — an empty plot would read as "you are
          calibrated at nothing" rather than "we do not know yet". */}
          {predictionEntryCount > 0 ? (
            <div
              className="space-y-2"
              data-surface-value="prediction_ledger"
            >
              <div className="flex flex-wrap items-center justify-between gap-2">
                <h2 className="text-sm font-semibold text-foreground">
                  Calls you made before you knew
                </h2>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => setPredictionOpen(true)}
                >
                  Open your calls
                </Button>
              </div>
              <CalibrationReadout entries={predictionEntries} />
            </div>
          ) : null}

          {/* THE DAILY DRIP — the streak and, far more importantly, what a
          minute a day has actually bought. Renders only once there is a
          subscription or a question has gone out: a Rulebook built any other
          way shows nothing here, which is the true state. */}
          {drip && (drip.subscription || drip.days.length > 0) ? (
            <div className="space-y-2" data-surface-value="daily_drip">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <h2 className="text-sm font-semibold text-foreground">
                  Your daily question
                </h2>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => setDripOpen(true)}
                >
                  Open it
                </Button>
              </div>
              <DripStreakReadout
                drip={drip}
                rules={rulebook.rules ?? []}
                // The detail page does not read this knob — the dialog does,
                // one tap away. `null` means the sentence that depends on it is
                // not shown, rather than shown against a number nobody read.
                minAnswersToDistill={null}
              />
            </div>
          ) : null}

          {/* THE COHERENCE PARTNER (D11 · UNPARTNERED CAPTURE) — the questions
          only the Expert can settle, sitting directly above the rules they are
          about. Renders nothing when there are none, which is the normal and
          correct state. Never a blocker: nothing on this page waits on them. */}
          <OpenQuestionsCard
            rulebook={rulebook}
            canEdit={canEdit}
            highlight={coherenceFlash}
            onSettled={() => {
              setCoherenceFlash(false);
              return reloadRulebook();
            }}
            onTalkItThrough={(seed) => {
              setInterviewSeed(seed);
              setInterviewOpen(true);
            }}
            onOpenRule={(ruleId) => {
              setSearch(ruleId);
            }}
          />

          {/* Rules toolbar — search and Add rule, nothing else. Every way of
          feeding this Rulebook moved into the Sources section above; this row
          used to also carry "Interview me", "From a source", "Your published
          work" and "Your AI chats". */}
          <div ref={rulesSectionRef} className="scroll-mt-4 space-y-2">
            <div className="flex flex-col items-stretch gap-2 sm:flex-row sm:items-center">
              <Input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search rules…"
                className="h-10 max-w-none text-base sm:h-8 sm:max-w-xs sm:text-sm"
                data-surface-value="search_query"
              />
              <div className="flex min-w-0 flex-wrap gap-1">
                {/* 🚨 SAVED VIEWS, not one-off filters (Airtable). On a large
                Rulebook "Start here" is where the page OPENS and "All N" is a
                deliberate click — the count is on the chip so the size of what
                you are asking for is never a surprise. */}
                {(
                  [
                    ...(isLargeRulebook
                      ? ([["attention", "Start here"]] as [
                          RuleKpiFilter,
                          string,
                        ][])
                      : []),
                    ["all", `All ${rulebook.rules.length}`],
                    ["approved", "Approved"],
                    ["draft", "Waiting"],
                    ["disagreements", "Disagreements"],
                    ["only_source", "Only this source holds"],
                    ["seen_once", "Seen once"],
                    ...(kpis.rejected > 0
                      ? [["rejected", "With interviewer"]]
                      : []),
                    ...(kpis.changeRequests > 0
                      ? [["changes", "Changes"]]
                      : []),
                  ] as [RuleKpiFilter, string][]
                ).map(([filter, label]) => (
                  <Button
                    key={filter}
                    type="button"
                    size="sm"
                    variant={ruleFilter === filter ? "secondary" : "ghost"}
                    className="h-8 px-2.5 text-xs"
                    onClick={() => setRuleFilter(filter)}
                  >
                    {label}
                  </Button>
                ))}
              </div>
              {canEdit ? (
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Button
                      size="sm"
                      className="h-10 w-full sm:h-8 sm:w-auto"
                      onClick={() => openAddRuleWindow()}
                    >
                      <Plus className="h-4 w-4" />
                      Add rule
                    </Button>
                  </TooltipTrigger>
                  <TooltipContent>
                    Write one rule yourself, or have AI draft it
                  </TooltipContent>
                </Tooltip>
              ) : null}
            </div>

            {/* 🚨 A DEFAULT VIEW THAT IS NOT EVERYTHING says so, out loud —
            a screen that silently shows a subset is a screen that lies. */}
            {ruleFilter === "attention" && isLargeRulebook ? (
              <p className="rounded-md border border-border bg-muted/40 px-3 py-2 text-xs text-muted-foreground">
                This Rulebook holds {rulebook.rules.length} rules, so it opens
                on the ones worth your eyes first: where two sources disagree,
                and where only one source holds the judgment. Everything else is
                one click away under{" "}
                <span className="font-medium text-foreground">
                  All {rulebook.rules.length}
                </span>
                .
              </p>
            ) : null}

            {/* Sections */}
            <div data-surface-value="rules" className="space-y-6">
              {rulebook.rules.length === 0 ? (
                /* Empty state — one sentence and ONE button. Every other way in
                 lives in Sources above; repeating them here is what made this
                 page a maze. */
                <div className="rounded-lg border border-dashed border-border p-6 text-center">
                  <p className="text-sm text-muted-foreground">
                    No rules yet. Rules come from what you put in{" "}
                    <span className="font-medium text-foreground">Sources</span>{" "}
                    above — start an interview and they get written down as you
                    speak.
                  </p>
                  {canEdit ? (
                    <Button
                      size="sm"
                      variant="outline"
                      className="mt-3"
                      onClick={() => openAddRuleWindow()}
                    >
                      <Plus className="h-4 w-4" />
                      Or write one yourself
                    </Button>
                  ) : null}
                </div>
              ) : visibleRules.length === 0 ? (
                <div className="rounded-lg border border-dashed border-border p-6 text-center">
                  <p className="text-sm text-muted-foreground">
                    No rules match this view.
                  </p>
                  <Button
                    type="button"
                    size="sm"
                    variant="ghost"
                    className="mt-2"
                    onClick={() => {
                      setSearch("");
                      setRuleFilter("all");
                    }}
                  >
                    Show all rules
                  </Button>
                </div>
              ) : (
                grouped.map((group) =>
                  group.rules.length === 0 ? null : (
                    <section key={group.code} className="space-y-2">
                      <div className="grid grid-cols-[minmax(0,1fr)_auto] items-start gap-3 sm:flex sm:items-center sm:justify-between sm:gap-0">
                        <h3 className="min-w-0 text-sm font-semibold leading-snug text-foreground sm:leading-normal">
                          <span>{group.label}</span>
                          <span className="mt-0.5 block text-xs font-normal text-muted-foreground sm:ml-2 sm:mt-0 sm:inline">
                            {group.rules.length}{" "}
                            {group.rules.length === 1 ? "rule" : "rules"}
                          </span>
                        </h3>
                        {canEdit && group.code !== "?" ? (
                          <Button
                            size="sm"
                            variant="ghost"
                            className="h-10 sm:h-7"
                            onClick={() => openAddRuleWindow(group.code)}
                          >
                            <Plus className="h-3.5 w-3.5" />
                            Add here
                          </Button>
                        ) : null}
                      </div>
                      <div className="space-y-1">
                        {group.rules.map((rule) => (
                          <RuleRow
                            key={rule.id}
                            rule={rule}
                            allRules={rulebook.rules}
                            canEdit={canEdit}
                            onEdit={() => {
                              setEditing(rule);
                              setEditorSection(undefined);
                              setStagedRuleDraft(undefined);
                              setEditorOpen(true);
                            }}
                            onToggleRetired={() => void toggleRetired(rule)}
                            onApprove={() => void approveRule(rule)}
                            onReject={() =>
                              setFeedbackTarget({ rule, mode: "reject" })
                            }
                            onImprove={() => openImprove(rule)}
                            onRequestChanges={() =>
                              setFeedbackTarget({ rule, mode: "request" })
                            }
                            onReconsider={() => void reconsiderRule(rule)}
                            selected={selectedIds.has(rule.id)}
                            onToggleSelected={() => toggleSelected(rule.id)}
                            recurrenceThreshold={recurrenceThreshold}
                            vocabulary={vocabulary}
                          />
                        ))}
                      </div>
                    </section>
                  ),
                )
              )}
            </div>
          </div>

          {/* 🚨 BULK ACTIONS TAKE AN EXPLICIT SELECTION. The bar only exists
          when rules are selected, and it says exactly how many — the scope of
          a bulk verb is never invisible. */}
          {canEdit && selectedIds.size > 0 ? (
            <div className="sticky bottom-3 z-10 flex flex-wrap items-center gap-2 rounded-lg border border-border bg-card px-3 py-2 shadow-lg">
              <span className="text-sm font-medium text-foreground">
                {selectedIds.size} selected
              </span>
              <Button size="sm" onClick={openBulkApprove}>
                <CheckCircle2 className="h-3.5 w-3.5" />
                Approve
              </Button>
              <Button
                size="sm"
                variant="ghost"
                onClick={() => setSelectedIds(new Set())}
              >
                Clear
              </Button>
              <Button
                size="sm"
                variant="ghost"
                onClick={() =>
                  setSelectedIds(new Set(visibleRules.map((r) => r.id)))
                }
              >
                Select all {visibleRules.length} shown
              </Button>
            </div>
          ) : null}

          {/* AMBIENT, NEVER THE HEADLINE — the improvement brain's chips
          (aidream/services/masterwork_assists/) sit BELOW the work, not in the
          prime slot above it (Arman, 2026-08-18). Renders nothing when the
          producer has nothing to say; a chip only ever expands on click, and
          its verb button navigates back here with ?assist=… which opens the
          right lane seeded (never auto-sent). */}
          <AssistStrip
            surfaceName={MASTERWORK_RULEBOOK_SURFACE}
            filter={(a) => a.entityId === rulebookId}
            className="pt-1"
          />

          <RuleEditorDialog
            open={editorOpen}
            onOpenChange={handleEditorOpenChange}
            sections={rulebook.sections}
            existingIds={existingIds}
            existingRules={rulebook.rules}
            initial={editing}
            defaultSection={editorSection}
            onSave={saveRule}
            surfaceName={MASTERWORK_RULEBOOK_SURFACE_NAME}
            getSurfaceScope={buildSurfaceScope}
            rulebookId={rulebook.id}
            rulebookVersion={rulebook.version}
            organizationId={rulebook.organization_id}
            stagedDraft={stagedRuleDraft}
            draftRevision={draftRevision}
            onDraftChange={setActiveRuleDraft}
            onImproveInstead={
              editing
                ? () => {
                    const target = editing;
                    setEditorOpen(false);
                    openImprove(target);
                  }
                : undefined
            }
          />
          <RuleFeedbackDialog
            open={feedbackTarget !== null}
            onOpenChange={(open) => {
              if (!open) setFeedbackTarget(null);
            }}
            mode={feedbackTarget?.mode ?? "request"}
            vocabulary={vocabulary}
            ruleName={feedbackTarget?.rule.name ?? ""}
            rulebookId={rulebook.id}
            rulebookName={rulebook.name}
            onSubmit={async (text) => {
              if (!feedbackTarget) return;
              try {
                if (feedbackTarget.mode === "reject") {
                  // "Not mine" is a complete answer on its own — one tap. The
                  // reason is stored either way so the interviewer always has
                  // a sentence to act on.
                  await rejectRule(
                    feedbackTarget.rule,
                    text.trim() || NOT_MINE_REASON,
                  );
                } else {
                  await requestChanges(feedbackTarget.rule, text);
                }
              } catch (err) {
                toast.error(
                  err instanceof Error ? err.message : "Could not save",
                );
                throw err;
              }
            }}
          />
          <TriageDraftsDialog
            // Her purpose, her preview choice and the run being rejoined all
            // belong to THIS Rulebook — see `triageSession.ts`.
            // The key is NAMESPACED: these dialogs are siblings in one children
            // array, so a bare record id collides with another sibling's key and
            // React reconciles the whole region by destroying and recreating it
            // — which unmounts an open dialog mid-typing.
            key={`triage-${rulebook.id}`}
            open={triageOpen}
            onOpenChange={setTriageOpen}
            rulebookId={rulebook.id}
            draftCount={draftCount}
            intakeGoal={intakeGoal(rulebook)}
            onApplied={() => void refreshWorkspace()}
          />
          <RuleReviewWizard
            open={wizardOpen}
            onOpenChange={setWizardOpen}
            rulebook={rulebook}
            onApprove={approveRule}
            onReject={rejectRule}
            onImprove={openImprove}
            requeue={wizardRequeue}
            onEdit={(rule) => {
              setWizardOpen(false);
              setEditing(rule);
              setEditorSection(undefined);
              setStagedRuleDraft(undefined);
              setEditorOpen(true);
            }}
          />
          <ImproveRuleDialog
            open={improveOpen}
            onOpenChange={setImproveOpen}
            rule={improveTarget}
            sections={rulebook.sections}
            surfaceName={MASTERWORK_RULEBOOK_SURFACE_NAME}
            rulebookId={rulebook.id}
            organizationId={rulebook.organization_id}
            getSurfaceScope={buildSurfaceScope}
            onLanded={landImprovedRule}
            onDiscard={async (original) => {
              const saved = await upsertRuleWithRetry({
                rulebookId: rulebook.id,
                rule: original,
              });
              setRulebook(saved);
            }}
            onApproveRevised={(revised) => approveRule(revised)}
            onEditRevised={(revised) => {
              setEditing(revised);
              setEditorSection(undefined);
              setStagedRuleDraft(undefined);
              setDraftRevision((revision) => revision + 1);
              setEditorOpen(true);
            }}
          />
          <BulkApproveDialog
            open={bulkConfirm !== null}
            onOpenChange={(next) => {
              if (!next) setBulkConfirm(null);
            }}
            rules={bulkConfirm?.rules ?? []}
            pairs={bulkConfirm?.pairs ?? []}
            readCount={readCount}
            onReadCountChange={setReadCount}
            onConfirm={() => void confirmBulkApprove()}
          />
          <ConfirmDialog
            open={confirmActivate}
            onOpenChange={setConfirmActivate}
            title="Mark this Rulebook as ready?"
            description="It stops showing as a Draft and shows as Active in your list. Nothing else changes — you can keep editing (every save creates a new version), and you can build a Masterwork from it either way."
            confirmLabel="Mark as ready"
            onConfirm={() => void activate()}
          />
          {/* Keyed on the lane for the same reason as the chat-import dialog:
              IngestSourceDialog reads `initialLane` into state at MOUNT, so
              the in-page Approach picker must remount it to land the Expert on
              the exemplar/file lane rather than the instructional default.

              🚨 And it does not mount until the live-run probe has ANSWERED
              (`ingest.ready`). The surface a mount watches is chosen by its
              lane, so mounting one tick early — against a probe that has not
              read storage yet — watches the ingest pointer, and a rejoin on it
              latches `source` over a case that is actually the live run. One
              tick of nothing on a dialog that is closed anyway is the price. */}
          {ingest.ready ? (
          <IngestSourceDialog
            key={`ingest-${activeIngestLane ?? "default"}`}
            open={ingestOpen}
            onOpenChange={setIngestOpen}
            initialLane={activeIngestLane}
            rulebook={rulebook}
            onIngested={() => {
              void getRulebook(rulebook.id)
                .then((r) => {
                  if (r) setRulebook(r);
                })
                .catch(() => undefined);
            }}
            onFollowupSeed={(seed) => {
              setInterviewSeed(seed);
              setInterviewOpen(true);
            }}
          />
          ) : null}
          <ApproachPickerDialog
            open={approachPickerOpen}
            onOpenChange={setApproachPickerOpen}
            onLaunch={launchApproach}
          />
          <BodyOfWorkDialog
            open={corpusOpen}
            onOpenChange={setCorpusOpen}
            rulebook={rulebook}
            onIngested={() => void reloadRulebook()}
          />
          <IngestTimelineDialog
            // The unfolding session, its form and its run pointer all belong to
            // THIS Rulebook — see `durable-run/rulebookDialogSession.ts`.
            // Namespaced for the same reason as TriageDraftsDialog above.
            key={`timeline-${rulebook.id}`}
            open={timelineOpen}
            onOpenChange={setTimelineOpen}
            rulebook={rulebook}
            onIngested={() => void reloadRulebook()}
          />
          <PredictionLedgerDialog
            // The ledger session, its half-typed call and its run pointer all
            // belong to THIS Rulebook — same rule, same remount, as the
            // unfolding dialog above.
            key={`prediction-${rulebook.id}`}
            open={predictionOpen}
            onOpenChange={setPredictionOpen}
            rulebook={rulebook}
            canEdit={canEdit}
            onChanged={() => void reloadRulebook()}
          />
          <DailyDripDialog
            // The drip's settings, its half-typed answer and its run pointer
            // all belong to THIS Rulebook — same rule, same remount, as the
            // ledger dialog above.
            key={`drip-${rulebook.id}`}
            open={dripOpen}
            onOpenChange={setDripOpen}
            rulebook={rulebook}
            canEdit={canEdit}
            onChanged={() => void reloadRulebook()}
          />
          <RedPenDialog
            // The marked-up work, its corrections and its run pointer all
            // belong to THIS Rulebook — same rule, same remount, as the
            // ledger dialog above.
            key={`red-pen-${rulebook.id}`}
            open={redPenOpen}
            onOpenChange={setRedPenOpen}
            rulebook={rulebook}
            onIngested={() => void reloadRulebook()}
          />
          <ShadowInboxDialog
            // The pasted thread, the picked threads and the run pointer all
            // belong to THIS Rulebook — same rule, same remount, as the red-pen
            // dialog above. Sharper here than anywhere else: the staged content
            // is the Expert's real correspondence.
            key={`shadow-inbox-${rulebook.id}`}
            open={shadowInboxOpen}
            onOpenChange={setShadowInboxOpen}
            rulebook={rulebook}
            onIngested={() => void reloadRulebook()}
            onFollowupSeed={(seed) => {
              setInterviewSeed(seed);
              setInterviewOpen(true);
            }}
          />
          {/* Keyed on the lane so `chat_import` and `matrx_conversations` —
              two registry rows, ONE dialog — each open on their own tab. A
              key remount is the idiomatic reset; the dialog reads initialTab
              once, at mount. */}
          <ChatImportDialog
            key={`chat-import-${chatImportTab}`}
            open={chatImportOpen}
            onOpenChange={setChatImportOpen}
            initialTab={chatImportTab}
            rulebook={rulebook}
            onIngested={() => void reloadRulebook()}
            onFollowupSeed={(seed) => {
              setInterviewSeed(seed);
              setInterviewOpen(true);
            }}
          />
          <MeetingScavengerDialog
            key={`meeting-${rulebook.id}`}
            open={meetingOpen}
            onOpenChange={setMeetingOpen}
            rulebook={rulebook}
            onIngested={() => void reloadRulebook()}
            onFollowupSeed={(seed) => setInterviewSeed(seed)}
          />
          <ConductorPanel
            rulebookId={rulebook.id}
            rulebookName={rulebook.name}
            open={conductorOpen}
            onOpenChange={setConductorOpen}
          />
          {canEdit ? (
            <ScoutInterviewPanel
              rulebookId={rulebook.id}
              rulebookName={rulebook.name}
              open={interviewOpen}
              onOpenChange={(open) => {
                setInterviewOpen(open);
                // Closing resets the target so the next plain "Interview me"
                // opens on the chooser, not on whatever was last resumed.
                if (!open) setInterviewTarget({ newNonce: 0 });
              }}
              onRulebookChanged={() => void reloadRulebook()}
              seedText={interviewSeed}
              initialConversationId={interviewTarget.conversationId}
              startNewNonce={interviewTarget.newNonce}
            />
          ) : null}
        </div>
      </NonEditableContextMenu>
    </SurfaceRuntimeProvider>
  );
}
