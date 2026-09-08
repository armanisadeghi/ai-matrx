"use client";

// features/workflow-runtime/listings/WorkflowListDropdown.tsx
//
// ── THE WORKFLOW PICKER — THE EQUAL OF `AgentListDropdown` ───────────────────
//
// Arman, 2026-09-08: *"If workflows don't have an identical system, then you
// better work hard to absolutely duplicate the dropdown including all of the
// highly detailed functionality to show the additional side-popover, the peek
// system and all of the other things."*
//
// So: one self-contained control. The TRIGGER states what is assigned (its
// name, nothing else — no duplicate label, no id printed beside it, no row of
// buttons around it). Everything a reader could want about the assigned
// record lives INSIDE: scope tabs with true counts, search (optionally
// reaching into the steps), sort, category/tag/favorite/archived filters, a
// hover detail card with the record's whole substance, a sneak peek that reads
// the graph, favorite, copy, and two doors (open it, open it in a new tab).
//
// A host that wraps this control in its own name/id/link cluster is REBUILDING
// what is already here, worse — that is exactly the defect this replaced on
// the mandate Holder screen.

import { useCallback, useRef, useState } from "react";
import { ChevronDown, ChevronRight, MousePointerClick } from "lucide-react";

import { cn } from "@/lib/utils";
import { useIsMobile } from "@/hooks/use-mobile";
import {
  Popover,
  PopoverTrigger,
  PopoverContent,
} from "@ai-matrx/design-system";
import { useDialogContainer } from "@/components/ui/dialog";
import {
  Drawer,
  DrawerTrigger,
  DrawerContent,
  DrawerTitle,
} from "@/components/ui/drawer";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import type { RightPanel } from "@ai-matrx/agents/catalog/react";
import {
  PANEL_HEIGHT,
  LIST_MAX_HEIGHT,
} from "@ai-matrx/agents/catalog/react";
import { WorkflowListContent } from "./core/WorkflowListContent";
import { WorkflowDetailCard } from "./core/WorkflowDetailCard";
import {
  WorkflowCategoriesPanel,
  WorkflowSortPanel,
  WorkflowTagsPanel,
} from "./core/WorkflowFilterPanels";
import { WorkflowMobileSubView } from "./core/WorkflowMobileSubView";
import { useWorkflowListCore } from "./useWorkflowListCore";
import type { WorkflowListRecord, WorkflowTab } from "./types";

export interface WorkflowListDropdownProps {
  onSelect?: (workflowId: string) => void;
  /** Currently assigned workflow — named on the trigger and pinned in the list. */
  activeWorkflowId?: string | null;
  /**
   * Trigger text. Omit it and the control names the assigned workflow itself,
   * which is the point — a host that passes "Change workflow" here has to
   * print the name somewhere else, and that second place is where the drift
   * starts.
   */
  label?: string;
  /** Text shown when nothing is assigned yet. */
  placeholder?: string;
  className?: string;
  triggerSlot?: React.ReactNode;
  noBorder?: boolean;
  compact?: boolean;
  disabled?: boolean;
  contentSide?: "top" | "right" | "bottom" | "left";
  initialTab?: WorkflowTab;
  visibleTabs?: readonly WorkflowTab[];
  excludeWorkflowIds?: readonly string[];
  resolveWorkflowHref?: (workflow: WorkflowListRecord) => string;
  /** Show the assigned workflow above the filtered list. Default true. */
  showPinnedWorkflow?: boolean;
  /**
   * A kind this picker's host cares about (a Mandate's declared output kind).
   * Purely INFORMATIONAL: it is stated once at the top of the detail column so
   * a reader knows what the gate will compare against. It never hides a row —
   * the gate also accepts a workflow whose computed deliverables produce the
   * kind, and no column here can know that.
   */
  wantedOutputKind?: string | null;
}

export function WorkflowListDropdown({
  onSelect,
  activeWorkflowId = null,
  label,
  placeholder = "Choose a workflow",
  className,
  triggerSlot,
  noBorder = false,
  compact = false,
  disabled = false,
  contentSide,
  initialTab,
  visibleTabs,
  excludeWorkflowIds,
  resolveWorkflowHref,
  showPinnedWorkflow = true,
  wantedOutputKind = null,
}: WorkflowListDropdownProps) {
  const isMobile = useIsMobile();
  const dialogContainer = useDialogContainer();
  const [open, setOpen] = useState(false);
  const [rightPanel, setRightPanel] = useState<RightPanel>(null);
  const [catSearch, setCatSearch] = useState("");
  const [tagSearch, setTagSearch] = useState("");
  const [mobileDetail, setMobileDetail] = useState<WorkflowListRecord | null>(
    null,
  );
  const [mobileSubView, setMobileSubView] = useState<
    "sort" | "categories" | "tags" | null
  >(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const core = useWorkflowListCore({
    activeWorkflowId,
    initialTab,
    visibleTabs,
    excludeWorkflowIds,
    onSelect,
  });

  const displayLabel =
    label ?? core.pinnedWorkflow?.name ?? (activeWorkflowId ? "…" : placeholder);

  const showAssignedTooltip =
    Boolean(activeWorkflowId) && displayLabel !== placeholder;

  const handleOpen = (nextOpen: boolean) => {
    if (disabled) return;
    setOpen(nextOpen);
    if (nextOpen) {
      core.ensureLoaded();
      if (core.pinnedWorkflow && !isMobile) {
        core.setHoveredWorkflow(core.pinnedWorkflow);
        setRightPanel("detail");
      }
      setTimeout(() => inputRef.current?.focus(), 50);
    } else {
      setRightPanel(null);
      setCatSearch("");
      setTagSearch("");
      setMobileDetail(null);
      setMobileSubView(null);
    }
  };

  const handleSelectWorkflow = (workflow: WorkflowListRecord) => {
    core.handleSelectWorkflow(workflow);
    setOpen(false);
  };

  const handleFilterChipClick = (panel: "sort" | "categories" | "tags") => {
    if (isMobile) {
      setMobileSubView(panel);
    } else {
      setRightPanel(rightPanel === panel ? null : panel);
    }
  };

  const handleHover = useCallback(
    (workflow: WorkflowListRecord) => {
      if (isMobile) return;
      const filterPanelOpen =
        rightPanel === "sort" ||
        rightPanel === "categories" ||
        rightPanel === "tags";
      core.handleWorkflowHover(workflow, filterPanelOpen);
      if (!filterPanelOpen) setRightPanel("detail");
    },
    [isMobile, rightPanel, core],
  );

  const handleHoverEnd = useCallback(
    (workflow: WorkflowListRecord) => {
      if (isMobile) return;
      if (rightPanel !== "detail") return;
      core.handleWorkflowHoverEnd(workflow, () => setRightPanel(null));
    },
    [isMobile, rightPanel, core],
  );

  const handleDetailPanelMouseLeave = useCallback(() => {
    core.handleDetailPanelMouseLeave(() => setRightPanel(null));
  }, [core]);

  const hasRightPanel = rightPanel !== null;

  const triggerButton = triggerSlot ?? (
    <button
      type="button"
      disabled={disabled}
      className={cn(
        "inline-flex items-center rounded-md text-xs font-medium transition-colors",
        "bg-background text-foreground/80 hover:bg-muted/50 hover:text-foreground",
        compact ? "h-5 gap-1 px-1.5" : "h-7 gap-1.5 px-2.5",
        !noBorder && "border border-border",
        disabled && "opacity-60",
        className,
      )}
    >
      <span className="min-w-0 max-w-[240px] flex-1 truncate text-left">
        {displayLabel}
      </span>
      {core.activeFilterCount > 0 && (
        <span className="flex h-4 w-4 items-center justify-center rounded-md bg-primary text-[10px] text-primary-foreground">
          {core.activeFilterCount}
        </span>
      )}
      <ChevronDown className="h-3 w-3 text-muted-foreground/60" />
    </button>
  );

  const wrapTrigger = (
    Trigger: typeof DrawerTrigger | typeof PopoverTrigger,
  ) => {
    if (!showAssignedTooltip) {
      return <Trigger asChild>{triggerButton}</Trigger>;
    }
    return (
      <Tooltip open={open ? false : undefined}>
        <Trigger asChild>
          <TooltipTrigger asChild>{triggerButton}</TooltipTrigger>
        </Trigger>
        <TooltipContent side="bottom" className="max-w-xs">
          {displayLabel}
        </TooltipContent>
      </Tooltip>
    );
  };

  const listPanel = (
    <WorkflowListContent
      workflows={core.workflows}
      total={core.total}
      isLoading={core.isLoading}
      readError={core.readError}
      onRetry={core.retry}
      controls={core.controls}
      counts={core.counts}
      activeWorkflowId={activeWorkflowId}
      allCategories={core.allCategories}
      allTags={core.allTags}
      inputRef={inputRef}
      onSelectWorkflow={handleSelectWorkflow}
      resolveWorkflowHref={resolveWorkflowHref}
      activeFilterCount={core.activeFilterCount}
      isMobile={isMobile}
      hoveredWorkflow={core.hoveredWorkflow}
      onWorkflowHover={handleHover}
      onWorkflowHoverEnd={handleHoverEnd}
      onDetailPress={setMobileDetail}
      onFilterChipClick={handleFilterChipClick}
      rightPanel={rightPanel}
      visibleTabs={visibleTabs}
      pinnedWorkflow={showPinnedWorkflow ? core.pinnedWorkflow : null}
      listOpen={open}
    />
  );

  // Stated ONCE, at the top of the list — never as a per-row verdict this
  // screen is not entitled to give.
  const kindNote = !wantedOutputKind ? null : (
    <p className="shrink-0 border-b border-border px-3 py-1.5 text-[11px] leading-relaxed text-muted-foreground">
      This job answers in{" "}
      <code className="rounded bg-muted px-1 py-0.5 text-[10.5px]">
        {wantedOutputKind}
      </code>
      . A workflow that declares something else may still qualify through its
      computed deliverables — the server decides when you save.
    </p>
  );

  // ── Mobile ──
  if (isMobile) {
    return (
      <Drawer open={open} onOpenChange={handleOpen}>
        {wrapTrigger(DrawerTrigger)}
        <DrawerContent className="h-[85dvh]">
          <DrawerTitle className="sr-only">Select Workflow</DrawerTitle>
          <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
            {mobileDetail ? (
              <div className="flex flex-col overflow-hidden">
                <button
                  onClick={() => setMobileDetail(null)}
                  className="flex shrink-0 items-center gap-1.5 border-b border-border px-3 py-2.5 text-sm font-medium text-primary transition-colors hover:bg-muted/30"
                >
                  <ChevronRight className="h-4 w-4 rotate-180" />
                  Back
                </button>
                <div className="overflow-y-auto">
                  <WorkflowDetailCard
                    workflow={mobileDetail}
                    onSelect={() => handleSelectWorkflow(mobileDetail)}
                    onChanged={core.refresh}
                  />
                </div>
              </div>
            ) : mobileSubView ? (
              <WorkflowMobileSubView
                view={mobileSubView}
                controls={core.controls}
                allCategories={core.allCategories}
                allTags={core.allTags}
                catSearch={catSearch}
                setCatSearch={setCatSearch}
                tagSearch={tagSearch}
                setTagSearch={setTagSearch}
                onBack={() => {
                  setMobileSubView(null);
                  setCatSearch("");
                  setTagSearch("");
                }}
              />
            ) : (
              <>
                {kindNote}
                <div className="min-h-0 flex-1">{listPanel}</div>
              </>
            )}
          </div>
        </DrawerContent>
      </Drawer>
    );
  }

  // ── Desktop ──
  // Fixed footprint for the whole time it is open, exactly like the agent
  // picker: a popover that resizes as the right column swaps panels triggers
  // Radix collision-shifting and yanks the list out from under the cursor.
  return (
    <Popover open={open} onOpenChange={handleOpen} modal={false}>
      {wrapTrigger(PopoverTrigger)}
      <PopoverContent
        side={contentSide}
        align="start"
        sideOffset={4}
        collisionPadding={12}
        sticky="always"
        container={dialogContainer ?? undefined}
        className="w-[680px] overflow-hidden p-0"
        style={{ height: PANEL_HEIGHT, maxHeight: LIST_MAX_HEIGHT }}
      >
        <div className="flex h-full">
          <div className="flex w-[340px] min-w-0 shrink-0 flex-col border-r border-border">
            {kindNote}
            <div className="min-h-0 flex-1">{listPanel}</div>
          </div>
          <div
            className="flex h-full w-[340px] shrink-0 flex-col overflow-hidden"
            onMouseEnter={
              rightPanel === "detail"
                ? core.handleDetailPanelMouseEnter
                : undefined
            }
            onMouseLeave={
              rightPanel === "detail" ? handleDetailPanelMouseLeave : undefined
            }
          >
            {rightPanel === "detail" && core.hoveredWorkflow && (
              <div
                key={core.hoveredWorkflow.id}
                className="h-full animate-in fade-in-0 duration-500 ease-out"
              >
                <WorkflowDetailCard
                  workflow={core.hoveredWorkflow}
                  onSelect={() =>
                    core.hoveredWorkflow &&
                    handleSelectWorkflow(core.hoveredWorkflow)
                  }
                  onChanged={core.refresh}
                />
              </div>
            )}
            {rightPanel === "sort" && (
              <WorkflowSortPanel
                controls={core.controls}
                onClose={() => setRightPanel(null)}
              />
            )}
            {rightPanel === "categories" && (
              <WorkflowCategoriesPanel
                controls={core.controls}
                allCategories={core.allCategories}
                search={catSearch}
                setSearch={setCatSearch}
                onClose={() => {
                  setRightPanel(null);
                  setCatSearch("");
                }}
              />
            )}
            {rightPanel === "tags" && (
              <WorkflowTagsPanel
                controls={core.controls}
                allTags={core.allTags}
                search={tagSearch}
                setSearch={setTagSearch}
                onClose={() => {
                  setRightPanel(null);
                  setTagSearch("");
                }}
              />
            )}
            {!hasRightPanel && (
              <div className="flex flex-1 flex-col items-center justify-center gap-2 px-6 text-center">
                <MousePointerClick className="h-6 w-6 text-muted-foreground/40" />
                <p className="text-xs leading-relaxed text-muted-foreground/70">
                  Hover a workflow to preview it, or click to select.
                </p>
              </div>
            )}
          </div>
        </div>
      </PopoverContent>
    </Popover>
  );
}
