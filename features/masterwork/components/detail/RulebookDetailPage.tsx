"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import {
  BookOpen,
  CheckCircle2,
  FileUp,
  Hammer,
  ChevronDown,
  ChevronRight,
  ListTodo,
  MessageCircleQuestion,
  MessageSquareWarning,
  Pencil,
  Stethoscope,
  Plus,
  RefreshCw,
  RotateCcw,
  Quote,
  Wand2,
  Workflow,
  XCircle,
} from "lucide-react";
import { toast } from "@/lib/toast";
import { EntityRef } from "@/components/official/entity-ref/EntityRef";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { Input } from "@/components/ui/input";
import LoadingSpinner from "@/components/ui/loading-spinner";
import { useAppSelector } from "@/lib/redux/hooks";
import { selectUserId } from "@/lib/redux/selectors/userSelectors";
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
import { BodyOfWorkDialog } from "./BodyOfWorkDialog";
import { BuildMasterworkDialog } from "./BuildMasterworkDialog";
import { IngestSourceDialog } from "./IngestSourceDialog";
import { RulebookSourcesPanel } from "./RulebookSourcesPanel";
import { InterviewButton, ScoutInterviewPanel } from "./ScoutInterviewPanel";
import { ConversationsSection } from "../../record/ConversationsSection";
import { RuleEditorDialog, type RuleEditorResult } from "./RuleEditorDialog";
import {
  RuleFeedbackDialog,
  type RuleFeedbackMode,
} from "./RuleFeedbackDialog";
import { ImproveRuleDialog } from "./ImproveRuleDialog";
import { RuleReviewWizard } from "./RuleReviewWizard";
import { computeKpis, RulebookKpiStrip } from "./RulebookKpiStrip";
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
      className={`rounded-md border bg-card ${
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
          // The three core review verbs (Arman, 2026-08-17): Approve / Reject
          // / Improve. Icons rely on the Button's own gap — never add an mr-*
          // to a button icon here (icon + gap + margin is the "giant gap"
          // defect Arman flagged).
          <div className="flex shrink-0 gap-1">
            <Button size="sm" className="h-7" onClick={onApprove}>
              <CheckCircle2 className="h-3.5 w-3.5" />
              Approve
            </Button>
            <Button
              size="sm"
              variant="outline"
              className="h-7"
              onClick={onImprove}
            >
              <Wand2 className="h-3.5 w-3.5" />
              Improve
            </Button>
            <Button
              size="sm"
              variant="outline"
              className="h-7 border-destructive/40 text-destructive hover:text-destructive"
              onClick={onReject}
            >
              <XCircle className="h-3.5 w-3.5" />
              Reject
            </Button>
          </div>
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
                  <Wand2 className="h-3.5 w-3.5" />
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
  const [error, setError] = useState<string | null>(null);
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
  // The dump Approach ("Dump everything you have") lands here with ?dump=1 —
  // the Sources panel opens and scrolls into view as the next step.
  const dumpFocus = searchParams.get("dump") === "1";
  // The body_of_work Approach ("Everything you've published") lands here with
  // ?body_of_work=1 — the corpus dialog IS the next step.
  const [corpusOpen, setCorpusOpen] = useState(
    searchParams.get("body_of_work") === "1",
  );
  // Composer seed for the Scout panel — set when a recording distillation
  // reports gaps and the Expert chooses "Interview me about the gaps", or by
  // an improvement-brain assist chip (?assist=<dedupe_key>) whose launch
  // contract stages a seeded interview or opens the ingest dialog. Seeding
  // only pre-fills; the Expert always presses send.
  const [interviewSeed, setInterviewSeed] = useState<string | undefined>();
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
      if (launch.seed) setInterviewSeed(launch.seed);
      setInterviewOpen(true);
    });
    return () => {
      cancelled = true;
    };
  }, [assistKey]);
  const userId = useAppSelector(selectUserId);
  const openCheckup = useOpenMasterworkCheckupWindow();
  const openAddRule = useOpenAddRuleWindow();

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
        if (!r) {
          setError(
            "This Rulebook doesn't exist, or you don't have access to it.",
          );
        } else {
          setRulebook(r);
          setMasterworks(m);
        }
      } catch (err) {
        if (!cancelled)
          setError(
            err instanceof Error ? err.message : "Could not load the Rulebook",
          );
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
                  label: "Interview me",
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
            kind: "link",
            id: "open-record",
            label: "Your words",
            icon: Quote,
            href: `/masterwork/${rulebookId}/record`,
          },
          {
            kind: "link",
            id: "open-masterworks",
            label: "Masterworks",
            icon: Workflow,
            href: `/masterwork/${rulebookId}/masterworks`,
          },
        ],
      },
    ],
    [canEdit, refreshWorkspace, rulebookId],
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
      toast.success("Rulebook activated — it can now power Masterworks.");
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
    return (
      <div className="flex h-full flex-col items-center justify-center gap-3 px-6 text-center">
        <p className="text-sm text-muted-foreground">{error}</p>
        <Button asChild variant="outline" size="sm">
          <Link href="/masterwork/all">Back to Masterwork Studio</Link>
        </Button>
      </div>
    );
  }

  // Only approved rules power a Masterwork — the Build excludes drafts and
  // rejected rules, so the button must not promise what it will refuse.
  const kpis = computeKpis(rulebook);
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
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div className="min-w-0">
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
                  <Badge variant="outline" className="px-1.5 py-0 text-[10px]">
                    v{rulebook.version}
                  </Badge>
                  <Badge variant="outline" className="px-1.5 py-0 text-[10px]">
                    {rulebook.status === "draft"
                      ? "Draft"
                      : rulebook.status === "active"
                        ? "Active"
                        : "Archived"}
                  </Badge>
                </div>
              </div>
              <div className="flex shrink-0 gap-2">
                {canEdit && rulebook.status === "draft" ? (
                  <Button size="sm" onClick={() => setConfirmActivate(true)}>
                    <CheckCircle2 className="h-4 w-4" />
                    Activate
                  </Button>
                ) : null}
                {/* THE FINAL CHECKUP (features/masterwork/checkup/) — the finish
                line. Press it when you feel done and we read everything you
                ever told us back against every rule you have. Owned entirely
                by the checkup window; this is its only entry point. */}
                {canEdit && approvedCount > 0 ? (
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => openCheckup({ rulebookId: rulebook.id })}
                  >
                    <Stethoscope className="h-4 w-4" />
                    Final checkup
                  </Button>
                ) : null}
                {approvedCount > 0 ? (
                  <Button size="sm" onClick={() => setBuildOpen(true)}>
                    <Hammer className="h-4 w-4" />
                    Build a Masterwork
                  </Button>
                ) : null}
                {/* THE RECORD — everything the Expert has said about this
                Rulebook. Their words are the most valuable thing here; they
                are never more than one click away. */}
                <Button asChild size="sm" variant="outline">
                  <Link href={`/masterwork/${rulebook.id}/record`}>
                    <Quote className="h-4 w-4" />
                    Your words
                  </Link>
                </Button>
                <Button asChild size="sm" variant="outline">
                  <Link href={`/masterwork/${rulebook.id}/masterworks`}>
                    <Workflow className="h-4 w-4" />
                    Masterworks
                    {builtCount > 0 ? ` (${builtCount})` : ""}
                  </Link>
                </Button>
              </div>
            </div>
            <div className="mt-3">
              <RulebookKpiStrip kpis={kpis} live={understudy !== null} />
            </div>
            {/* The improvement brain's chips — what to try on the Expert next
            (aidream/services/masterwork_assists/). Renders nothing when the
            producer has nothing to say; a chip only ever expands on click,
            and its verb button navigates back here with ?assist=… which
            opens the right lane seeded (never auto-sent). */}
            <AssistStrip
              surfaceName={MASTERWORK_RULEBOOK_SURFACE}
              filter={(a) => a.entityId === rulebookId}
              className="mt-2"
            />
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

          {/* CONVERSATIONS — first-class on the Rulebook page. Every Scout
          interview the Expert ever had about this Rulebook, with Continue
          (resumes in the panel beside the rules), a new-tab door to /chat, a
          full-page door to /masterwork/[id]/interview, and New interview.
          Born from Arman not being able to find his own 37k-character
          interview: the chooser only ever showed INSIDE the sheet. */}
          <ConversationsSection
            rulebookId={rulebook.id}
            rules={rulebook.rules}
            rulebookVersion={rulebook.version}
            canEdit={canEdit}
            onContinue={(conversationId) => {
              setInterviewTarget({ conversationId, newNonce: 0 });
              setInterviewOpen(true);
            }}
            onStartNew={() => {
              setInterviewTarget({ newNonce: Date.now() });
              setInterviewOpen(true);
            }}
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

          {/* Sources — the dump Approach's capture surface. Attach everything
          (workspace things, uploads, links from external tools), then turn
          the whole pile into draft rules in one durable run. */}
          <RulebookSourcesPanel
            rulebook={rulebook}
            canEdit={canEdit}
            autoOpen={dumpFocus}
            onRulebookChanged={setRulebook}
            onIngested={reloadRulebook}
          />

          {/* Toolbar */}
          <div className="flex items-center gap-2">
            <Input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search rules…"
              className="h-8 max-w-xs"
              data-surface-value="search_query"
            />
            {canEdit ? (
              <>
                <Button
                  size="sm"
                  className="h-8"
                  onClick={() => openAddRuleWindow()}
                >
                  <Plus className="h-4 w-4" />
                  Add rule
                </Button>
                <InterviewButton
                  className="h-8"
                  onClick={() => setInterviewOpen(true)}
                />
                <Button
                  size="sm"
                  variant="outline"
                  className="h-8"
                  onClick={() => setIngestOpen(true)}
                >
                  <FileUp className="h-4 w-4" />
                  From a source
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  className="h-8"
                  onClick={() => setCorpusOpen(true)}
                >
                  <BookOpen className="h-4 w-4" />
                  Your published work
                </Button>
              </>
            ) : null}
          </div>

          {/* Sections */}
          <div data-surface-value="rules" className="contents">
            {rulebook.rules.length === 0 ? (
              <div className="rounded-lg border border-dashed border-border p-8 text-center">
                <p className="text-sm text-muted-foreground">
                  No rules yet. The fastest way to fill this in: let us
                  interview you — talk about how you work, and rules get written
                  down as you speak.
                </p>
                {canEdit ? (
                  <div className="mt-3 flex items-center justify-center gap-2">
                    <Button size="sm" onClick={() => setInterviewOpen(true)}>
                      <MessageCircleQuestion className="h-4 w-4" />
                      Start the interview
                    </Button>
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => openAddRuleWindow()}
                    >
                      <Plus className="h-4 w-4" />
                      Add a rule
                    </Button>
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => setIngestOpen(true)}
                    >
                      <FileUp className="h-4 w-4" />
                      From a document
                    </Button>
                  </div>
                ) : null}
              </div>
            ) : (
              grouped.map((group) =>
                group.rules.length === 0 && search ? null : (
                  <section key={group.code} className="space-y-2">
                    <div className="flex items-center justify-between">
                      <h3 className="text-sm font-semibold text-foreground">
                        {group.label}
                        <span className="ml-2 text-xs font-normal text-muted-foreground">
                          {group.rules.length}{" "}
                          {group.rules.length === 1 ? "rule" : "rules"}
                        </span>
                      </h3>
                      {canEdit && group.code !== "?" ? (
                        <Button
                          size="sm"
                          variant="ghost"
                          className="h-7"
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
            title="Activate this Rulebook?"
            description="An active Rulebook can power Masterworks — working AI checkers built from these rules. You can keep editing after activation; every save creates a new version."
            confirmLabel="Activate"
            onConfirm={() => void activate()}
          />
          <BuildMasterworkDialog
            open={buildOpen}
            onOpenChange={setBuildOpen}
            rulebook={rulebook}
            onBuilt={() => {
              void listMasterworksForRulebook(rulebook.id)
                .then(setMasterworks)
                .catch(() => undefined);
            }}
          />
          <IngestSourceDialog
            open={ingestOpen}
            onOpenChange={setIngestOpen}
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
          <BodyOfWorkDialog
            open={corpusOpen}
            onOpenChange={setCorpusOpen}
            rulebook={rulebook}
            onIngested={() => void reloadRulebook()}
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
