"use client";

import { useRef, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { ChevronDown, ChevronRight, List } from "lucide-react";
import { cn } from "@/lib/utils";
import { useIsMobile } from "@/hooks/use-mobile";
import { useAgentListCore } from "@/features/agents/components/agent-listings/useAgentListCore";
import { AgentListDropdown } from "@/features/agents/components/agent-listings/AgentListDropdown";
import { AgentListContent } from "@/features/agents/components/agent-listings/core/AgentListContent";
import { AgentDetailCard } from "@/features/agents/components/agent-listings/core/AgentDetailCard";
import { AgentFilterBar } from "@/features/agents/components/agent-listings/core/AgentFilterBar";
import { AgentSortPanel } from "@/features/agents/components/agent-listings/core/AgentSortPanel";
import { AgentCategoriesPanel } from "@/features/agents/components/agent-listings/core/AgentCategoriesPanel";
import { AgentTagsPanel } from "@/features/agents/components/agent-listings/core/AgentTagsPanel";
import { AgentMobileSubView } from "@/features/agents/components/agent-listings/core/AgentMobileSubView";
import { SearchInput } from "@/features/agents/components/agent-listings/core/primitives";
import type { RightPanel } from "@/features/agents/components/agent-listings/core/types";
import type { AgentDefinitionRecord } from "@/features/agents/types/agent-definition.types";
import {
  Drawer,
  DrawerTrigger,
  DrawerContent,
  DrawerTitle,
} from "@/components/ui/drawer";

// ---------------------------------------------------------------------------
// 1. Dropdown — Default Trigger
// ---------------------------------------------------------------------------

function DropdownDefaultDemo() {
  const [selectedId, setSelectedId] = useState<string | null>(null);

  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-sm flex items-center gap-2">
          Dropdown - Default Trigger
          <Badge variant="secondary" className="text-[9px] h-4">
            AgentListDropdown
          </Badge>
        </CardTitle>
        <p className="text-[10px] text-muted-foreground">
          Out-of-the-box dropdown with built-in trigger, search, filters, hover
          preview.
        </p>
      </CardHeader>
      <CardContent className="space-y-3">
        <AgentListDropdown onSelect={setSelectedId} label="Agents" />
        <SelectedDebug label="selected ID" value={selectedId} />
      </CardContent>
    </Card>
  );
}

// ---------------------------------------------------------------------------
// 2. Dropdown — Custom Trigger
// ---------------------------------------------------------------------------

function DropdownCustomTriggerDemo() {
  const [selectedName, setSelectedName] = useState<string | null>(null);

  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-sm flex items-center gap-2">
          Dropdown - Custom Trigger
          <Badge variant="secondary" className="text-[9px] h-4">
            AgentListDropdown
          </Badge>
        </CardTitle>
        <p className="text-[10px] text-muted-foreground">
          Same full-featured dropdown with a completely different trigger button
          style.
        </p>
      </CardHeader>
      <CardContent className="space-y-3">
        <AgentListDropdown
          onSelect={(id) => setSelectedName(id)}
          label={
            selectedName
              ? `Selected: ${selectedName.slice(0, 8)}...`
              : "Pick an agent"
          }
          triggerSlot={
            <button className="inline-flex items-center gap-2 h-9 px-4 rounded-lg text-sm font-medium bg-primary text-primary-foreground hover:bg-primary/90 transition-colors">
              <span>
                {selectedName
                  ? `Agent: ${selectedName.slice(0, 8)}...`
                  : "Choose Agent"}
              </span>
              <ChevronDown className="w-4 h-4" />
            </button>
          }
        />
        <SelectedDebug label="selected ID" value={selectedName} />
      </CardContent>
    </Card>
  );
}

// ---------------------------------------------------------------------------
// 3. Navigate Mode
// ---------------------------------------------------------------------------

function NavigateModeDemo() {
  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-sm flex items-center gap-2">
          Navigate Mode
          <Badge variant="secondary" className="text-[9px] h-4">
            navigateTo
          </Badge>
        </CardTitle>
        <p className="text-[10px] text-muted-foreground">
          Instead of onSelect callback, navigates to a URL pattern on selection.
        </p>
      </CardHeader>
      <CardContent>
        <AgentListDropdown
          navigateTo="/agents/{id}/run"
          label="Select & Navigate"
        />
      </CardContent>
    </Card>
  );
}

// ---------------------------------------------------------------------------
// 4. Sidebar List (embedded, with inline filter panels + mobile drawer)
// ---------------------------------------------------------------------------

function SidebarListDemo() {
  const isMobile = useIsMobile();
  const inputRef = useRef<HTMLInputElement>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [rightPanel, setRightPanel] = useState<RightPanel>(null);
  const [catSearch, setCatSearch] = useState("");
  const [tagSearch, setTagSearch] = useState("");
  const [mobileDetailAgent, setMobileDetailAgent] =
    useState<AgentDefinitionRecord | null>(null);
  const [mobileSubView, setMobileSubView] = useState<
    "sort" | "categories" | "tags" | null
  >(null);
  const [drawerOpen, setDrawerOpen] = useState(false);

  const {
    agents,
    isLoading,
    allCategories,
    allTags,
    consumer,
    activeFilterCount,
    hoveredAgent,
    ensureLoaded,
    handleSelectAgent: coreSelectAgent,
    handleAgentHover,
    handleAgentHoverEnd,
    handleDetailPanelMouseEnter,
    handleDetailPanelMouseLeave,
  } = useAgentListCore({
    consumerId: "demo-sidebar",
    onSelect: (id) => {
      setSelectedId(id);
      setDrawerOpen(false);
    },
  });

  // eslint-disable-next-line react-hooks/exhaustive-deps
  useState(() => {
    ensureLoaded();
  });

  const onFilterChipClick = (panel: "sort" | "categories" | "tags") => {
    if (isMobile) {
      setMobileSubView(panel);
    } else {
      setRightPanel(rightPanel === panel ? null : panel);
    }
  };

  const closeFilterPanel = () => {
    setRightPanel(null);
    setCatSearch("");
    setTagSearch("");
  };

  const activeFilterPanel =
    !isMobile && rightPanel && rightPanel !== "detail" ? rightPanel : null;

  const listContent = (
    <AgentListContent
      agents={agents}
      isLoading={isLoading}
      consumer={consumer}
      activeAgentId={selectedId}
      allCategories={allCategories}
      allTags={allTags}
      inputRef={inputRef}
      onSelectAgent={coreSelectAgent}
      onReset={consumer.resetFilters}
      activeFilterCount={activeFilterCount}
      isMobile={isMobile}
      hoveredAgent={hoveredAgent}
      onAgentHover={(a) => handleAgentHover(a, !!activeFilterPanel)}
      onAgentHoverEnd={(a) => handleAgentHoverEnd(a, () => setRightPanel(null))}
      onDetailPress={setMobileDetailAgent}
      onFilterChipClick={onFilterChipClick}
      rightPanel={rightPanel}
    />
  );

  // Desktop: inline filter panels shown below the list
  const desktopContent = (
    <div className="flex h-full">
      <div
        className={cn(
          "flex flex-col min-w-0",
          activeFilterPanel ? "flex-1 border-r border-border" : "flex-1",
        )}
      >
        {listContent}
      </div>
      {activeFilterPanel && (
        <div className="w-[220px] shrink-0 overflow-hidden flex flex-col">
          {activeFilterPanel === "sort" && (
            <AgentSortPanel consumer={consumer} onClose={closeFilterPanel} />
          )}
          {activeFilterPanel === "categories" && (
            <AgentCategoriesPanel
              consumer={consumer}
              allCategories={allCategories}
              search={catSearch}
              setSearch={setCatSearch}
              onClose={() => {
                closeFilterPanel();
                setCatSearch("");
              }}
            />
          )}
          {activeFilterPanel === "tags" && (
            <AgentTagsPanel
              consumer={consumer}
              allTags={allTags}
              search={tagSearch}
              setSearch={setTagSearch}
              onClose={() => {
                closeFilterPanel();
                setTagSearch("");
              }}
            />
          )}
        </div>
      )}
    </div>
  );

  // Mobile: drawer with drill-down
  const mobileContent = (
    <Drawer open={drawerOpen} onOpenChange={setDrawerOpen}>
      <DrawerTrigger asChild>
        <button className="inline-flex items-center gap-1.5 h-8 px-3 rounded-md text-xs font-medium border border-border bg-background hover:bg-muted/50 transition-colors w-full justify-between">
          <span className="truncate">
            {selectedId
              ? `Selected: ${selectedId.slice(0, 12)}...`
              : "Select agent..."}
          </span>
          <List className="w-3.5 h-3.5 text-muted-foreground shrink-0" />
        </button>
      </DrawerTrigger>
      <DrawerContent className="max-h-[85dvh]">
        <DrawerTitle className="sr-only">Select Agent</DrawerTitle>
        <div className="flex flex-col overflow-hidden max-h-[calc(85dvh-2rem)]">
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
                  onSelect={() => {
                    coreSelectAgent(mobileDetailAgent);
                    setDrawerOpen(false);
                    setMobileDetailAgent(null);
                  }}
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
            listContent
          )}
        </div>
      </DrawerContent>
    </Drawer>
  );

  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-sm flex items-center gap-2">
          Sidebar List
          <Badge variant="secondary" className="text-[9px] h-4">
            AgentListContent
          </Badge>
        </CardTitle>
        <p className="text-[10px] text-muted-foreground">
          Full list content embedded directly with inline filter panels. On
          mobile, opens as a bottom drawer with drill-down navigation.
        </p>
      </CardHeader>
      <CardContent className="space-y-3">
        {isMobile ? (
          mobileContent
        ) : (
          <div className="h-[360px] border border-border rounded-lg overflow-hidden">
            {desktopContent}
          </div>
        )}
        <SelectedDebug label="selected ID" value={selectedId} />
      </CardContent>
    </Card>
  );
}

// ---------------------------------------------------------------------------
// 5. Card Grid (with working filters + mobile drawer)
// ---------------------------------------------------------------------------

function CardGridDemo() {
  const isMobile = useIsMobile();
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [rightPanel, setRightPanel] = useState<RightPanel>(null);
  const [catSearch, setCatSearch] = useState("");
  const [tagSearch, setTagSearch] = useState("");
  const [mobileSubView, setMobileSubView] = useState<
    "sort" | "categories" | "tags" | null
  >(null);
  const [drawerOpen, setDrawerOpen] = useState(false);

  const {
    agents,
    isLoading,
    allCategories,
    allTags,
    consumer,
    activeFilterCount,
    ensureLoaded,
    handleSelectAgent,
  } = useAgentListCore({
    consumerId: "demo-cards",
    onSelect: (id) => {
      setSelectedId(id);
      setDrawerOpen(false);
    },
  });

  // eslint-disable-next-line react-hooks/exhaustive-deps
  useState(() => {
    ensureLoaded();
  });

  const onFilterChipClick = (panel: "sort" | "categories" | "tags") => {
    if (isMobile) {
      setMobileSubView(panel);
    } else {
      setRightPanel(rightPanel === panel ? null : panel);
    }
  };

  const closeFilterPanel = () => {
    setRightPanel(null);
    setCatSearch("");
    setTagSearch("");
  };

  const activeFilterPanel =
    rightPanel && rightPanel !== "detail" ? rightPanel : null;

  const filterBar = (
    <AgentFilterBar
      consumer={consumer}
      allCategories={allCategories}
      allTags={allTags}
      activeFilterCount={activeFilterCount}
      isMobile={isMobile}
      rightPanel={rightPanel}
      onFilterChipClick={onFilterChipClick}
      onReset={consumer.resetFilters}
    />
  );

  const searchBar = (
    <div className="px-2 pt-2 pb-1">
      <SearchInput
        value={consumer.searchTerm}
        onChange={consumer.setSearchTerm}
        placeholder="Search agents..."
      />
    </div>
  );

  const cardGrid = (
    <div
      className={cn(
        "grid gap-2 overflow-y-auto",
        isMobile ? "grid-cols-2" : "grid-cols-2 md:grid-cols-3",
        isMobile ? "max-h-[50dvh]" : "max-h-[280px]",
      )}
    >
      {isLoading ? (
        <p className="col-span-full text-xs text-muted-foreground text-center py-8">
          Loading...
        </p>
      ) : agents.length === 0 ? (
        <p className="col-span-full text-xs text-muted-foreground text-center py-8">
          No agents found
        </p>
      ) : (
        agents.map((agent) => (
          <button
            key={agent.id}
            onClick={() => {
              setSelectedId(agent.id);
              handleSelectAgent(agent);
            }}
            className={cn(
              "p-3 rounded-lg border text-left transition-all",
              "hover:border-primary/30 hover:shadow-sm",
              selectedId === agent.id
                ? "border-primary bg-primary/5"
                : "border-border bg-card",
            )}
          >
            <p className="text-xs font-medium truncate">
              {agent.name || "Untitled"}
            </p>
            {agent.category && (
              <p className="text-[10px] text-muted-foreground mt-0.5 truncate">
                {agent.category}
              </p>
            )}
          </button>
        ))
      )}
    </div>
  );

  // Desktop: inline filter panel
  const desktopContent = (
    <div className="space-y-2">
      {searchBar}
      {filterBar}
      {activeFilterPanel && (
        <div className="border border-border rounded-lg overflow-hidden max-h-[200px]">
          {activeFilterPanel === "sort" && (
            <AgentSortPanel consumer={consumer} onClose={closeFilterPanel} />
          )}
          {activeFilterPanel === "categories" && (
            <AgentCategoriesPanel
              consumer={consumer}
              allCategories={allCategories}
              search={catSearch}
              setSearch={setCatSearch}
              onClose={() => {
                closeFilterPanel();
                setCatSearch("");
              }}
            />
          )}
          {activeFilterPanel === "tags" && (
            <AgentTagsPanel
              consumer={consumer}
              allTags={allTags}
              search={tagSearch}
              setSearch={setTagSearch}
              onClose={() => {
                closeFilterPanel();
                setTagSearch("");
              }}
            />
          )}
        </div>
      )}
      {cardGrid}
      <div className="flex items-center px-1">
        <span className="text-[10px] text-muted-foreground tabular-nums">
          {agents.length} agent{agents.length !== 1 ? "s" : ""}
        </span>
      </div>
    </div>
  );

  // Mobile: drawer with drill-down for filters, cards inside
  const mobileContent = (
    <Drawer open={drawerOpen} onOpenChange={setDrawerOpen}>
      <DrawerTrigger asChild>
        <button className="inline-flex items-center gap-1.5 h-8 px-3 rounded-md text-xs font-medium border border-border bg-background hover:bg-muted/50 transition-colors w-full justify-between">
          <span className="truncate">
            {selectedId
              ? `Selected: ${selectedId.slice(0, 12)}...`
              : "Browse agents..."}
          </span>
          <List className="w-3.5 h-3.5 text-muted-foreground shrink-0" />
        </button>
      </DrawerTrigger>
      <DrawerContent className="max-h-[85dvh]">
        <DrawerTitle className="sr-only">Browse Agents</DrawerTitle>
        <div className="flex flex-col overflow-hidden max-h-[calc(85dvh-2rem)] p-3 space-y-2">
          {mobileSubView ? (
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
            <>
              {searchBar}
              {filterBar}
              {cardGrid}
            </>
          )}
        </div>
      </DrawerContent>
    </Drawer>
  );

  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-sm flex items-center gap-2">
          Card Grid
          <Badge variant="secondary" className="text-[9px] h-4">
            useAgentListCore + custom cards
          </Badge>
        </CardTitle>
        <p className="text-[10px] text-muted-foreground">
          Hook provides data, filter bar handles filtering, cards are custom
          rendered. On mobile, opens as a bottom drawer.
        </p>
      </CardHeader>
      <CardContent className="space-y-3">
        {isMobile ? mobileContent : desktopContent}
        <SelectedDebug label="selected ID" value={selectedId} />
      </CardContent>
    </Card>
  );
}

// ---------------------------------------------------------------------------
// 6. Detail Card preview (responsive)
// ---------------------------------------------------------------------------

function DetailCardDemo() {
  const isMobile = useIsMobile();
  const [selectedAgent, setSelectedAgent] =
    useState<AgentDefinitionRecord | null>(null);

  const { agents, ensureLoaded } = useAgentListCore({
    consumerId: "demo-detail",
    onSelect: () => {},
  });

  // eslint-disable-next-line react-hooks/exhaustive-deps
  useState(() => {
    ensureLoaded();
  });

  const previewAgent = selectedAgent ?? agents[0] ?? null;

  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-sm flex items-center gap-2">
          Detail Card
          <Badge variant="secondary" className="text-[9px] h-4">
            AgentDetailCard
          </Badge>
        </CardTitle>
        <p className="text-[10px] text-muted-foreground">
          Standalone detail card — use anywhere: hover preview, sidebar detail,
          modal content.
        </p>
      </CardHeader>
      <CardContent className="space-y-3">
        <div
          className={cn(
            "flex gap-2 overflow-x-auto scrollbar-none pb-1",
            isMobile && "flex-nowrap",
          )}
        >
          {agents.slice(0, isMobile ? 4 : 5).map((a) => (
            <button
              key={a.id}
              onClick={() => setSelectedAgent(a)}
              className={cn(
                "text-[11px] px-2 py-1 rounded-md border transition-colors shrink-0",
                selectedAgent?.id === a.id
                  ? "border-primary bg-primary/10 text-primary"
                  : "border-border hover:bg-muted/50",
              )}
            >
              {a.name?.slice(0, 15) || "Untitled"}
            </button>
          ))}
        </div>
        {previewAgent && (
          <div
            className={cn(
              "border border-border rounded-lg overflow-hidden",
              isMobile ? "h-[280px]" : "h-[300px]",
            )}
          >
            <AgentDetailCard agent={previewAgent} onSelect={() => {}} />
          </div>
        )}
      </CardContent>
    </Card>
  );
}

// ---------------------------------------------------------------------------
// Debug helper
// ---------------------------------------------------------------------------

function SelectedDebug({
  label,
  value,
}: {
  label: string;
  value: string | null;
}) {
  return (
    <div className="p-2 bg-muted/30 rounded-md border border-border/50">
      <p className="text-[9px] font-mono text-muted-foreground">
        {label}:{" "}
        {value ? (
          <span className="text-foreground">{value}</span>
        ) : (
          <span className="italic">none</span>
        )}
      </p>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------

export default function AgentSelectorDemoPage() {
  return (
    <div className="p-4 md:p-6 max-w-[1200px] mx-auto space-y-6 md:space-y-8">
      <div>
        <h1 className="text-lg md:text-xl font-bold">Agent Selector System</h1>
        <p className="text-xs md:text-sm text-muted-foreground mt-1">
          Composable agent list components extracted from{" "}
          <code className="text-[11px] bg-muted px-1 rounded">
            AgentListDropdown
          </code>
          . All variants share the same{" "}
          <code className="text-[11px] bg-muted px-1 rounded">
            useAgentListCore
          </code>{" "}
          hook and{" "}
          <code className="text-[11px] bg-muted px-1 rounded">
            useAgentConsumer
          </code>{" "}
          Redux state.
        </p>
      </div>

      <Separator />

      <section className="space-y-4">
        <h2 className="text-sm md:text-base font-semibold">
          Dropdown Variants
        </h2>
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
          <DropdownDefaultDemo />
          <DropdownCustomTriggerDemo />
          <NavigateModeDemo />
        </div>
      </section>

      <Separator />

      <section className="space-y-4">
        <h2 className="text-sm md:text-base font-semibold">
          Embedded Variants
        </h2>
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 md:gap-6">
          <SidebarListDemo />
          <CardGridDemo />
        </div>
      </section>

      <Separator />

      <section className="space-y-4">
        <h2 className="text-sm md:text-base font-semibold">
          Standalone Components
        </h2>
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 md:gap-6">
          <DetailCardDemo />
        </div>
      </section>
    </div>
  );
}
