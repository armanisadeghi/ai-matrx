"use client";

/**
 * PlanToolbar — the workbench's ONE chrome row (Arman ruling, 2026-08-17).
 *
 * Replaces four stacked full-width rows (copy row, generate bar, website bar,
 * assist-chip row) with a single dense wrap row. The rules it exists to keep:
 * no row exists to hold one control; buttons are icons with short labels; a
 * button is status AND action (Live disabled = "nothing is published", not
 * decoration); every count shown is backed by the same reads the old bars
 * used — nothing here invents state.
 *
 * Layout: identity + honest KPIs on the left, transient run narration in the
 * middle (generate / bulk-deepen progress replaces the KPI text, never adds a
 * row), assist chips inline, one action cluster on the right.
 */
import { useState } from "react";
import { ExternalLink, Loader2, PenLine, BrainCircuit, X } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { Textarea } from "@/components/ui/textarea";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";

import type {
  BulkDeepenState,
  PlanAiRunState,
} from "../hooks/useContentPlanAi";
import type { CmsPageMapEntry } from "../setup/bridge";
import type { CmsLink } from "../setup/readiness";
import { AgentPayloadButton } from "./AgentPayloadSheet";
import { ResearchTopicSelect } from "./ResearchTopicSelect";

/** A small icon button whose disabled state IS information. */
function StatusActionButton({
  icon,
  label,
  onClick,
  disabled,
  disabledReason,
  enabledReason,
}: {
  icon: React.ReactNode;
  label: string;
  onClick: () => void;
  disabled: boolean;
  /** Why it's off — shown as tooltip so the OFF state teaches, never confuses. */
  disabledReason: string;
  enabledReason: string;
}) {
  const button = (
    <Button
      variant="outline"
      size="sm"
      className="h-6 gap-1 px-2 text-xs"
      disabled={disabled}
      onClick={onClick}
    >
      {icon}
      {label}
    </Button>
  );
  return (
    <Tooltip>
      {/* A disabled button swallows pointer events — wrap so the tooltip
          still answers "why can't I?". */}
      <TooltipTrigger asChild>
        <span className="inline-flex">{button}</span>
      </TooltipTrigger>
      <TooltipContent side="bottom" className="max-w-64 text-xs">
        {disabled ? disabledReason : enabledReason}
      </TooltipContent>
    </Tooltip>
  );
}

export function PlanToolbar({
  siteId,
  nodeCount,
  run,
  onStart,
  onDismiss,
  researchTopicId,
  onResearchTopicChange,
  bulkDeepen,
  emptyBriefCount,
  onBulkDeepen,
  onBulkDeepenCancel,
  onBulkDeepenDismiss,
  cmsLink,
  cmsSiteId,
  pagesLoaded,
  pagesByNodeId,
  allPages,
  siteDomain,
  onOpenSetup,
  copySlot,
  assistSlot,
  pipelineSlot,
}: {
  /** The plan being viewed — the agent-payload preview is site-scoped. */
  siteId: string | null;
  nodeCount: number;
  run: PlanAiRunState;
  onStart: (options: { maxNodes: number; guidance?: string }) => void;
  onDismiss: () => void;
  researchTopicId: string | null;
  onResearchTopicChange: (topicId: string | null) => void;
  bulkDeepen?: BulkDeepenState;
  emptyBriefCount?: number;
  onBulkDeepen?: () => void;
  onBulkDeepenCancel?: () => void;
  onBulkDeepenDismiss?: () => void;
  /** Website truth — null while resolving (renders no website zone). */
  cmsLink: CmsLink | null;
  cmsSiteId: string | null;
  /** False until the CMS page map has loaded — counts are hidden until then,
      because "0/6 built" while loading is a lie, not a loading state. */
  pagesLoaded: boolean;
  pagesByNodeId: ReadonlyMap<string, CmsPageMapEntry>;
  allPages: CmsPageMapEntry[];
  siteDomain: string | null;
  onOpenSetup: () => void;
  /** The page-level copy pair + groomer, rendered inline at the row's end. */
  copySlot?: React.ReactNode;
  /** Assist chips, inline — the strip renders nothing when it has nothing. */
  assistSlot?: React.ReactNode;
  /**
   * The site-level pipeline strip (SitePipelineStrip) — when provided it IS
   * the KPI zone: the same eight steps the page rail shows, answered for the
   * whole site, in the same spot the built/live counts occupied. Still one
   * chrome row; the strip replaces the KPI text, never adds a bar.
   */
  pipelineSlot?: React.ReactNode;
}) {
  const [open, setOpen] = useState(false);
  const [maxNodes, setMaxNodes] = useState(40);
  const [guidance, setGuidance] = useState("");

  // ── Website truth (same reads the old PlanWebsiteBar used) ──
  const linked = Boolean(cmsLink?.linked && cmsSiteId);
  const built = linked
    ? Math.min(pagesByNodeId.size, nodeCount) // deleted nodes can dangle
    : 0;
  const publishedLinked = linked
    ? [...pagesByNodeId.values()].filter((page) => page.isPublished).length
    : 0;
  const unplanned = linked
    ? allPages.filter((page) => !page.planNodeId).length
    : 0;
  const liveCandidates = linked
    ? allPages.filter((page) => page.isPublished && page.liveUrl)
    : [];
  const liveUrl =
    (liveCandidates.find((page) => page.isHomePage) ?? liveCandidates[0])
      ?.liveUrl ?? null;

  // ── Transient run narration replaces the KPI text, never adds a row ──
  const running = bulkDeepen?.status === "running" || run.status === "running";
  const narration =
    bulkDeepen?.status === "running" ? (
      <span className="flex min-w-0 items-center gap-1.5 text-xs text-foreground">
        <Loader2 className="h-3.5 w-3.5 shrink-0 animate-spin text-primary" />
        <span className="min-w-0 truncate">
          Deepening {bulkDeepen.active.length} at once · {bulkDeepen.done}/
          {bulkDeepen.total} finished
          {bulkDeepen.failures.length > 0
            ? ` · ${bulkDeepen.failures.length} failed`
            : ""}
        </span>
        <Button
          variant="ghost"
          size="sm"
          className="h-5 shrink-0 px-1.5 text-xs"
          onClick={onBulkDeepenCancel}
        >
          Stop
        </Button>
      </span>
    ) : run.status === "running" ? (
      <span className="flex min-w-0 items-center gap-1.5 text-xs text-foreground">
        <Loader2 className="h-3.5 w-3.5 shrink-0 animate-spin text-primary" />
        <span className="min-w-0 truncate">
          {run.stage ?? "Generating the plan…"}
        </span>
      </span>
    ) : bulkDeepen?.status === "error" ? (
      <span className="flex min-w-0 items-center gap-1.5 text-xs text-destructive">
        <span className="min-w-0 truncate">
          Bulk deepen: {bulkDeepen.failures.length} of {bulkDeepen.total} failed
          — {bulkDeepen.failures[0]?.route}: {bulkDeepen.failures[0]?.error}
        </span>
        <Button
          variant="ghost"
          size="sm"
          className="h-5 w-5 shrink-0 p-0"
          aria-label="Dismiss"
          onClick={onBulkDeepenDismiss}
        >
          <X className="h-3 w-3" />
        </Button>
      </span>
    ) : run.status === "error" ? (
      <span className="flex min-w-0 items-center gap-1.5 text-xs text-destructive">
        <span className="min-w-0 truncate">
          Plan generation failed: {run.error}
        </span>
        <Button
          variant="ghost"
          size="sm"
          className="h-5 w-5 shrink-0 p-0"
          aria-label="Dismiss"
          onClick={onDismiss}
        >
          <X className="h-3 w-3" />
        </Button>
      </span>
    ) : null;

  return (
    <div className="flex flex-wrap items-center gap-x-3 gap-y-1 border-b border-border bg-muted/20 px-2 py-1">
      {/* Identity + honest KPIs (or the transient narration in their place).
          When the host supplies the site-pipeline strip, it IS this zone. */}
      {narration ?? pipelineSlot ?? (
        <>
          {cmsLink && nodeCount > 0 ? (
            linked && !pagesLoaded ? null : linked ? (
              <span className="flex items-center gap-2 text-xs text-muted-foreground">
                <span className="font-medium text-foreground">
                  {built}/{nodeCount}
                </span>
                built
                <span className="font-medium text-foreground">
                  {publishedLinked}
                </span>
                live
                {unplanned > 0 ? (
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <span className="cursor-default">
                        <span className="font-medium text-foreground">
                          {unplanned}
                        </span>{" "}
                        unplanned
                      </span>
                    </TooltipTrigger>
                    <TooltipContent side="bottom" className="max-w-64 text-xs">
                      {unplanned} page{unplanned === 1 ? "" : "s"} exist on the
                      website that this plan does not describe.
                    </TooltipContent>
                  </Tooltip>
                ) : null}
              </span>
            ) : (
              <span className="flex items-center gap-2 text-xs">
                <span className="text-foreground">No website yet</span>
                <Button
                  size="sm"
                  className="h-6 px-2 text-xs"
                  onClick={onOpenSetup}
                >
                  Set up
                </Button>
              </span>
            )
          ) : null}
        </>
      )}

      {/* Assist chips — inline; the strip renders nothing without chips. */}
      {assistSlot}

      {/* The one action cluster */}
      <div className="ml-auto flex items-center gap-1">
        {/* Whole-plan payload preview: the index and the branch groups a page
          agent is offered, with the coverage line that says what is missing.
          Read-only — it triggers no run. */}
        <Tooltip>
          <TooltipTrigger asChild>
            <span>
              <AgentPayloadButton
                siteId={siteId}
                nodeId={null}
                label="What the AI sees"
              />
            </span>
          </TooltipTrigger>
          <TooltipContent side="bottom" className="max-w-64 text-xs">
            The exact plan index and branch groups handed to a page agent, plus
            the coverage line naming what it is NOT shown.
          </TooltipContent>
        </Tooltip>
        {!running && onBulkDeepen && (emptyBriefCount ?? 0) > 0 ? (
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                variant="outline"
                size="sm"
                className="h-6 gap-1 px-2 text-xs"
                onClick={onBulkDeepen}
              >
                <BrainCircuit className="h-3 w-3" />
                Deepen {emptyBriefCount}
              </Button>
            </TooltipTrigger>
            <TooltipContent side="bottom" className="max-w-64 text-xs">
              Research-grounded deepen over every page with an empty brief —
              brief bullets + sources land on each node.
            </TooltipContent>
          </Tooltip>
        ) : null}
        {!running ? (
          <Popover open={open} onOpenChange={setOpen}>
            <Tooltip>
              <TooltipTrigger asChild>
                <PopoverTrigger asChild>
                  <Button
                    variant={nodeCount === 0 ? "default" : "outline"}
                    size="sm"
                    className="h-6 gap-1 px-2 text-xs"
                  >
                    <BrainCircuit className="h-3 w-3" />
                    Generate
                  </Button>
                </PopoverTrigger>
              </TooltipTrigger>
              <TooltipContent side="bottom" className="max-w-64 text-xs">
                {nodeCount === 0
                  ? "No plan yet — three research agents draft one, then you correct it."
                  : "Agents extend this plan — existing pages are never overwritten."}
              </TooltipContent>
            </Tooltip>
            <PopoverContent align="end" className="w-80 space-y-3">
              <div>
                <Label className="mb-1 block text-xs font-medium">
                  Research grounding
                </Label>
                <ResearchTopicSelect
                  value={researchTopicId}
                  onChange={onResearchTopicChange}
                  triggerClassName="h-8 w-full text-sm"
                  ariaLabel="Research topic grounding the generator"
                />
                <p className="mt-1 text-xs text-muted-foreground">
                  The topic&apos;s final research report is handed to the three
                  research agents — real services, locations, and topics instead
                  of guesses.
                </p>
              </div>
              <div>
                <Label className="mb-1 block text-xs font-medium">
                  Page budget
                </Label>
                <Input
                  type="number"
                  min={10}
                  max={150}
                  value={maxNodes}
                  onChange={(event) => {
                    const value = Number(event.target.value);
                    if (Number.isFinite(value)) setMaxNodes(value);
                  }}
                  className="h-8 text-sm"
                />
                <p className="mt-1 text-xs text-muted-foreground">
                  10–150. The generator stops at this many planned pages.
                </p>
              </div>
              <div>
                <Label className="mb-1 block text-xs font-medium">
                  Guidance (optional)
                </Label>
                <Textarea
                  value={guidance}
                  onChange={(event) => setGuidance(event.target.value)}
                  placeholder="Anything the research agents should know — focus areas, services to emphasize, pages to avoid…"
                  className="min-h-20 text-sm"
                />
              </div>
              <Button
                size="sm"
                className="w-full gap-1.5"
                onClick={() => {
                  setOpen(false);
                  onStart({
                    maxNodes: Math.min(150, Math.max(10, maxNodes)),
                    guidance: guidance.trim() || undefined,
                  });
                }}
              >
                <BrainCircuit className="h-3.5 w-3.5" />
                Run the generator
              </Button>
            </PopoverContent>
          </Popover>
        ) : null}
        {cmsLink && nodeCount > 0 ? (
          <>
            <StatusActionButton
              icon={<PenLine className="h-3 w-3" />}
              label="Edit"
              disabled={!linked}
              disabledReason="This plan has no website yet — nothing can become a real page until it does. Use Set up."
              enabledReason="Open the website's editor (CMS) in a new tab."
              onClick={() => window.open(`/cms/${cmsSiteId}`, "_blank")}
            />
            <StatusActionButton
              icon={<ExternalLink className="h-3 w-3" />}
              label="Live"
              disabled={!liveUrl}
              disabledReason={
                linked
                  ? "Nothing is published yet — there is no live page a visitor could open."
                  : "This plan has no website yet."
              }
              enabledReason="Open the live site in a new tab."
              onClick={() => {
                if (liveUrl) window.open(liveUrl, "_blank");
              }}
            />
          </>
        ) : null}
        {copySlot}
      </div>
    </div>
  );
}
