"use client";

import { useEffect, useState } from "react";
import {
  AlertTriangle,
  Archive,
  CheckCircle2,
  ClipboardCheck,
  ExternalLink,
  MessageSquareWarning,
  RefreshCw,
  Undo2,
} from "lucide-react";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { SearchInput } from "@/components/official/SearchInput";
import { CopyButtons } from "@/components/agent-copy/CopyButtons";
import { toast } from "@/lib/toast";
import { SurfaceRuntimeProvider } from "@/features/surfaces/runtime/SurfaceRuntimeContext";
import {
  ADMIN_AGENT_REVIEW_SURFACE_NAME,
  createAdminAgentReviewScope,
} from "@/features/surfaces/manifests/admin-agent-review.manifest";
import {
  loadReviewQueue,
  updateReviewQueueRow,
} from "@/features/admin/agent-review/service";
import { AgentReviewWriteTargets } from "@/features/admin/agent-review/components/AgentReviewWriteTargets";
import {
  REVIEW_LANES,
  REVIEW_LANE_LABELS,
  REVIEW_TOOLS,
  REVIEW_TOOL_LABELS,
  metadataWithReviewTriage,
  parseReviewMetadata,
  suggestReviewTriage,
  type ReviewLane,
  type ReviewTool,
} from "@/features/admin/agent-review/triage";
import {
  REVIEW_STATUS_LABELS,
  isReviewStatus,
  type ReviewQueueRow,
  type ReviewQueueUpdate,
  type ReviewStatus,
} from "@/features/admin/agent-review/types";

type LaneFilter = "all" | "unclassified" | ReviewLane;
type ToolFilter = "all" | ReviewTool;

const STATUS_BADGE_CLASS: Record<ReviewStatus, string> = {
  pending: "bg-amber-500/15 text-amber-700 dark:text-amber-300",
  changes_requested: "bg-red-500/15 text-red-700 dark:text-red-300",
  approved: "bg-emerald-500/15 text-emerald-700 dark:text-emerald-300",
  archived: "bg-muted text-muted-foreground",
};

const LANE_BADGE_CLASS: Record<ReviewLane, string> = {
  browser_ui: "bg-sky-500/15 text-sky-700 dark:text-sky-300",
  code_only: "bg-slate-500/15 text-slate-700 dark:text-slate-300",
  database_data: "bg-violet-500/15 text-violet-700 dark:text-violet-300",
  backend_api: "bg-indigo-500/15 text-indigo-700 dark:text-indigo-300",
  deployment: "bg-orange-500/15 text-orange-700 dark:text-orange-300",
  cross_system: "bg-cyan-500/15 text-cyan-700 dark:text-cyan-300",
  human_required: "bg-fuchsia-500/15 text-fuchsia-700 dark:text-fuchsia-300",
};

const SECTION_ORDER: { status: ReviewStatus; heading: string }[] = [
  { status: "pending", heading: "Needs review" },
  { status: "changes_requested", heading: "Repair backlog" },
  { status: "approved", heading: "Approved — waiting for wrap-up" },
];

function ageLabel(iso: string): string {
  const days = Math.floor((Date.now() - new Date(iso).getTime()) / 86_400_000);
  if (days <= 0) return "today";
  if (days === 1) return "1 day ago";
  return `${days} days ago`;
}

function isLaneFilter(value: string): value is LaneFilter {
  return (
    value === "all" ||
    value === "unclassified" ||
    REVIEW_LANES.some((lane) => lane === value)
  );
}

function isToolFilter(value: string): value is ToolFilter {
  return value === "all" || REVIEW_TOOLS.some((tool) => tool === value);
}

function rowHumanText(row: ReviewQueueRow, feedback: string): string {
  const metadata = parseReviewMetadata(row.metadata);
  const triage = metadata.state === "ready" ? metadata.triage : null;
  return [
    `Review item: ${row.title}`,
    `URL: ${row.url}`,
    `Status: ${isReviewStatus(row.status) ? REVIEW_STATUS_LABELS[row.status] : row.status}`,
    `Source: ${row.source}`,
    triage
      ? `Primary lane: ${REVIEW_LANE_LABELS[triage.lane]}`
      : "Primary lane: Unclassified",
    triage
      ? `Required tools: ${triage.required_tools.map((tool) => REVIEW_TOOL_LABELS[tool]).join(", ")}`
      : null,
    triage
      ? `Assignment: ${triage.assignment.state} (${triage.assignment.mode})`
      : null,
    `Instructions: ${row.instructions}`,
    feedback ? `Feedback: ${feedback}` : null,
  ]
    .filter((value): value is string => Boolean(value))
    .join("\n");
}

function ReviewItemCard({
  row,
  draft,
  onDraftChange,
  onDraftCleared,
  onChanged,
}: {
  row: ReviewQueueRow;
  /** Unsaved editor text for this row, or undefined when it matches the saved
   * value. Owned by the page so the surface can publish it (and an agent's
   * `review_feedback_draft` can stage into it). */
  draft: string | undefined;
  onDraftChange: (rowId: string, feedback: string) => void;
  onDraftCleared: (rowId: string) => void;
  onChanged: () => Promise<unknown>;
}) {
  const feedback = draft ?? row.feedback ?? "";
  const setFeedback = (next: string) => onDraftChange(row.id, next);
  const [saving, setSaving] = useState(false);
  const metadata = parseReviewMetadata(row.metadata);
  const triage = metadata.state === "ready" ? metadata.triage : null;
  const status = isReviewStatus(row.status) ? row.status : null;
  const isArchived = status === "archived";

  async function update(
    patch: ReviewQueueUpdate,
    successMessage: string,
  ): Promise<boolean> {
    setSaving(true);
    try {
      await updateReviewQueueRow(row.id, patch);
      toast.success(successMessage);
      await onChanged();
      return true;
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Update failed");
      return false;
    } finally {
      setSaving(false);
    }
  }

  function saveFeedback(nextStatus?: ReviewStatus) {
    const trimmed = feedback.trim();
    // Once the text IS the saved value it is no longer a draft — drop it on
    // success so the editor falls through to the reloaded row.
    void update(
      {
        feedback: trimmed || null,
        feedback_at: trimmed ? new Date().toISOString() : null,
        ...(nextStatus ? { status: nextStatus } : {}),
      },
      nextStatus
        ? `Saved — ${REVIEW_STATUS_LABELS[nextStatus]}`
        : "Feedback saved",
    ).then((saved) => {
      if (saved) onDraftCleared(row.id);
    });
  }

  function applySuggestedTriage() {
    try {
      const nextMetadata = metadataWithReviewTriage(
        row.metadata,
        suggestReviewTriage(row),
      );
      void update(
        { metadata: nextMetadata },
        metadata.state === "invalid" ? "Triage repaired" : "Triage applied",
      );
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Triage failed");
    }
  }

  const currentFeedback = feedback.trim() || row.feedback || "";

  return (
    <Accordion
      type="single"
      collapsible
      className="rounded-lg border border-border bg-card"
    >
      <AccordionItem value={row.id} className="border-0">
        <div className="flex min-w-0 items-start gap-1 pr-1.5">
          <AccordionTrigger className="min-w-0 flex-1 gap-2 px-3 py-2.5 text-left hover:no-underline">
            <div className="min-w-0 flex-1 space-y-1.5">
              <div className="flex min-w-0 flex-wrap items-center gap-1.5">
                <Badge
                  className={
                    status
                      ? STATUS_BADGE_CLASS[status]
                      : "bg-red-500/15 text-red-700"
                  }
                >
                  {status
                    ? REVIEW_STATUS_LABELS[status]
                    : `Invalid status: ${row.status}`}
                </Badge>
                {triage ? (
                  <Badge className={LANE_BADGE_CLASS[triage.lane]}>
                    {REVIEW_LANE_LABELS[triage.lane]}
                  </Badge>
                ) : (
                  <Badge
                    variant="outline"
                    className="border-amber-500/50 text-amber-700 dark:text-amber-300"
                  >
                    {metadata.state === "invalid"
                      ? "Invalid triage"
                      : "Unclassified"}
                  </Badge>
                )}
                {triage?.priority === "high" ||
                triage?.priority === "critical" ? (
                  <Badge
                    variant="outline"
                    className="border-red-500/40 text-red-700 dark:text-red-300"
                  >
                    {triage.priority}
                  </Badge>
                ) : null}
                <span className="text-xs font-normal text-muted-foreground">
                  {row.source} · {ageLabel(row.created_at)}
                </span>
              </div>
              <span className="block line-clamp-2 text-sm font-medium text-foreground">
                {row.title}
              </span>
              {triage ? (
                <span className="block truncate text-xs font-normal text-muted-foreground">
                  {triage.required_tools
                    .map((tool) => REVIEW_TOOL_LABELS[tool])
                    .join(" · ")}
                  {triage.assignment.owner
                    ? ` · ${triage.assignment.owner}`
                    : ` · ${triage.assignment.state}`}
                </span>
              ) : null}
            </div>
          </AccordionTrigger>
          <Button
            asChild
            variant="ghost"
            size="icon"
            className="mt-1.5 h-10 w-10 shrink-0"
          >
            <a
              href={row.url}
              target="_blank"
              rel="noopener noreferrer"
              aria-label={`Open ${row.title} in a new tab`}
            >
              <ExternalLink className="h-4 w-4" />
            </a>
          </Button>
        </div>

        <AccordionContent className="px-3 pb-3">
          <div className="space-y-3 border-t border-border pt-3">
            {metadata.state !== "ready" ? (
              <div className="flex flex-col gap-2 rounded-md border border-amber-500/30 bg-amber-500/10 p-2.5 text-sm sm:flex-row sm:items-center">
                <div className="flex min-w-0 items-start gap-2 text-amber-800 dark:text-amber-200">
                  <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
                  <span>
                    {metadata.state === "invalid"
                      ? `Stored triage is invalid: ${metadata.issue}`
                      : "This legacy row has no routing metadata."}
                  </span>
                </div>
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  className="min-h-9 shrink-0 sm:ml-auto"
                  disabled={saving}
                  onClick={applySuggestedTriage}
                >
                  {metadata.state === "invalid"
                    ? "Repair triage"
                    : "Apply suggested triage"}
                </Button>
              </div>
            ) : null}

            <div>
              <h3 className="mb-1 text-xs font-medium uppercase tracking-wide text-muted-foreground">
                Review instructions
              </h3>
              <p className="whitespace-pre-wrap text-sm text-foreground">
                {row.instructions}
              </p>
            </div>

            {row.feedback && isArchived ? (
              <div>
                <h3 className="mb-1 text-xs font-medium uppercase tracking-wide text-muted-foreground">
                  Feedback
                </h3>
                <p className="whitespace-pre-wrap text-sm text-foreground">
                  {row.feedback}
                </p>
              </div>
            ) : null}

            {!isArchived ? (
              <div className="space-y-2">
                <Textarea
                  value={feedback}
                  onChange={(event) => setFeedback(event.target.value)}
                  placeholder="Feedback for the repair agent…"
                  aria-label={`Feedback for ${row.title}`}
                  className="min-h-24 text-sm"
                />
                <div className="flex flex-wrap items-center gap-2">
                  <Button
                    size="sm"
                    variant="secondary"
                    className="min-h-9"
                    disabled={saving}
                    onClick={() => saveFeedback()}
                  >
                    Save feedback
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    className="min-h-9 gap-1 text-red-700 dark:text-red-300"
                    disabled={saving}
                    onClick={() => saveFeedback("changes_requested")}
                  >
                    <MessageSquareWarning className="h-3.5 w-3.5" />
                    Request changes
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    className="min-h-9 gap-1 text-emerald-700 dark:text-emerald-300"
                    disabled={saving}
                    onClick={() => saveFeedback("approved")}
                  >
                    <CheckCircle2 className="h-3.5 w-3.5" />
                    Approve
                  </Button>
                  <Button
                    size="sm"
                    variant="ghost"
                    className="min-h-9 gap-1 text-muted-foreground"
                    disabled={saving}
                    onClick={() =>
                      void update({ status: "archived" }, "Archived")
                    }
                  >
                    <Archive className="h-3.5 w-3.5" />
                    Archive
                  </Button>
                  {row.feedback_at ? (
                    <span className="text-xs text-muted-foreground sm:ml-auto">
                      feedback {ageLabel(row.feedback_at)}
                    </span>
                  ) : null}
                </div>
              </div>
            ) : (
              <Button
                size="sm"
                variant="ghost"
                className="min-h-9 gap-1"
                disabled={saving}
                onClick={() =>
                  void update({ status: "pending" }, "Restored to queue")
                }
              >
                <Undo2 className="h-3.5 w-3.5" />
                Restore to queue
              </Button>
            )}

            <CopyButtons
              label={`Review item ${row.title}`}
              human={() => rowHumanText(row, currentFeedback)}
              agent={() => ({
                kind: "agent-review-item",
                location: "Admin — Agent Repair Board",
                description:
                  "Act on the feedback using metadata.triage for routing and verification. Claim the row before work, then set it back to pending for re-review or archive it after approval.",
                data: { ...row, feedback: currentFeedback || row.feedback },
              })}
            />
          </div>
        </AccordionContent>
      </AccordionItem>
    </Accordion>
  );
}

export default function AgentReviewClient() {
  const [rows, setRows] = useState<ReviewQueueRow[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [showArchived, setShowArchived] = useState(false);
  const [search, setSearch] = useState("");
  const [sourceFilter, setSourceFilter] = useState("all");
  const [laneFilter, setLaneFilter] = useState<LaneFilter>("all");
  const [toolFilter, setToolFilter] = useState<ToolFilter>("all");
  /**
   * Unsaved feedback-editor text by row id. Lives here rather than in each
   * card so the surface can publish it (`feedback_drafts`) and the
   * `review_feedback_draft` write target can stage into the very buffer the
   * admin types into. A row with no entry shows its saved feedback.
   */
  const [feedbackDrafts, setFeedbackDrafts] = useState<Record<string, string>>(
    {},
  );

  function setFeedbackDraft(rowId: string, feedback: string) {
    setFeedbackDrafts((current) => ({ ...current, [rowId]: feedback }));
  }

  function clearFeedbackDraft(rowId: string) {
    setFeedbackDrafts((current) => {
      if (!(rowId in current)) return current;
      const next = { ...current };
      delete next[rowId];
      return next;
    });
  }

  /** Reload the queue, resolving with the rows just read so a caller can
   * verify what actually landed (see `AgentReviewWriteTargets`). */
  async function refresh(): Promise<ReviewQueueRow[]> {
    try {
      const data = await loadReviewQueue();
      setRows(data);
      setError(null);
      return data;
    } catch (loadError) {
      setError(
        loadError instanceof Error
          ? loadError.message
          : "Failed to load review queue",
      );
      setRows([]);
      return [];
    }
  }

  useEffect(() => {
    let active = true;
    async function initialLoad() {
      try {
        const data = await loadReviewQueue();
        if (!active) return;
        setRows(data);
        setError(null);
      } catch (loadError) {
        if (!active) return;
        setError(
          loadError instanceof Error
            ? loadError.message
            : "Failed to load review queue",
        );
        setRows([]);
      }
    }
    void initialLoad();
    return () => {
      active = false;
    };
  }, []);

  const allRows = rows ?? [];
  const sources = Array.from(new Set(allRows.map((row) => row.source))).sort();
  const repairRows = allRows.filter(
    (row) => row.status === "changes_requested",
  );
  const unclassifiedRepairCount = repairRows.filter(
    (row) => parseReviewMetadata(row.metadata).state !== "ready",
  ).length;
  const laneCounts = new Map<ReviewLane, number>();
  for (const lane of REVIEW_LANES) laneCounts.set(lane, 0);
  const toolCounts = new Map<ReviewTool, number>();
  for (const tool of REVIEW_TOOLS) toolCounts.set(tool, 0);
  for (const row of repairRows) {
    const metadata = parseReviewMetadata(row.metadata);
    if (metadata.state === "ready") {
      const { triage } = metadata;
      laneCounts.set(triage.lane, (laneCounts.get(triage.lane) ?? 0) + 1);
      for (const tool of triage.required_tools) {
        toolCounts.set(tool, (toolCounts.get(tool) ?? 0) + 1);
      }
    }
  }
  const repairLaneCounts = Object.fromEntries(
    REVIEW_LANES.map((lane) => [lane, laneCounts.get(lane) ?? 0]),
  );
  const repairToolCounts = Object.fromEntries(
    REVIEW_TOOLS.map((tool) => [tool, toolCounts.get(tool) ?? 0]),
  );

  const normalizedSearch = search.trim().toLowerCase();
  const filteredRows = allRows.filter((row) => {
    const metadata = parseReviewMetadata(row.metadata);
    const triage = metadata.state === "ready" ? metadata.triage : null;
    if (sourceFilter !== "all" && row.source !== sourceFilter) return false;
    if (laneFilter === "unclassified" && triage) return false;
    if (
      laneFilter !== "all" &&
      laneFilter !== "unclassified" &&
      triage?.lane !== laneFilter
    ) {
      return false;
    }
    if (toolFilter !== "all" && !triage?.required_tools.includes(toolFilter))
      return false;
    if (!normalizedSearch) return true;
    return [row.title, row.url, row.instructions, row.feedback, row.source]
      .filter((value): value is string => Boolean(value))
      .some((value) => value.toLowerCase().includes(normalizedSearch));
  });

  const grouped = new Map<ReviewStatus, ReviewQueueRow[]>();
  for (const row of filteredRows) {
    if (!isReviewStatus(row.status)) continue;
    const list = grouped.get(row.status) ?? [];
    list.push(row);
    grouped.set(row.status, list);
  }
  const archived = grouped.get("archived") ?? [];

  // Only genuinely UNSAVED text, and only for rows still loaded — a draft that
  // now matches what is stored is not pending anything.
  const unsavedFeedbackDrafts = Object.fromEntries(
    allRows.flatMap((row) => {
      const draft = feedbackDrafts[row.id];
      if (draft === undefined || draft === (row.feedback ?? "")) return [];
      return [[row.id, draft] as [string, string]];
    }),
  );

  const getSurfaceScope = () =>
    createAdminAgentReviewScope({
      queue_row_count: allRows.length,
      pending_count: allRows.filter((row) => row.status === "pending").length,
      changes_requested_count: repairRows.length,
      approved_count: allRows.filter((row) => row.status === "approved").length,
      archived_count: allRows.filter((row) => row.status === "archived").length,
      unclassified_count: allRows.filter(
        (row) => parseReviewMetadata(row.metadata).state !== "ready",
      ).length,
      repair_lane_counts: repairLaneCounts,
      repair_tool_counts: repairToolCounts,
      show_archived: showArchived,
      feedback_drafts: unsavedFeedbackDrafts,
      queue_sample: allRows.slice(0, 20).flatMap((row) => {
        if (!isReviewStatus(row.status)) return [];
        const metadata = parseReviewMetadata(row.metadata);
        return [
          {
            id: row.id,
            title: row.title,
            url: row.url,
            status: row.status,
            source: row.source,
            instructions: row.instructions,
            feedback: row.feedback,
            created_at: row.created_at,
            triage: metadata.state === "ready" ? metadata.triage : null,
          },
        ];
      }),
      queue_load_error: error ?? undefined,
    });

  return (
    <SurfaceRuntimeProvider
      surfaceName={ADMIN_AGENT_REVIEW_SURFACE_NAME}
      getScope={getSurfaceScope}
      isEditable={false}
    >
      <AgentReviewWriteTargets
        rows={rows}
        setFeedbackDraft={setFeedbackDraft}
        refresh={refresh}
      />
      <div className="flex h-[calc(100dvh-2.5rem)] flex-col overflow-hidden">
        <header className="shrink-0 border-b border-border bg-background/95 px-3 py-3 backdrop-blur sm:px-4">
          <div className="flex min-w-0 items-center gap-2">
            <ClipboardCheck className="h-5 w-5 shrink-0 text-muted-foreground" />
            <div className="min-w-0">
              <h1 className="text-base font-semibold text-foreground sm:text-lg">
                Agent Repair Board
              </h1>
              <p className="hidden text-xs text-muted-foreground sm:block">
                Route reviewed work by specialty, tool access, ownership, and
                verification state.
              </p>
            </div>
            <Button
              variant="ghost"
              size="sm"
              className="ml-auto min-h-10 gap-1 sm:min-h-9"
              onClick={() => void refresh()}
            >
              <RefreshCw className="h-3.5 w-3.5" />
              <span className="hidden sm:inline">Refresh</span>
            </Button>
          </div>

          <div className="mt-3 flex gap-2 overflow-x-auto pb-1">
            <button
              type="button"
              className="min-h-14 min-w-28 rounded-md border border-border bg-card px-2.5 py-2 text-left transition-colors hover:bg-accent"
              onClick={() => setLaneFilter("all")}
            >
              <span className="block text-lg font-semibold text-foreground">
                {repairRows.length}
              </span>
              <span className="block text-xs text-muted-foreground">
                All repairs
              </span>
            </button>
            {REVIEW_LANES.map((lane) => (
              <button
                key={lane}
                type="button"
                className="min-h-14 min-w-28 rounded-md border border-border bg-card px-2.5 py-2 text-left transition-colors hover:bg-accent"
                onClick={() => setLaneFilter(lane)}
              >
                <span className="block text-lg font-semibold text-foreground">
                  {laneCounts.get(lane) ?? 0}
                </span>
                <span className="block truncate text-xs text-muted-foreground">
                  {REVIEW_LANE_LABELS[lane]}
                </span>
              </button>
            ))}
          </div>

          <div className="mt-3 grid grid-cols-2 gap-2 md:grid-cols-[minmax(14rem,1fr)_12rem_12rem_12rem]">
            <SearchInput
              value={search}
              onValueChange={setSearch}
              placeholder="Search title, route, instructions, or feedback"
              aria-label="Search repair board"
              className="col-span-2 md:col-span-1"
            />
            <Select value={sourceFilter} onValueChange={setSourceFilter}>
              <SelectTrigger aria-label="Filter by source" className="h-9">
                <SelectValue placeholder="All repositories" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All repositories</SelectItem>
                {sources.map((source) => (
                  <SelectItem key={source} value={source}>
                    {source}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Select
              value={laneFilter}
              onValueChange={(value) => {
                if (isLaneFilter(value)) setLaneFilter(value);
              }}
            >
              <SelectTrigger
                aria-label="Filter by primary lane"
                className="h-9"
              >
                <SelectValue placeholder="All lanes" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All lanes</SelectItem>
                <SelectItem value="unclassified">
                  Unclassified ({unclassifiedRepairCount})
                </SelectItem>
                {REVIEW_LANES.map((lane) => (
                  <SelectItem key={lane} value={lane}>
                    {REVIEW_LANE_LABELS[lane]}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Select
              value={toolFilter}
              onValueChange={(value) => {
                if (isToolFilter(value)) setToolFilter(value);
              }}
            >
              <SelectTrigger
                aria-label="Filter by required tool"
                className="col-span-2 h-9 md:col-span-1"
              >
                <SelectValue placeholder="All tools" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All tools</SelectItem>
                {REVIEW_TOOLS.map((tool) => (
                  <SelectItem key={tool} value={tool}>
                    {REVIEW_TOOL_LABELS[tool]}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </header>

        <div className="min-h-0 flex-1 overflow-y-auto px-3 py-4 sm:px-4">
          <div className="space-y-5">
            {error ? (
              <div className="rounded-md border border-red-500/30 bg-red-500/10 p-3 text-sm text-red-700 dark:text-red-300">
                {error}
              </div>
            ) : null}

            {rows === null ? (
              <div className="space-y-2">
                {[0, 1, 2].map((index) => (
                  <div
                    key={index}
                    className="h-20 animate-pulse rounded-lg bg-muted"
                  />
                ))}
              </div>
            ) : null}

            {rows !== null
              ? SECTION_ORDER.map(({ status, heading }) => {
                  const items = grouped.get(status) ?? [];
                  if (items.length === 0) return null;
                  return (
                    <section
                      key={status}
                      className="space-y-2"
                      aria-labelledby={`review-${status}`}
                    >
                      <h2
                        id={`review-${status}`}
                        className="text-sm font-medium text-muted-foreground"
                      >
                        {heading} ({items.length})
                      </h2>
                      {items.map((row) => (
                        <ReviewItemCard
                          key={row.id}
                          row={row}
                          draft={feedbackDrafts[row.id]}
                          onDraftChange={setFeedbackDraft}
                          onDraftCleared={clearFeedbackDraft}
                          onChanged={refresh}
                        />
                      ))}
                    </section>
                  );
                })
              : null}

            {rows !== null &&
            filteredRows.filter((row) => row.status !== "archived").length ===
              0 ? (
              <div className="rounded-lg border border-dashed border-border p-8 text-center text-sm text-muted-foreground">
                No active items match these filters.
              </div>
            ) : null}

            {rows !== null && archived.length > 0 ? (
              <section className="space-y-2">
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  className="min-h-9"
                  onClick={() => setShowArchived((visible) => !visible)}
                >
                  {showArchived ? "Hide" : "Show"} archived ({archived.length})
                </Button>
                {showArchived
                  ? archived.map((row) => (
                      <ReviewItemCard
                        key={row.id}
                        row={row}
                        draft={feedbackDrafts[row.id]}
                        onDraftChange={setFeedbackDraft}
                        onDraftCleared={clearFeedbackDraft}
                        onChanged={refresh}
                      />
                    ))
                  : null}
              </section>
            ) : null}
          </div>
        </div>
      </div>
    </SurfaceRuntimeProvider>
  );
}
