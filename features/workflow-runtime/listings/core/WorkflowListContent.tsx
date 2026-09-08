"use client";

import { useEffect, useRef } from "react";
import { CircleAlert, Loader2 } from "lucide-react";

import { Button } from "@/components/ui/button";
import { SearchInput } from "@ai-matrx/agents/catalog/react";
import type { RightPanel } from "@ai-matrx/agents/catalog/react";
import type { WorkflowListRecord, WorkflowTab } from "../types";
import type {
  WorkflowListControls,
  WorkflowTabCounts,
} from "../useWorkflowListCore";
import { WorkflowFilterBar } from "./WorkflowFilterBar";
import { WorkflowListTabs } from "./WorkflowListTabs";
import { WorkflowRow } from "./WorkflowRow";

export interface WorkflowListContentProps {
  workflows: WorkflowListRecord[];
  total: number;
  isLoading: boolean;
  readError: string | null;
  onRetry: () => void;
  controls: WorkflowListControls;
  counts: WorkflowTabCounts;
  activeWorkflowId: string | null;
  allCategories: string[];
  allTags: string[];
  inputRef: React.RefObject<HTMLInputElement | null>;
  onSelectWorkflow: (workflow: WorkflowListRecord) => void;
  resolveWorkflowHref?: (workflow: WorkflowListRecord) => string;
  activeFilterCount: number;
  isMobile: boolean;
  hoveredWorkflow: WorkflowListRecord | null;
  onWorkflowHover: (workflow: WorkflowListRecord) => void;
  onWorkflowHoverEnd: (workflow: WorkflowListRecord) => void;
  onDetailPress: (workflow: WorkflowListRecord) => void;
  onFilterChipClick: (panel: "sort" | "categories" | "tags") => void;
  rightPanel: RightPanel;
  visibleTabs?: readonly WorkflowTab[];
  pinnedWorkflow?: WorkflowListRecord | null;
  listOpen?: boolean;
}

function emptyLabel(tab: WorkflowTab): string {
  switch (tab) {
    case "mine":
      return "You have not built a workflow yet";
    case "orgs":
      return "No workflow in your team's space";
    case "shared":
      return "No workflow has been shared with you";
    default:
      return "No workflow has been published publicly";
  }
}

export function WorkflowListContent({
  workflows,
  total,
  isLoading,
  readError,
  onRetry,
  controls,
  counts,
  activeWorkflowId,
  allCategories,
  allTags,
  inputRef,
  onSelectWorkflow,
  resolveWorkflowHref,
  activeFilterCount,
  isMobile,
  hoveredWorkflow,
  onWorkflowHover,
  onWorkflowHoverEnd,
  onDetailPress,
  onFilterChipClick,
  rightPanel,
  visibleTabs,
  pinnedWorkflow = null,
  listOpen = false,
}: WorkflowListContentProps) {
  const listScrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (listOpen && pinnedWorkflow) {
      listScrollRef.current?.scrollTo({ top: 0 });
    }
  }, [listOpen, pinnedWorkflow?.id]);

  return (
    <div className="flex h-full flex-col">
      <div className="shrink-0 px-2 pb-1 pt-2">
        <SearchInput
          ref={inputRef}
          value={controls.searchTerm}
          onChange={controls.setSearchTerm}
          placeholder="Search workflows..."
        />
      </div>

      <WorkflowListTabs
        tab={controls.tab}
        setTab={controls.setTab}
        counts={counts}
        visibleTabs={visibleTabs}
      />

      <WorkflowFilterBar
        controls={controls}
        allCategories={allCategories}
        allTags={allTags}
        activeFilterCount={activeFilterCount}
        isMobile={isMobile}
        rightPanel={rightPanel}
        onFilterChipClick={onFilterChipClick}
      />

      <div className="h-px shrink-0 bg-border" />

      <div ref={listScrollRef} className="min-h-0 flex-1 overflow-y-auto">
        {/* 🚨 A FAILED READ SAYS SO. An empty list here would read as "you have
            no workflows" — the silent failure that makes a person rebuild
            something they already own. */}
        {readError ? (
          <div className="flex flex-col items-center gap-2 px-4 py-8 text-center">
            <CircleAlert className="h-5 w-5 text-destructive" />
            <p className="text-xs leading-relaxed text-destructive">
              Workflows could not be read: {readError}
            </p>
            <Button
              variant="outline"
              size="sm"
              className="h-7 text-[11.5px]"
              onClick={onRetry}
            >
              Try again
            </Button>
          </div>
        ) : isLoading ? (
          <div className="flex items-center justify-center gap-2 py-8 text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" />
            <span className="text-xs">Loading...</span>
          </div>
        ) : workflows.length === 0 && !pinnedWorkflow ? (
          <div className="flex flex-col items-center py-8 text-muted-foreground">
            <span className="text-xs">{emptyLabel(controls.tab)}</span>
          </div>
        ) : (
          <div className="py-0.5">
            {pinnedWorkflow && (
              <>
                <div className="px-3 pb-0.5 pt-1.5">
                  <span className="text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
                    Current workflow
                  </span>
                </div>
                <WorkflowRow
                  key={`pinned-${pinnedWorkflow.id}`}
                  workflow={pinnedWorkflow}
                  isActive
                  isHovered={hoveredWorkflow?.id === pinnedWorkflow.id}
                  isMobile={isMobile}
                  onClick={() => onSelectWorkflow(pinnedWorkflow)}
                  href={resolveWorkflowHref?.(pinnedWorkflow)}
                  onHover={() => onWorkflowHover(pinnedWorkflow)}
                  onHoverEnd={() => onWorkflowHoverEnd(pinnedWorkflow)}
                  onDetailPress={() => onDetailPress(pinnedWorkflow)}
                />
                <div className="mx-2 my-0.5 h-px bg-border" />
              </>
            )}
            {workflows.map((workflow) => (
              <WorkflowRow
                key={workflow.id}
                workflow={workflow}
                isActive={workflow.id === activeWorkflowId}
                isHovered={hoveredWorkflow?.id === workflow.id}
                isMobile={isMobile}
                onClick={() => onSelectWorkflow(workflow)}
                href={resolveWorkflowHref?.(workflow)}
                onHover={() => onWorkflowHover(workflow)}
                onHoverEnd={() => onWorkflowHoverEnd(workflow)}
                onDetailPress={() => onDetailPress(workflow)}
              />
            ))}
            {workflows.length === 0 && pinnedWorkflow && (
              <div className="flex flex-col items-center py-4 text-muted-foreground">
                <span className="text-xs">{emptyLabel(controls.tab)}</span>
              </div>
            )}
          </div>
        )}
      </div>

      <div className="h-px shrink-0 bg-border" />
      <div className="flex shrink-0 items-center justify-between px-2.5 py-1.5">
        <span className="text-[10px] tabular-nums text-muted-foreground">
          {total} workflow{total !== 1 ? "s" : ""}
        </span>
        {controls.searchTerm && (
          <button
            onClick={() => controls.setSearchTerm("")}
            className="text-[10px] text-muted-foreground transition-colors hover:text-foreground"
          >
            Clear search
          </button>
        )}
      </div>
    </div>
  );
}
