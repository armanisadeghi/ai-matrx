"use client";

import { useState, useRef, useCallback, useMemo } from "react";
import { ChevronDown, ChevronRight, MousePointerClick } from "lucide-react";
import { cn } from "@/lib/utils";
import { useIsMobile } from "@/hooks/use-mobile";
import type { AgentDefinitionRecord } from "@/features/agents/types/agent-definition.types";
import {
  Popover,
  PopoverTrigger,
  PopoverContent,
} from "@/components/ui/popover";
import { useDialogContainer } from "@/components/ui/dialog";
import {
  Drawer,
  DrawerTrigger,
  DrawerContent,
  DrawerTitle,
} from "@/components/ui/drawer";
import { useAgentListCore } from "./useAgentListCore";
import { AgentListContent } from "./core/AgentListContent";
import { AgentDetailCard } from "./core/AgentDetailCard";
import { AgentSortPanel } from "./core/AgentSortPanel";
import { AgentCategoriesPanel } from "./core/AgentCategoriesPanel";
import { AgentTagsPanel } from "./core/AgentTagsPanel";
import { AgentMobileSubView } from "./core/AgentMobileSubView";
import { PANEL_HEIGHT, LIST_MAX_HEIGHT } from "./core/types";
import type { RightPanel } from "./core/types";

const CONSUMER_ID = "agent-list-dropdown";

interface AgentListDropdownProps {
  onSelect?: (agentId: string) => void;
  navigateTo?: string;
  className?: string;
  label?: string;
  /** Custom trigger element — replaces the default text button. */
  triggerSlot?: React.ReactNode;
  /** Remove the border from the default trigger button. */
  noBorder?: boolean;
  /** Use a compact (h-5) trigger instead of the default h-7. */
  compact?: boolean;
  /**
   * Which side the desktop popover opens toward. Defaults to Radix's "bottom".
   * Pass "right" when the trigger lives in a narrow vertical rail (e.g. the
   * collapsed chat sidebar) so the panel opens beside the rail instead of
   * covering it. Ignored on mobile (uses a Drawer).
   */
  contentSide?: "top" | "right" | "bottom" | "left";
}

export function AgentListDropdown({
  onSelect,
  navigateTo,
  className,
  label = "Agents",
  triggerSlot,
  noBorder = false,
  compact = false,
  contentSide,
}: AgentListDropdownProps) {
  const isMobile = useIsMobile();
  const dialogContainer = useDialogContainer();
  const [open, setOpen] = useState(false);
  const [rightPanel, setRightPanel] = useState<RightPanel>(null);
  const [catSearch, setCatSearch] = useState("");
  const [tagSearch, setTagSearch] = useState("");
  const [mobileDetailAgent, setMobileDetailAgent] =
    useState<AgentDefinitionRecord | null>(null);
  const [mobileSubView, setMobileSubView] = useState<
    "sort" | "categories" | "tags" | null
  >(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const {
    agents,
    isLoading,
    activeAgentId,
    allCategories,
    allTags,
    consumer,
    tabCounts,
    activeFilterCount,
    hoveredAgent,
    ensureLoaded,
    handleSelectAgent: coreSelectAgent,
    handleAgentHover: coreAgentHover,
    handleAgentHoverEnd: coreAgentHoverEnd,
    handleDetailPanelMouseEnter,
    handleDetailPanelMouseLeave: coreDetailMouseLeave,
  } = useAgentListCore({ consumerId: CONSUMER_ID, onSelect, navigateTo });

  const handleOpen = (nextOpen: boolean) => {
    setOpen(nextOpen);
    if (nextOpen) {
      ensureLoaded();
      setTimeout(() => inputRef.current?.focus(), 50);
    } else {
      setRightPanel(null);
      setCatSearch("");
      setTagSearch("");
      setMobileDetailAgent(null);
      setMobileSubView(null);
    }
  };

  const handleSelectAgent = (agent: AgentDefinitionRecord) => {
    coreSelectAgent(agent);
    setOpen(false);
  };

  const handleFilterChipClick = (panel: "sort" | "categories" | "tags") => {
    if (isMobile) {
      setMobileSubView(panel);
    } else {
      setRightPanel(rightPanel === panel ? null : panel);
    }
  };

  const handleAgentHover = useCallback(
    (agent: AgentDefinitionRecord) => {
      if (isMobile) return;
      const filterPanelOpen =
        rightPanel === "sort" ||
        rightPanel === "categories" ||
        rightPanel === "tags";
      coreAgentHover(agent, filterPanelOpen);
      if (!filterPanelOpen) setRightPanel("detail");
    },
    [isMobile, rightPanel, coreAgentHover],
  );

  const handleAgentHoverEnd = useCallback(
    (agent: AgentDefinitionRecord) => {
      if (isMobile) return;
      if (rightPanel !== "detail") return;
      coreAgentHoverEnd(agent, () => setRightPanel(null));
    },
    [isMobile, rightPanel, coreAgentHoverEnd],
  );

  const handleDetailPanelMouseLeave = useCallback(() => {
    coreDetailMouseLeave(() => setRightPanel(null));
  }, [coreDetailMouseLeave]);

  const resolveAgentHref = useMemo(() => {
    if (!navigateTo) return undefined;
    return (agent: AgentDefinitionRecord) =>
      navigateTo.replace("{id}", agent.id);
  }, [navigateTo]);

  const hasRightPanel = rightPanel !== null;

  const trigger = triggerSlot ?? (
    <button
      className={cn(
        "inline-flex items-center rounded-md text-xs font-medium transition-colors",
        "bg-background hover:bg-muted/50 text-foreground/80 hover:text-foreground",
        compact ? "h-5 gap-1 px-1.5" : "h-7 gap-1.5 px-2.5",
        !noBorder && "border border-border",
        className,
      )}
    >
      <span className="truncate max-w-[200px]" title={label}>
        {label}
      </span>
      {activeFilterCount > 0 && (
        <span className="flex items-center justify-center w-4 h-4 rounded-md bg-primary text-primary-foreground text-[10px]">
          {activeFilterCount}
        </span>
      )}
      <ChevronDown className="w-3 h-3 text-muted-foreground/60" />
    </button>
  );

  const listPanel = (
    <AgentListContent
      agents={agents}
      isLoading={isLoading}
      consumer={consumer}
      activeAgentId={activeAgentId}
      allCategories={allCategories}
      allTags={allTags}
      inputRef={inputRef}
      onSelectAgent={handleSelectAgent}
      resolveAgentHref={resolveAgentHref}
      onReset={consumer.resetFilters}
      activeFilterCount={activeFilterCount}
      isMobile={isMobile}
      hoveredAgent={hoveredAgent}
      onAgentHover={handleAgentHover}
      onAgentHoverEnd={handleAgentHoverEnd}
      onDetailPress={setMobileDetailAgent}
      onFilterChipClick={handleFilterChipClick}
      rightPanel={rightPanel}
      tabCounts={tabCounts}
    />
  );

  // ── Mobile ──
  if (isMobile) {
    return (
      <Drawer open={open} onOpenChange={handleOpen}>
        <DrawerTrigger asChild>{trigger}</DrawerTrigger>
        <DrawerContent className="h-[85dvh]">
          <DrawerTitle className="sr-only">Select Agent</DrawerTitle>
          <div className="flex flex-col overflow-hidden flex-1 min-h-0">
            {mobileDetailAgent ? (
              <div className="flex flex-col overflow-hidden">
                <button
                  onClick={() => setMobileDetailAgent(null)}
                  className="flex items-center gap-1.5 px-3 py-2.5 text-sm font-medium text-primary hover:bg-muted/30 transition-colors border-b border-border shrink-0"
                >
                  <ChevronRight className="w-4 h-4 rotate-180" />
                  Back
                </button>
                <div className="overflow-y-auto">
                  <AgentDetailCard
                    agent={mobileDetailAgent}
                    onSelect={() => handleSelectAgent(mobileDetailAgent)}
                  />
                </div>
              </div>
            ) : mobileSubView ? (
              <AgentMobileSubView
                view={mobileSubView}
                consumer={consumer}
                allCategories={allCategories}
                allTags={allTags}
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
              listPanel
            )}
          </div>
        </DrawerContent>
      </Drawer>
    );
  }

  // ── Desktop ──
  // The popover reserves its full two-column width for the entire time it is
  // open, so the hover-preview / filter panels toggle WITHOUT resizing or
  // repositioning the popover. A resizing popover in a narrow rail triggers
  // Radix collision-shifting that yanks the list out from under the cursor —
  // the panel "appears, then runs away." A fixed footprint keeps the preview
  // a stationary, reachable target.
  return (
    <Popover open={open} onOpenChange={handleOpen} modal={false}>
      <PopoverTrigger asChild>{trigger}</PopoverTrigger>
      <PopoverContent
        side={contentSide}
        align="start"
        sideOffset={4}
        collisionPadding={12}
        sticky="always"
        container={dialogContainer ?? undefined}
        className="p-0 overflow-hidden w-[680px]"
        style={{ height: PANEL_HEIGHT, maxHeight: LIST_MAX_HEIGHT }}
      >
        <div className="flex h-full">
          <div className="flex flex-col min-w-0 w-[340px] shrink-0 border-r border-border">
            {listPanel}
          </div>
          <div
            className="w-[340px] shrink-0 overflow-hidden flex flex-col"
            style={{ height: PANEL_HEIGHT }}
            onMouseEnter={
              rightPanel === "detail" ? handleDetailPanelMouseEnter : undefined
            }
            onMouseLeave={
              rightPanel === "detail" ? handleDetailPanelMouseLeave : undefined
            }
          >
            {rightPanel === "detail" && hoveredAgent && (
              <div
                key={hoveredAgent.id}
                className="h-full animate-in fade-in-0 duration-500 ease-out"
              >
                <AgentDetailCard
                  agent={hoveredAgent}
                  onSelect={() => handleSelectAgent(hoveredAgent)}
                />
              </div>
            )}
            {rightPanel === "sort" && (
              <AgentSortPanel
                consumer={consumer}
                onClose={() => setRightPanel(null)}
              />
            )}
            {rightPanel === "categories" && (
              <AgentCategoriesPanel
                consumer={consumer}
                allCategories={allCategories}
                search={catSearch}
                setSearch={setCatSearch}
                onClose={() => {
                  setRightPanel(null);
                  setCatSearch("");
                }}
              />
            )}
            {rightPanel === "tags" && (
              <AgentTagsPanel
                consumer={consumer}
                allTags={allTags}
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
                <p className="text-xs text-muted-foreground/70 leading-relaxed">
                  Hover an agent to preview its details, or click to select.
                </p>
              </div>
            )}
          </div>
        </div>
      </PopoverContent>
    </Popover>
  );
}
