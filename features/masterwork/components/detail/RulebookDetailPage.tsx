"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
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
  ListTodo,
  MessageCircleQuestion,
  MessageSquareWarning,
  Pencil,
  Stethoscope,
  Plus,
  RefreshCw,
  RotateCcw,
  Quote,
  BrainCircuit,
  Workflow,
} from "lucide-react";
import { toast } from "@/lib/toast";
import { EntityRef } from "@/components/official/entity-ref/EntityRef";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { Input } from "@/components/ui/input";
import LoadingSpinner from "@/components/ui/loading-spinner";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { useAppSelector } from "@/lib/redux/hooks";
import { selectUserId } from "@/lib/redux/selectors/userSelectors";
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
  listMasterworksForRulebook,
  saveRules,
  updateRulebookMeta,
  upsertRuleWithRetry,
} from "../../service";
import {
  applyManualRuleEdit,
  ruleState,
  SEVERITY_LABELS,
  type Masterwork,
  type Rulebook,
  type RulebookRule,
  type RuleSeverity,
  type RuleSourceRef,
} from "../../types";
import { RuleRelations, ruleAnchorId } from "./RuleRelations";
import { BodyOfWorkDialog } from "./BodyOfWorkDialog";
import { ChatImportDialog } from "./ChatImportDialog";
import { IngestSourceDialog } from "./IngestSourceDialog";
import { ApproachPickerDialog } from "@/features/masterwork/browse/ApproachPickerDialog";
import {
  fetchDistillationApproaches,
  type DistillationApproach,
} from "@/features/masterwork/browse/approaches";
import { RulebookInputsSection } from "./RulebookInputsSection";
import { ConductorPanel } from "@/features/masterwork/conduct/ConductorPanel";
import { RulebookVersionHistory } from "./RulebookVersionHistory";
import { WhatsWhatDialog } from "./WhatsWhatDialog";
import { ScoutInterviewPanel } from "./ScoutInterviewPanel";
import { RuleEditorDialog, type RuleEditorResult } from "./RuleEditorDialog";
import {
  RuleFeedbackDialog,
  type RuleFeedbackMode,
} from "./RuleFeedbackDialog";
import { ImproveRuleDialog } from "./ImproveRuleDialog";
import { RuleDecisionActions } from "../../review/RuleDecisionActions";
import { RuleReviewWizard } from "./RuleReviewWizard";
import { computeKpis, RulebookKpiStrip } from "./RulebookKpiStrip";
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
// The Final Checkup window (features/masterwork/checkup/) — its one entry point.
import { useOpenMasterworkCheckupWindow } from "@/features/overlays/openers/masterworkCheckupWindow";
// "Add rule" is a WindowPanel (With AI default + Manually) — never a blocking
// modal. The RuleEditorDialog keeps only EDIT plus agent-staged drafts.
import { useOpenAddRuleWindow } from "@/features/overlays/openers/masterworkAddRuleWindow";
import { useOpenBuildWindow } from "@/features/overlays/openers/masterworkBuildWindow";
import { useOpenMasterworkYourWordsWindow } from "@/features/overlays/openers/masterworkYourWordsWindow";

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
  const s = Math.max(0, Math.round(seconds));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = String(s % 60).padStart(2, "0");
  return h > 0 ? `${h}:${String(m).padStart(2, "0")}:${sec}` : `${m}:${sec}`;
}

function requireRuleDraftInput(
  value: unknown,
  rulebook: Rulebook,
): {
  draft: Partial<RulebookDraftSnapshot>;
  initial: RulebookRule | undefined;
} {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error("Rule draft must be an object.");
  }
  const input = value as Record<string, unknown>;
  if (input.mode !== "new" && input.mode !== "edit") {
    throw new Error('Rule draft mode must be "new" or "edit".');
  }

  const initial =
    input.mode === "edit"
      ? rulebook.rules.find(
          (rule) => rule.id === String(input.rule_id ?? "").trim(),
        )
      : undefined;
  if (input.mode === "edit" && !initial) {
    throw new Error(
      "Edit mode needs a rule_id that exists in the open Rulebook.",
    );
  }

  const draft: Partial<RulebookDraftSnapshot> = {
    mode: input.mode,
    rule_id: initial?.id ?? null,
  };
  for (const key of [
    "name",
    "statement",
    "rationale",
    "detection",
    "quote",
  ] as const) {
    const field = input[key];
    if (field === undefined) continue;
    if (typeof field !== "string") {
      throw new Error(`Rule draft ${key} must be text.`);
    }
    draft[key] = field;
  }
  if (input.severity !== undefined) {
    if (
      input.severity !== "critical" &&
      input.severity !== "major" &&
      input.severity !== "minor"
    ) {
      throw new Error("Rule draft severity must be critical, major, or minor.");
    }
    draft.severity = input.severity;
  }
  if (input.section !== undefined) {
    if (
      typeof input.section !== "string" ||
      !Object.hasOwn(rulebook.sections, input.section)
    ) {
      throw new Error(
        "Rule draft section must be one of the section codes in this Rulebook.",
      );
    }
    draft.section = input.section;
  }
  return { draft, initial };
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
      ? sourceRef.time_range.end != null
        ? `at ${formatClock(sourceRef.time_range.start)}–${formatClock(sourceRef.time_range.end)}`
        : `at ${formatClock(sourceRef.time_range.start)}`
      : null;
  const label =
    sourceRef.note ?? (sourceRef.interview ? "your interview" : "ingested");

  return (
    <div className="space-y-1 text-xs text-muted-foreground">
      <div className="flex flex-wrap items-center gap-x-1.5 gap-y-1">
        <span>From the source:</span>
        {sourceRef.entity ? (
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

function RuleRow({
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
}) {
  const [openRow, setOpenRow] = useState(false);
  const state = ruleState(rule);
  const retired = state === "retired";
  const rejected = state === "rejected";
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
      <div className="flex w-full items-start gap-2 px-3 py-2">
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
              {state === "draft" ? (
                <Badge
                  variant="outline"
                  className="px-1.5 py-0 text-[10px] border-primary/40 text-primary"
                >
                  Draft — needs your approval
                </Badge>
              ) : null}
              {rejected ? (
                <Badge
                  variant="outline"
                  className="px-1.5 py-0 text-[10px] border-destructive/50 text-destructive"
                >
                  Rejected — with the interviewer
                </Badge>
              ) : null}
              {rule.feedback && !rejected ? (
                <Badge
                  variant="outline"
                  className="px-1.5 py-0 text-[10px] border-primary/40 text-primary"
                >
                  Change requested
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
            </div>
            <p className="mt-0.5 text-sm text-muted-foreground">
              {rule.statement}
            </p>
          </div>
        </button>
        {canEdit && state === "draft" ? (
          // The four review verbs come from the ONE shared primitive
          // (features/masterwork/review/RuleDecisionActions) — Approve /
          // Improve / Reject / Edit, never redeclared per surface.
          <RuleDecisionActions
            className="shrink-0 flex-nowrap gap-1"
            size="sm"
            onApprove={onApprove}
            onImprove={onImprove}
            onReject={onReject}
            onEdit={onEdit}
          />
        ) : null}
        {canEdit && rejected ? (
          <Button
            size="sm"
            variant="outline"
            className="h-7 shrink-0"
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
            {rejected ? "Why you rejected it: " : "Your change request: "}
          </span>
          <span className="text-muted-foreground">{rule.feedback}</span>
          <span className="ml-1 text-muted-foreground">
            — the interviewer picks this up on their next turn.
          </span>
        </div>
      ) : null}
      {openRow ? (
        <div className="space-y-2 border-t border-border px-9 py-2 text-sm">
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
          {rule.source_ref ? (
            <RuleProvenance sourceRef={rule.source_ref} />
          ) : null}
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
                  <BrainCircuit className="h-3.5 w-3.5" />
                  Improve
                </Button>
              ) : null}
              {!retired && !rejected ? (
                <Button size="sm" variant="outline" onClick={onRequestChanges}>
                  <MessageSquareWarning className="h-3.5 w-3.5" />
                  {rule.feedback ? "Change the request" : "Request changes"}
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

export function RulebookDetailPage({ rulebookId }: { rulebookId: string }) {
  const [rulebook, setRulebook] = useState<Rulebook | null>(null);
  const [masterworks, setMasterworks] = useState<Masterwork[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<unknown>(null);
  const [search, setSearch] = useState("");
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
  const [ingestOpen, setIngestOpen] = useState(false);
  const [wizardOpen, setWizardOpen] = useState(false);
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
  const [interviewOpen, setInterviewOpen] = useState(
    searchParams.get("interview") === "1",
  );
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
  const [conductorOpen, setConductorOpen] = useState(
    searchParams.get("conduct") === "1",
  );
  // The dump Approach ("Dump everything you have") lands here with ?dump=1 —
  // the Sources panel opens and scrolls into view as the next step.
  const dumpParam = searchParams.get("dump") === "1";
  // The Approach picker's deep link (`platform.approach.intake_query`): choosing
  // the source / exemplar / file Approach must land ON that lane. Before this
  // param existed (2026-08-19) those three enabled Approaches dead-ended on a
  // bare detail page — the mechanical cause of exemplar's zero rules.
  const ingestParam = searchParams.get("ingest");
  const ingestLane =
    ingestParam === "source" || ingestParam === "exemplar" || ingestParam === "file"
      ? ingestParam
      : null;
  useEffect(() => {
    if (ingestLane) setIngestOpen(true);
  }, [ingestLane]);
  // THE APPROACH PICKER (2026-08-20). Every lane below is opened by a query
  // param read ONCE at mount, so the in-page picker cannot reach them by
  // changing the URL. Each param therefore gets a state twin the picker sets;
  // the param stays the deep-link entry and the twin is the in-page one, and
  // `launchApproach` is the ONE place that maps a registry row to a lane.
  const [approachPickerOpen, setApproachPickerOpen] = useState(false);
  const [requestedIngestLane, setRequestedIngestLane] = useState<
    "source" | "exemplar" | "file" | null
  >(null);
  const [dumpRequested, setDumpRequested] = useState(false);
  const [chatImportTab, setChatImportTab] = useState<"upload" | "matrx">(
    searchParams.get("tab") === "matrx" ? "matrx" : "upload",
  );
  /** The dump lane is focused by the deep link OR by the in-page picker. */
  const dumpFocus = dumpParam || dumpRequested;
  const router = useRouter();


  // The body_of_work Approach ("Everything you've published") lands here with
  // ?body_of_work=1 — the corpus dialog IS the next step.
  const [corpusOpen, setCorpusOpen] = useState(
    searchParams.get("body_of_work") === "1",
  );
  // The chat-import Approach ("Import your AI chats") lands here with
  // ?chatImport=1 — the import dialog IS the next step. Full page:
  // /masterwork/[id]/import.
  const [chatImportOpen, setChatImportOpen] = useState(
    searchParams.get("chatImport") === "1",
  );

  /**
   * THE ONE MAP from a `platform.approach` row to the lane it opens on this
   * page. A row's `intake_query` is the same contract the deep links use, so
   * the picker and a pasted URL can never drift apart; `launch_href` covers an
   * Approach whose lane is its own page (the Vision Interview, the Oracle tap).
   *
   * NO DEAD ENDS: an Approach the picker cannot map still goes somewhere — its
   * own canonical deep link on this Rulebook — rather than doing nothing.
   */
  const launchApproach = useCallback(
    (approach: DistillationApproach) => {
      if (approach.launchHref) {
        router.push(approach.launchHref);
        return;
      }
      const q = approach.intakeQuery;
      if (q.interview === "1") {
        setInterviewTarget({ newNonce: Date.now() });
        setInterviewOpen(true);
        return;
      }
      if (q.ingest === "source" || q.ingest === "exemplar" || q.ingest === "file") {
        setRequestedIngestLane(q.ingest);
        setIngestOpen(true);
        return;
      }
      if (q.body_of_work === "1") {
        setCorpusOpen(true);
        return;
      }
      if (q.chatImport === "1") {
        setChatImportTab(q.tab === "matrx" ? "matrx" : "upload");
        setChatImportOpen(true);
        return;
      }
      if (q.dump === "1") {
        setDumpRequested(true);
        return;
      }
      if (q.conduct === "1") {
        setConductorOpen(true);
        return;
      }
      const params = new URLSearchParams(q).toString();
      router.push(`/masterwork/${rulebookId}${params ? `?${params}` : ""}`);
    },
    [router, rulebookId],
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
    if (!assistKey) return;
    let cancelled = false;
    void fetchAssistLaunch(assistKey).then((launch) => {
      if (cancelled || !launch) return;
      if (launch.open === "ingest") {
        setIngestOpen(true);
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
              if (hit && hit.availability !== "coming_soon") launchApproach(hit);
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
  }, [assistKey, launchApproach, openCheckup, rulebookId]);
  const userId = useAppSelector(selectUserId);
  const openAddRule = useOpenAddRuleWindow();
  const openBuild = useOpenBuildWindow();
  const openYourWords = useOpenMasterworkYourWordsWindow();

  const reloadRulebook = useCallback(async () => {
    const r = await getRulebook(rulebookId);
    if (r) setRulebook(r);
  }, [rulebookId]);

  const reloadMasterworks = useCallback(() => {
    void listMasterworksForRulebook(rulebookId)
      .then(setMasterworks)
      .catch(() => undefined);
  }, [rulebookId]);

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
      onBuilt: () => reloadMasterworks(),
      onWindowClose: () => setBuildOpen(false),
    });
  }, [openBuild, rulebookId, reloadMasterworks]);


  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const [r, m] = await Promise.all([
          getRulebook(rulebookId),
          listMasterworksForRulebook(rulebookId).catch(
            () => [] as Masterwork[],
          ),
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

  const existingIds = useMemo(
    () => new Set((rulebook?.rules ?? []).map((r) => r.id)),
    [rulebook?.rules],
  );

  const grouped = useMemo(() => {
    if (!rulebook)
      return [] as { code: string; label: string; rules: RulebookRule[] }[];
    const q = search.trim().toLowerCase();
    const match = (r: RulebookRule) =>
      !q ||
      r.name.toLowerCase().includes(q) ||
      r.statement.toLowerCase().includes(q) ||
      r.id.includes(q);
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
  }, [rulebook, search]);

  const visibleRules = useMemo(
    () => grouped.flatMap((group) => group.rules),
    [grouped],
  );

  const refreshWorkspace = useCallback(async () => {
    const [nextRulebook, nextMasterworks] = await Promise.all([
      getRulebook(rulebookId),
      listMasterworksForRulebook(rulebookId),
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
      masterwork_count: nextMasterworks.length,
    };
  }, [rulebookId]);

  const buildSurfaceScope = useCallback(() => {
    if (!rulebook) {
      throw new Error("The Rulebook surface is still loading.");
    }
    return buildRulebookSurfaceScope({
      rulebook,
      masterworks,
      canEdit,
      searchQuery: search,
      visibleRules,
      activeRule: editing ?? null,
      activeRuleDraft,
      workspaceState: {
        editor_open: editorOpen,
        interview_open: interviewOpen,
        ingest_open: ingestOpen,
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
    masterworks,
    rulebook,
    search,
    visibleRules,
    wizardOpen,
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
                  onSelect: () => setIngestOpen(true),
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

  const persist = useCallback(
    async (next: RulebookRule[]) => {
      if (!rulebook) return;
      try {
        const saved = await saveRules({
          rulebookId: rulebook.id,
          expectedVersion: rulebook.version,
          rules: next,
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
    [rulebook, reloadRulebook],
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
        await persist(next);
        toast.success(`"${rule.name}" approved`);
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
        toast.success(`"${rule.name}" is back in your review queue`);
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

  // "Approve all" means the rules WAITING ON the Expert — never rejected ones
  // (those are the interviewer's queue, and approving them would erase the
  // Expert's own written reasons).
  const approveAllDrafts = useCallback(async () => {
    if (!rulebook) return;
    const next = rulebook.rules.map((r) => {
      if (ruleState(r) !== "draft") return r;
      const { feedback: _feedback, ...rest } = r;
      return { ...rest, draft: false };
    });
    try {
      await persist(next);
      toast.success("All suggested rules approved");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not approve");
    }
  }, [rulebook, persist]);

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
      toast.success(`"${rule.name}" rejected`, {
        description:
          "The interviewer will rewrite it or drop it on their next turn.",
      });
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
      toast.success(`Change request saved for "${rule.name}"`, {
        description: "It is applied on the interviewer's next turn.",
      });
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
  // THE JOURNEY (features/masterwork/journey.ts) — where this Rulebook is in
  // its life, from what this page already holds. No extra read, no endpoint:
  // the Rulebook row (rules + metadata.coherence + metadata.checkup) and the
  // Masterworks it was built into. It sees no runs and says so, so the
  // run-dependent moves stay silent here rather than guessing; the improvement
  // brain, which DOES read runs, raises those as chips below.
  const journey = useMemo(
    () => computeJourney(journeyFactsFromRulebook(rulebook, masterworks)),
    [rulebook, masterworks],
  );
  const draftCount = kpis.drafts;
  const approvedCount = kpis.approved;
  // The Understudy (running-from-minute-one) is rendered as its own card and
  // never counted among the built Masterworks.
  const understudy = masterworks.find((m) => m.understudy) ?? null;
  const builtCount = masterworks.filter((m) => !m.understudy).length;

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
          isOwner: canEdit,
        }}
        extraSections={pageMenuSections}
      >
        <div
          className="mx-auto max-w-4xl space-y-4 px-4 pb-8 sm:px-6"
          data-surface-value="rulebook"
        >
          {/* Rulebook summary */}
          <div className="rounded-lg border border-border bg-card p-4">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2">
                  <BookOpen className="h-4 w-4 text-muted-foreground" />
                  <h2
                    className="truncate text-base font-semibold text-foreground"
                    data-surface-value="rulebook_name"
                  >
                    {rulebook.name}
                  </h2>
                </div>
                {rulebook.description ? (
                  <p
                    className="mt-1 text-sm text-muted-foreground"
                    data-surface-value="rulebook_description"
                  >
                    {rulebook.description}
                  </p>
                ) : null}
                <div className="mt-2 flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                  {rulebook.source.author ? (
                    <span>
                      {rulebook.source.title
                        ? `“${rulebook.source.title}” — `
                        : ""}
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
                </div>
              </div>
              {/* THE ACTION CLASSES (Arman, 2026-08-21). His verdict on the
                  previous row — one primary plus a `More` menu — was that
                  hiding actions under `More` was an agent's fix for "ugly",
                  which is a styling problem, applied to findability, which is
                  not: "These are primary actions. They need to be out, but they
                  just can't be big and ugly." And: "we have all these different
                  actions, and they're different classes of actions… yet we've
                  stuffed them all together."

                  So the actions are split by WHEN THEY HAPPEN, not by how much
                  room they need:
                    • MAKE (here, top-right) — the two ways to turn rules into a
                      working system, named so the difference is legible without
                      opening anything.
                    • CHECK & FINISH (the strip under the KPIs) — what you do
                      once something exists.
                  Every control carries a tooltip that says what it does AND
                  which agent it invokes, because he cannot debug an agent he
                  cannot name (USABILITY-VERDICT-2026-08-21 §7). Menus get
                  tooltips too — the old `More` menu had none. */}
              <div className="flex shrink-0 items-center gap-1.5">
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
                {/* THE ONE CANONICAL MASTERWORK SYSTEM (Arman, 2026-08-18):
                    "the only thing that ever makes a Masterwork is our one
                    single canonical Masterwork system." The Conductor is the
                    NEW path; the template Build is the OLD one and says so on
                    its face rather than hiding in a menu. */}
                {approvedCount > 0 ? (
                  <>
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <Button
                          size="sm"
                          variant="outline"
                          className="h-8"
                          onClick={openBuildWindow}
                        >
                          <Hammer className="h-4 w-4" />
                          Quick build
                        </Button>
                      </TooltipTrigger>
                      <TooltipContent className="max-w-xs">
                        <p>
                          Builds a system straight from your{" "}
                          {approvedCount} approved rules, no questions asked.
                          Fast, and it can only make the two shapes we ship.
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
                          className="h-8"
                          onClick={() => setConductorOpen(true)}
                        >
                          <BrainCircuit className="h-4 w-4" />
                          Build it with me
                        </Button>
                      </TooltipTrigger>
                      <TooltipContent className="max-w-xs">
                        <p>
                          A conversation. It reads your {approvedCount} approved
                          rules, asks about what is still missing, then builds
                          the system with you. Slower, and it can make anything.
                        </p>
                        <p className="mt-1 text-[11px] opacity-70">
                          Agent: masterwork_conductor
                        </p>
                      </TooltipContent>
                    </Tooltip>
                  </>
                ) : null}
              </div>
            </div>
            <div className="mt-3">
              <RulebookKpiStrip
                kpis={kpis}
                journey={journey}
                live={understudy !== null}
              />
            </div>
            {/* CHECK & FINISH — the second action class (Arman, 2026-08-21).
                These are what you do once something EXISTS, so they sit under
                the KPIs rather than beside the build actions. Every one of them
                used to be a row inside `More`, where none of them had a tooltip
                and none of them said what it was. */}
            <div className="mt-2 flex flex-wrap items-center gap-1.5">
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    asChild
                    size="sm"
                    variant="outline"
                    className="h-7"
                  >
                    <Link href={`/masterwork/${rulebook.id}/masterworks`}>
                      <Workflow className="h-3.5 w-3.5" />
                      What you&apos;ve built
                      {builtCount > 0 ? (
                        <span className="text-xs text-muted-foreground">
                          {builtCount}
                        </span>
                      ) : null}
                    </Link>
                  </Button>
                </TooltipTrigger>
                <TooltipContent className="max-w-xs">
                  <p>
                    Every system built from this Rulebook — try one on real
                    work, judge it against your own, or release it.
                  </p>
                </TooltipContent>
              </Tooltip>
              {canEdit && approvedCount > 0 ? (
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Button
                      size="sm"
                      variant="outline"
                      className="h-7"
                      onClick={() => openCheckup({ rulebookId: rulebook.id })}
                    >
                      <Stethoscope className="h-3.5 w-3.5" />
                      Check for what&apos;s missing
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
                      className="h-7"
                      onClick={() => setConfirmActivate(true)}
                    >
                      <CheckCircle2 className="h-3.5 w-3.5" />
                      Mark as ready
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
              <WhatsWhatDialog />
            </div>
            {draftCount > 0 && canEdit ? (
              <div className="mt-2 flex flex-wrap items-center gap-2">
                <Button
                  size="sm"
                  className="h-7"
                  onClick={() => setWizardOpen(true)}
                >
                  <ListTodo className="h-3.5 w-3.5" />
                  Review one by one
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  className="h-7"
                  onClick={() => void approveAllDrafts()}
                >
                  <CheckCircle2 className="h-3.5 w-3.5" />
                  Approve all
                </Button>
                {approvedCount === 0 ? (
                  <p className="text-xs text-muted-foreground">
                    Approved rules are what power a Masterwork — none yet.
                  </p>
                ) : null}
              </div>
            ) : null}
          </div>

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
          <div data-surface-value="understudy">
            <UnderstudyCard
              rulebookId={rulebook.id}
              understudy={understudy}
              approvedCount={approvedCount}
              canEdit={canEdit}
              onCreated={reloadMasterworks}
            />
          </div>

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
          <div className="flex flex-col items-stretch gap-2 sm:flex-row sm:items-center">
            <Input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search rules…"
              className="h-10 max-w-none text-base sm:h-8 sm:max-w-xs sm:text-sm"
              data-surface-value="search_query"
            />
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

          {/* Sections */}
          <div data-surface-value="rules" className="contents">
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
            ) : (
              grouped.map((group) =>
                group.rules.length === 0 && search ? null : (
                  <section key={group.code} className="space-y-4 sm:space-y-2">
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
                    <div className="space-y-1.5">
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
                        />
                      ))}
                    </div>
                  </section>
                ),
              )
            )}
          </div>

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
            ruleName={feedbackTarget?.rule.name ?? ""}
            rulebookId={rulebook.id}
            rulebookName={rulebook.name}
            onSubmit={async (text) => {
              if (!feedbackTarget) return;
              try {
                if (feedbackTarget.mode === "reject") {
                  await rejectRule(feedbackTarget.rule, text);
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
              the exemplar/file lane rather than the instructional default. */}
          <IngestSourceDialog
            key={`ingest-${requestedIngestLane ?? ingestLane ?? "default"}`}
            open={ingestOpen}
            onOpenChange={setIngestOpen}
            initialLane={requestedIngestLane ?? ingestLane}
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
