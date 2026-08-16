"use client";

/**
 * PageDraftEditor — the page, as its owner reads it, with the words editable.
 *
 * THE PROMISE THIS KEEPS. "No page without a template" was retired twice; what
 * Arman actually wanted underneath it was *a non-technical way to edit a page's
 * TEXT without knowing HTML* (docs/handoffs/website-factory-vision.md § S4).
 * The P4 record made that possible — `plan.node_artifact` kind `draft` holds the
 * page as structure (h1, intro, sections{heading,intent,body,bullets}, CTA,
 * meta) and the builder RENDERS it. Until now the only surface over it printed
 * `JSON.stringify`, which is exactly the thing our user cannot read.
 *
 * So this reads like a page and edits like a document: no braces, no tags, no
 * field names from the schema. `intent` — what a section is FOR, in the writer's
 * words — is shown quietly beside its heading, because a person editing this
 * page next week needs to know what the section must keep doing; it is a note,
 * never body copy.
 *
 * SAVING IS A REVISION, NEVER A MUTATION. Every save POSTs
 * `/content-plan/nodes/{id}/draft` (aidream `page_pipeline.save_human_draft`),
 * which supersedes the current draft and inserts a new row stamped
 * human-authored. The history of what the page has been is the feature. The
 * client never writes `plan.node_artifact` itself — one writer, on the server.
 *
 * WHAT YOU SEE IS WHAT SHIPS. The content loaded here is resolved by the client
 * mirror of `approved_content` (lib/page-draft.ts): newest of the current draft
 * / review wins, exactly as the builder decides. So a human edit beats an older
 * review — and when it does, the editor SAYS the review is now stale rather
 * than leaving two green steps on the rail.
 *
 * The AI in this surface is the pipeline's own agents, run in place with
 * guidance (`usePageStepRun` — the same seam the rail uses, streaming into the
 * floating run window, persisting a new revision). Nothing here is a second
 * execution path, and nothing runs without a verb-labeled click.
 */

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  AlertTriangle,
  ChevronDown,
  ChevronUp,
  Hammer,
  History,
  Loader2,
  Plus,
  RotateCcw,
  Save,
  Sparkles,
  Trash2,
  User,
  Wand2,
} from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { confirm } from "@/components/dialogs/confirm/ConfirmDialogHost";
import { RunSetWindowController } from "@/features/agents/components/live-run/RunSetDisplay";
import {
  DESCRIPTION_LIMITS,
  TITLE_LIMITS,
  evaluateMetaDescription,
  evaluateMetaTitle,
} from "@/features/marketing/seo/serp/metrics";
import { SerpFieldChips } from "@/features/marketing/seo/serp/SerpValidation";
import { cn } from "@/lib/utils";

import { useNodeArtifacts } from "../data/hooks";
import { usePageDraftSave } from "../hooks/usePageDraftSave";
import { usePageStepRun } from "../hooks/usePageStepRun";
import {
  EMPTY_PAGE_DRAFT,
  draftRevisions,
  draftWordCount,
  isHumanAuthored,
  isReviewStale,
  resolvePageDraft,
  type PageDraft,
  type PageDraftSection,
} from "../lib/page-draft";

/**
 * The guided AI actions offered over content that already exists. Each runs the
 * REVIEW step, because the reviewer is the only page agent that reads the page
 * as it currently stands — including a human's own edits. (Re-running the
 * WRITER would compose a fresh page from the brief and throw the user's words
 * away; that action lives on the rail, where it is labeled as what it is.)
 */
const GUIDED_REVISIONS: {
  key: string;
  label: string;
  explains: string;
  guidance: string;
}[] = [
  {
    key: "check",
    label: "Check the facts",
    explains:
      "Reads this page against its brief and research, tells you what it found in plain language, and fixes what it can.",
    guidance: "",
  },
  {
    key: "tighten",
    label: "Tighten it",
    explains:
      "Says the same thing in fewer words. Nothing is dropped — the meaning and the structure stay.",
    guidance:
      "Tighten the writing throughout: shorter sentences, no filler, no repetition. Keep every section, every heading, and every fact.",
  },
  {
    key: "warmer",
    label: "Make it warmer",
    explains:
      "Rewrites the tone to sound like a person talking to the reader, keeping the same facts and structure.",
    guidance:
      "Rewrite the tone to be warmer and more direct — speak to the reader as a person. Keep every fact, section and heading exactly as they are.",
  },
];

function SectionCard({
  section,
  index,
  total,
  onChange,
  onMove,
  onRemove,
  onRevise,
  reviseBusy,
}: {
  section: PageDraftSection;
  index: number;
  total: number;
  onChange: (next: PageDraftSection) => void;
  onMove: (direction: -1 | 1) => void;
  onRemove: () => void;
  onRevise: () => void;
  reviseBusy: boolean;
}) {
  const bulletsText = section.bullets.join("\n");
  return (
    <div className="rounded-md border border-border bg-card p-2.5">
      <div className="flex items-start gap-1.5">
        <Input
          value={section.heading}
          onChange={(event) =>
            onChange({ ...section, heading: event.target.value })
          }
          placeholder="Section heading"
          aria-label={`Heading for section ${index + 1}`}
          className="h-8 flex-1 border-transparent bg-transparent px-1 text-sm font-semibold hover:border-border focus-visible:border-border"
        />
        <div className="flex shrink-0 items-center gap-0.5">
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="h-8 w-8 p-0"
            disabled={index === 0}
            onClick={() => onMove(-1)}
            aria-label={`Move "${section.heading || "section"}" up`}
            title="Move this section up"
          >
            <ChevronUp className="h-3.5 w-3.5" />
          </Button>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="h-8 w-8 p-0"
            disabled={index === total - 1}
            onClick={() => onMove(1)}
            aria-label={`Move "${section.heading || "section"}" down`}
            title="Move this section down"
          >
            <ChevronDown className="h-3.5 w-3.5" />
          </Button>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="h-8 w-8 p-0"
            disabled={reviseBusy}
            onClick={onRevise}
            aria-label={`Ask AI to revise "${section.heading || "this section"}"`}
            title={`Ask AI to revise this section — it reads the whole page (including your edits), rewrites this part, and saves the result as a new version you can undo.`}
          >
            {reviseBusy ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
            ) : (
              <Wand2 className="h-3.5 w-3.5" />
            )}
          </Button>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="h-8 w-8 p-0 text-muted-foreground hover:text-destructive"
            onClick={onRemove}
            aria-label={`Remove "${section.heading || "section"}"`}
            title="Remove this section"
          >
            <Trash2 className="h-3.5 w-3.5" />
          </Button>
        </div>
      </div>

      {/* The writer's own note about what this section is FOR. Subdued, and
        editable — a person changing the words should be able to correct the
        purpose too, and the next re-render reads it. Never body copy. */}
      <Input
        value={section.intent}
        onChange={(event) =>
          onChange({ ...section, intent: event.target.value })
        }
        placeholder="What is this section for? (a note to whoever edits next)"
        aria-label={`Purpose of section ${index + 1}`}
        className="mt-1 h-7 border-transparent bg-transparent px-1 text-[11px] italic text-muted-foreground hover:border-border focus-visible:border-border"
      />

      <Textarea
        value={section.body}
        autoGrow
        minHeight={72}
        onChange={(event) => onChange({ ...section, body: event.target.value })}
        placeholder="Write this section in plain words. No HTML — the website is built from what you type."
        aria-label={`Text of section ${index + 1}`}
        className="mt-1.5 text-sm"
      />

      <div className="mt-1.5">
        <p className="mb-0.5 text-[11px] text-muted-foreground">
          Bullet points — one per line
        </p>
        <Textarea
          value={bulletsText}
          autoGrow
          minHeight={44}
          onChange={(event) =>
            onChange({
              ...section,
              bullets: event.target.value
                .split("\n")
                .map((line) => line.replace(/^[-*•]\s*/u, ""))
                .filter((line, position, all) =>
                  // Keep interior blanks out, but never fight the user's cursor
                  // on the line they are currently typing.
                  line.trim() !== "" || position === all.length - 1,
                ),
            })
          }
          placeholder="Optional"
          aria-label={`Bullet points for section ${index + 1}`}
          className="text-sm"
        />
      </div>
    </div>
  );
}

function MetaField({
  label,
  value,
  onChange,
  evaluation,
  limits,
  multiline,
  describedBy,
}: {
  label: string;
  value: string;
  onChange: (next: string) => void;
  evaluation: { charCount: number; pixelWidth: number; ok: boolean; issues: string[] };
  limits: { minChars: number; maxChars: number };
  multiline?: boolean;
  describedBy: string;
}) {
  return (
    <div className="min-w-0">
      <div className="flex flex-wrap items-center gap-2">
        <label
          className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground"
          htmlFor={describedBy}
        >
          {label}
        </label>
        <SerpFieldChips
          chars={evaluation.charCount}
          pixels={Math.round(evaluation.pixelWidth)}
          ok={evaluation.ok}
        />
        <span className="text-[11px] text-muted-foreground">
          aim for {limits.minChars}–{limits.maxChars} characters
        </span>
      </div>
      {multiline ? (
        <Textarea
          id={describedBy}
          value={value}
          autoGrow
          minHeight={52}
          onChange={(event) => onChange(event.target.value)}
          className="mt-1 text-sm"
        />
      ) : (
        <Input
          id={describedBy}
          value={value}
          onChange={(event) => onChange(event.target.value)}
          className="mt-1 h-8 text-sm"
        />
      )}
      {evaluation.issues.length > 0 && value.trim() !== "" ? (
        <p className="mt-0.5 text-[11px] text-warning">
          {evaluation.issues[0]}
        </p>
      ) : null}
    </div>
  );
}

export function PageDraftEditor({
  nodeId,
  siteId = null,
  pageLabel,
  onBuild,
  buildBusy = false,
  buildDisabledReason,
  className,
}: {
  nodeId: string;
  siteId?: string | null;
  /** The route or label — shown, and used to label the run set. */
  pageLabel?: string;
  /**
   * Build the website page from these words. Supplied by the host (NodePanel
   * passes `useNodeReality().write`) — the editor opens no second build path.
   */
  onBuild?: () => Promise<unknown> | void;
  buildBusy?: boolean;
  /** Why building isn't possible yet, in the user's words (e.g. no website). */
  buildDisabledReason?: string | null;
  className?: string;
}) {
  const artifacts = useNodeArtifacts(nodeId);
  const rows = useMemo(() => artifacts.data ?? [], [artifacts.data]);
  const resolved = useMemo(() => resolvePageDraft(rows), [rows]);
  const reviewStale = useMemo(() => isReviewStale(rows), [rows]);
  const revisions = useMemo(() => draftRevisions(rows), [rows]);

  const saver = usePageDraftSave({ nodeId, siteId });
  const stepRun = usePageStepRun({ nodeId, siteId, pageLabel });

  const [value, setValue] = useState<PageDraft>(
    resolved?.draft ?? EMPTY_PAGE_DRAFT,
  );
  const [dirty, setDirty] = useState(false);
  const [loadedArtifactId, setLoadedArtifactId] = useState<string | null>(
    resolved?.artifact.id ?? null,
  );
  const [showHistory, setShowHistory] = useState(false);
  const [busyGuidance, setBusyGuidance] = useState<string | null>(null);

  // A NEW revision arriving (an AI step finished, or another tab saved) loads
  // itself — unless the user has unsaved words, which are never overwritten by
  // a background refresh. In that case the banner below offers the choice.
  const incomingId = resolved?.artifact.id ?? null;
  useEffect(() => {
    if (incomingId === loadedArtifactId) return;
    if (dirty) return;
    setValue(resolved?.draft ?? EMPTY_PAGE_DRAFT);
    setLoadedArtifactId(incomingId);
  }, [incomingId, loadedArtifactId, dirty, resolved]);

  const patch = useCallback((next: Partial<PageDraft>) => {
    setValue((current) => ({ ...current, ...next }));
    setDirty(true);
  }, []);

  const setSection = useCallback(
    (index: number, next: PageDraftSection) => {
      setValue((current) => {
        const sections = current.sections.slice();
        sections[index] = next;
        return { ...current, sections };
      });
      setDirty(true);
    },
    [],
  );

  const moveSection = useCallback((index: number, direction: -1 | 1) => {
    setValue((current) => {
      const target = index + direction;
      if (target < 0 || target >= current.sections.length) return current;
      const sections = current.sections.slice();
      const [moved] = sections.splice(index, 1);
      sections.splice(target, 0, moved);
      return { ...current, sections };
    });
    setDirty(true);
  }, []);

  const removeSection = useCallback(
    async (index: number, heading: string) => {
      const ok = await confirm({
        title: "Remove this section?",
        description: `"${heading || "This section"}" will be taken off the page when you save. Every earlier version of the page is kept, so you can always go back.`,
        confirmLabel: "Remove it",
      });
      if (!ok) return;
      setValue((current) => ({
        ...current,
        sections: current.sections.filter((_, position) => position !== index),
      }));
      setDirty(true);
    },
    [],
  );

  const addSection = useCallback(() => {
    setValue((current) => ({
      ...current,
      sections: [
        ...current.sections,
        { heading: "", level: 2, intent: "", body: "", bullets: [] },
      ],
    }));
    setDirty(true);
  }, []);

  const save = useCallback(
    async (note = "") => {
      const ok = await saver.save(value, note);
      if (ok) setDirty(false);
      return ok;
    },
    [saver, value],
  );

  /**
   * Run the reviewer over THESE words. Unsaved edits are saved first — the
   * agent reads the persisted draft, so running with a dirty editor would
   * silently review the previous version and hand back a "correction" that
   * undoes what the user just typed.
   */
  const runGuided = useCallback(
    async (key: string, guidance: string) => {
      if (stepRun.isRunning || saver.isSaving) return;
      setBusyGuidance(key);
      try {
        if (dirty) {
          const saved = await save("Saved before asking AI to revise.");
          if (!saved) return;
        }
        await stepRun.start("p5_review", guidance);
      } finally {
        setBusyGuidance(null);
      }
    },
    [dirty, save, saver.isSaving, stepRun],
  );

  const titleEval = useMemo(
    () => evaluateMetaTitle(value.meta_title),
    [value.meta_title],
  );
  const descriptionEval = useMemo(
    () => evaluateMetaDescription(value.meta_description),
    [value.meta_description],
  );
  const words = useMemo(() => draftWordCount(value), [value]);

  const busy = saver.isSaving || stepRun.isRunning;

  if (artifacts.isLoading) {
    return (
      <p className="text-[11px] text-muted-foreground">
        Loading this page&rsquo;s content&hellip;
      </p>
    );
  }

  if (!resolved && !dirty && loadedArtifactId === null) {
    return (
      <div className="space-y-1.5">
        <p className="text-xs text-muted-foreground">
          This page has no content yet. Run <strong>Write content</strong> on the
          pipeline above and the words will appear here, ready to edit — or start
          typing and save your own.
        </p>
        <Button
          type="button"
          variant="outline"
          size="sm"
          className="h-7 gap-1 text-xs"
          onClick={() => {
            setValue({ ...EMPTY_PAGE_DRAFT, h1: pageLabel ?? "" });
            setDirty(true);
          }}
        >
          <Plus className="h-3 w-3" />
          Write it myself
        </Button>
      </div>
    );
  }

  return (
    <TooltipProvider delayDuration={200}>
      <div className={cn("space-y-2.5", className)}>
        {/* Provenance + state, in one line the user can act on. */}
        <div className="flex flex-wrap items-center gap-1.5 text-[11px] text-muted-foreground">
          {resolved ? (
            <Badge variant="outline" className="gap-1 text-[10px]">
              {resolved.humanAuthored ? (
                <User className="h-3 w-3" aria-hidden />
              ) : (
                <Sparkles className="h-3 w-3" aria-hidden />
              )}
              {resolved.humanAuthored
                ? "Your edit"
                : resolved.source === "review"
                  ? "Reviewed by AI"
                  : "Written by AI"}
            </Badge>
          ) : null}
          <span>{words} words</span>
          {resolved ? (
            <span>
              saved {new Date(resolved.artifact.created_at).toLocaleString()}
            </span>
          ) : null}
          {dirty ? (
            <span className="text-warning">Unsaved changes</span>
          ) : null}
          {revisions.length > 1 ? (
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="h-6 gap-1 px-1.5 text-[11px]"
              onClick={() => setShowHistory((open) => !open)}
            >
              <History className="h-3 w-3" />
              {revisions.length} versions
            </Button>
          ) : null}
        </div>

        {reviewStale ? (
          <p className="flex items-start gap-1.5 rounded-md border border-warning/40 bg-warning/10 p-2 text-[11px] text-warning">
            <AlertTriangle className="mt-0.5 h-3 w-3 shrink-0" aria-hidden />
            <span>
              These words are newer than the last AI review, so the review no
              longer describes what this page says. Use{" "}
              <strong>Check the facts</strong> below to review them again.
            </span>
          </p>
        ) : null}

        {resolved?.source === "review" && resolved.issues.length > 0 ? (
          <div className="rounded-md border border-border bg-muted/40 p-2">
            <p className="text-[11px] font-semibold text-foreground">
              What the review found and fixed
            </p>
            <ul className="mt-1 space-y-0.5">
              {resolved.issues.map((issue, index) => (
                <li key={index} className="text-[11px] text-muted-foreground">
                  <span
                    className={cn(
                      "font-medium",
                      issue.severity === "blocker"
                        ? "text-destructive"
                        : issue.severity === "important"
                          ? "text-warning"
                          : "text-muted-foreground",
                    )}
                  >
                    {issue.section || "Whole page"}:
                  </span>{" "}
                  {issue.problem}
                  {issue.fix ? ` — ${issue.fix}` : ""}
                </li>
              ))}
            </ul>
          </div>
        ) : null}

        {showHistory ? (
          <ul className="space-y-0.5 rounded-md border border-border bg-muted/30 p-2">
            {revisions.map((row) => (
              <li
                key={row.id}
                className="flex flex-wrap items-center gap-1.5 text-[11px] text-muted-foreground"
              >
                <span className="font-medium text-foreground">
                  {new Date(row.created_at).toLocaleString()}
                </span>
                <Badge variant="outline" className="text-[10px]">
                  {isHumanAuthored(row)
                    ? "Person"
                    : row.kind === "review"
                      ? "AI review"
                      : "AI writer"}
                </Badge>
                {row.valid_to === null ? (
                  <span className="text-primary">current</span>
                ) : null}
                {row.summary ? <span>{row.summary}</span> : null}
              </li>
            ))}
          </ul>
        ) : null}

        {/* ── the page ── */}
        <div className="space-y-2">
          <div>
            <label
              className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground"
              htmlFor={`draft-h1-${nodeId}`}
            >
              Page heading
            </label>
            <Input
              id={`draft-h1-${nodeId}`}
              value={value.h1}
              onChange={(event) => patch({ h1: event.target.value })}
              placeholder="The headline a visitor reads first"
              className="mt-1 h-9 text-base font-semibold"
            />
          </div>

          <div>
            <label
              className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground"
              htmlFor={`draft-intro-${nodeId}`}
            >
              Opening
            </label>
            <Textarea
              id={`draft-intro-${nodeId}`}
              value={value.intro}
              autoGrow
              minHeight={64}
              onChange={(event) => patch({ intro: event.target.value })}
              placeholder="The first paragraph."
              className="mt-1 text-sm"
            />
          </div>

          {value.sections.map((section, index) => (
            <SectionCard
              key={index}
              section={section}
              index={index}
              total={value.sections.length}
              onChange={(next) => setSection(index, next)}
              onMove={(direction) => moveSection(index, direction)}
              onRemove={() => void removeSection(index, section.heading)}
              onRevise={() =>
                void runGuided(
                  `section-${index}`,
                  `Focus on the section titled "${section.heading || `#${index + 1}`}". Improve it and leave every other section as it is.`,
                )
              }
              reviseBusy={busyGuidance === `section-${index}`}
            />
          ))}

          <Button
            type="button"
            variant="outline"
            size="sm"
            className="h-7 gap-1 text-xs"
            onClick={addSection}
          >
            <Plus className="h-3 w-3" />
            Add a section
          </Button>

          <div>
            <label
              className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground"
              htmlFor={`draft-cta-${nodeId}`}
            >
              What you want the reader to do
            </label>
            <Textarea
              id={`draft-cta-${nodeId}`}
              value={value.call_to_action}
              autoGrow
              minHeight={44}
              onChange={(event) => patch({ call_to_action: event.target.value })}
              placeholder="e.g. Book a consultation"
              className="mt-1 text-sm"
            />
          </div>

          {/* Search-result text. The limits are the platform's ONE source
            (features/marketing/seo/serp/metrics.ts, mirrored byte-for-byte by
            the scraper) — never a second copy of the numbers. */}
          <div className="space-y-2 rounded-md border border-border bg-muted/30 p-2">
            <p className="text-[11px] text-muted-foreground">
              How this page appears in Google&rsquo;s results
            </p>
            <MetaField
              label="Search title"
              value={value.meta_title}
              onChange={(next) => patch({ meta_title: next })}
              evaluation={titleEval}
              limits={TITLE_LIMITS}
              describedBy={`draft-meta-title-${nodeId}`}
            />
            <MetaField
              label="Search description"
              value={value.meta_description}
              onChange={(next) => patch({ meta_description: next })}
              evaluation={descriptionEval}
              limits={DESCRIPTION_LIMITS}
              multiline
              describedBy={`draft-meta-description-${nodeId}`}
            />
          </div>
        </div>

        {/* ── the actions ── every one verb-labeled, nothing runs on hover. */}
        <div className="flex flex-wrap items-center gap-1.5">
          <Button
            type="button"
            size="sm"
            className="h-7 gap-1 text-xs"
            disabled={!dirty || busy}
            onClick={() => void save()}
          >
            {saver.isSaving ? (
              <Loader2 className="h-3 w-3 animate-spin" />
            ) : (
              <Save className="h-3 w-3" />
            )}
            Save changes
          </Button>

          {dirty ? (
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="h-7 gap-1 text-xs"
              disabled={busy}
              onClick={() => {
                setValue(resolved?.draft ?? EMPTY_PAGE_DRAFT);
                setLoadedArtifactId(resolved?.artifact.id ?? null);
                setDirty(false);
              }}
            >
              <RotateCcw className="h-3 w-3" />
              Discard my changes
            </Button>
          ) : null}

          {onBuild ? (
            <Tooltip>
              <TooltipTrigger asChild>
                <span>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    className="h-7 gap-1 text-xs"
                    disabled={busy || buildBusy || Boolean(buildDisabledReason)}
                    onClick={async () => {
                      if (dirty) {
                        const saved = await save("Saved before building the page.");
                        if (!saved) return;
                      }
                      await onBuild();
                    }}
                  >
                    {buildBusy ? (
                      <Loader2 className="h-3 w-3 animate-spin" />
                    ) : (
                      <Hammer className="h-3 w-3" />
                    )}
                    Build the page
                  </Button>
                </span>
              </TooltipTrigger>
              <TooltipContent side="top" className="max-w-xs text-xs">
                {buildDisabledReason ??
                  "Saves your changes, then builds the website page from these words. It lands as a draft — nothing goes public until you publish it."}
              </TooltipContent>
            </Tooltip>
          ) : null}
        </div>

        <div className="flex flex-wrap items-center gap-1.5">
          {GUIDED_REVISIONS.map((option) => (
            <Tooltip key={option.key}>
              <TooltipTrigger asChild>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="h-7 gap-1 text-xs"
                  disabled={busy}
                  onClick={() => void runGuided(option.key, option.guidance)}
                >
                  {busyGuidance === option.key ? (
                    <Loader2 className="h-3 w-3 animate-spin" />
                  ) : (
                    <Sparkles className="h-3 w-3" />
                  )}
                  {option.label}
                </Button>
              </TooltipTrigger>
              <TooltipContent side="top" className="max-w-xs text-xs">
                {option.explains} Your unsaved changes are saved first, and the
                result arrives as a new version you can undo.
              </TooltipContent>
            </Tooltip>
          ))}
        </div>

        {stepRun.run.status === "running" && stepRun.run.stage ? (
          <p className="text-[11px] text-muted-foreground">
            {stepRun.run.stage}
          </p>
        ) : null}
        {stepRun.run.status === "error" && stepRun.run.error ? (
          <p className="text-[11px] text-destructive">{stepRun.run.error}</p>
        ) : null}
        {saver.state.status === "error" && saver.state.error ? (
          <p className="text-[11px] text-destructive">{saver.state.error}</p>
        ) : null}

        {/* The AI's own output streams in the FLOATING window — never as a
          block above the words the user is editing (THE FLOATING LAW). */}
        <RunSetWindowController
          setKey={stepRun.runSetKey}
          instanceId={`page-draft:${nodeId}`}
          label="Page content"
          active={stepRun.isRunning}
        />
      </div>
    </TooltipProvider>
  );
}
