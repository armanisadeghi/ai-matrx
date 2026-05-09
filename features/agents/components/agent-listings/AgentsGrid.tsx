"use client";

import { useState, useTransition, useMemo, useRef, useEffect } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { AgentCard } from "./AgentCard";
import { AgentListItem } from "./AgentListItem";
import { MobileActionBar } from "@/components/official/mobile-action-bar/MobileActionBar";
import {
  BottomSheet,
  BottomSheetHeader,
  BottomSheetBody,
} from "@/components/official/bottom-sheet/BottomSheet";
import {
  Check,
  ChevronRight,
  RotateCcw,
  X,
  Search,
  Plus,
  Webhook,
} from "lucide-react";
import { DesktopFilterPanel } from "@/features/prompts/components/layouts/DesktopFilterPanel";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { useAppDispatch, useAppSelector } from "@/lib/redux/hooks";
import { toast } from "@/lib/toast-service";
import { useIsMobile } from "@/hooks/use-mobile";
import { useAgentConsumer } from "@/features/agents/hooks/useAgentConsumer";
import {
  makeSelectFilteredAgents,
  makeSelectAgentCards,
  makeSelectAgentListItems,
  selectAllAgentCategories,
  selectAllAgentTags,
} from "@/features/agents/redux/agent-consumers/selectors";
import { selectAgentsSliceStatus } from "@/features/agents/redux/agent-definition/selectors";
import {
  fetchAgentsList,
  deleteAgent,
  duplicateAgent,
} from "@/features/agents/redux/agent-definition/thunks";
import type { AgentSortOption } from "@/features/agents/redux/agent-consumers/slice";
import type { AgentDefinitionRecord } from "@/features/agents/types/agent-definition.types";

const CONSUMER_ID = "agents-main";

function AgentsSkeleton({ count = 4 }: { count?: number }) {
  return (
    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-x-4 gap-y-3">
      {Array.from({ length: count }).map((_, i) => (
        <div
          key={i}
          className="rounded-xl border border-border p-5 space-y-3 animate-pulse"
        >
          <div className="h-5 w-2/3 rounded bg-muted" />
          <div className="space-y-2">
            <div className="h-3 w-full rounded bg-muted" />
            <div className="h-3 w-4/5 rounded bg-muted" />
          </div>
          <div className="flex gap-2 pt-2">
            <div className="h-8 w-16 rounded bg-muted" />
            <div className="h-8 w-16 rounded bg-muted" />
          </div>
        </div>
      ))}
    </div>
  );
}

export function AgentsGrid() {
  const dispatch = useAppDispatch();
  const router = useRouter();
  const isMobile = useIsMobile();

  useEffect(() => {
    dispatch(fetchAgentsList());
  }, [dispatch]);

  const sliceStatus = useAppSelector(selectAgentsSliceStatus);
  const isLoading = sliceStatus === "idle" || sliceStatus === "loading";

  const [, startTransition] = useTransition();
  const [navigatingId, setNavigatingId] = useState<string | null>(null);
  const [deletingIds, setDeletingIds] = useState<Set<string>>(new Set());
  const [duplicatingIds, setDuplicatingIds] = useState<Set<string>>(new Set());
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [agentToDelete, setAgentToDelete] = useState<{
    id: string;
    name: string;
  } | null>(null);
  const [isFilterModalOpen, setIsFilterModalOpen] = useState(false);

  const consumer = useAgentConsumer(CONSUMER_ID);
  const {
    tab: activeTab,
    sortBy,
    searchTerm,
    includedCats,
    includedTags,
    favFilter,
    archFilter,
    favoritesFirst,
    listPage,
    hasActiveFilters,
    setTab: setActiveTab,
    setSortBy,
    setSearchTerm,
    setFavFilter,
    setArchFilter,
    toggleFavoritesFirst,
    loadMoreList,
    resetFilters,
    toggleCategory,
    toggleTag,
  } = consumer;

  const [filterDetailKey, setFilterDetailKey] = useState<string | null>(null);
  const [listSearchQ, setListSearchQ] = useState("");

  // Memoized selectors
  const selectFiltered = useMemo(
    () => makeSelectFilteredAgents(CONSUMER_ID),
    [],
  );
  const selectCards = useMemo(
    () => makeSelectAgentCards(CONSUMER_ID, isMobile),
    [isMobile],
  );
  const selectListItems = useMemo(
    () => makeSelectAgentListItems(CONSUMER_ID, isMobile),
    [isMobile],
  );

  const filteredAgents = useAppSelector(selectFiltered);
  const agentCards = useAppSelector(selectCards);
  const {
    items: agentListItems,
    hasMore,
    totalAfterCards,
  } = useAppSelector(selectListItems);
  const allCategories = useAppSelector(selectAllAgentCategories);
  const allTags = useAppSelector(selectAllAgentTags);

  const ownedAgents = filteredAgents.filter((a) => a.isOwner !== false);
  const sharedAgents = filteredAgents.filter((a) => a.isOwner === false);
  const hasShared = sharedAgents.length > 0;
  // Ordered list of all filtered agent ids — drives prev/next navigation in
  // the sneak-peek modal so the user can cycle through their current results.
  const navigationIds = useMemo(
    () => filteredAgents.map((a) => a.id),
    [filteredAgents],
  );

  // Sentinel for mobile infinite scroll
  const listSentinelRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!isMobile) return;
    const el = listSentinelRef.current;
    if (!el || !hasMore) return;
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) loadMoreList();
      },
      { rootMargin: "300px" },
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, [isMobile, hasMore, loadMoreList]);

  // Handlers
  const handleDeleteClick = (id: string, name: string) => {
    setAgentToDelete({ id, name });
    setDeleteDialogOpen(true);
  };

  const handleConfirmDelete = async () => {
    if (!agentToDelete) return;
    const { id } = agentToDelete;
    setDeletingIds((prev) => new Set(prev).add(id));
    setDeleteDialogOpen(false);
    setAgentToDelete(null);
    try {
      await dispatch(deleteAgent(id)).unwrap();
      toast.success("Agent deleted.");
    } catch {
      toast.error("Failed to delete agent.");
    } finally {
      setDeletingIds((prev) => {
        const n = new Set(prev);
        n.delete(id);
        return n;
      });
    }
  };

  const handleDuplicate = async (id: string) => {
    setDuplicatingIds((prev) => new Set(prev).add(id));
    try {
      await dispatch(duplicateAgent(id)).unwrap();
      toast.success("Agent duplicated!");
    } catch {
      toast.error("Failed to duplicate agent.");
    } finally {
      setDuplicatingIds((prev) => {
        const n = new Set(prev);
        n.delete(id);
        return n;
      });
    }
  };

  const handleNavigate = (id: string, path: string) => {
    if (navigatingId) return;
    setNavigatingId(id);
    startTransition(() => router.push(path));
  };

  const sortOptions: { value: AgentSortOption; label: string }[] = [
    { value: "updated-desc", label: "Recently Updated" },
    { value: "created-desc", label: "Recently Created" },
    { value: "name-asc", label: "Name (A-Z)" },
    { value: "name-desc", label: "Name (Z-A)" },
    { value: "category-asc", label: "Category (A-Z)" },
  ];

  const hasSortFilter = sortBy !== "updated-desc";
  const hasTabFilter = activeTab !== "mine";
  const hasCatsFilter = includedCats.length > 0;
  const hasTagsFilter = includedTags.length > 0;
  const hasFavFilter = favFilter !== "all";
  const hasArchFilter = archFilter !== "active";

  const activeFilterCount =
    (hasSortFilter ? 1 : 0) +
    (hasTabFilter ? 1 : 0) +
    (hasCatsFilter ? 1 : 0) +
    (hasTagsFilter ? 1 : 0) +
    (hasFavFilter ? 1 : 0) +
    (hasArchFilter ? 1 : 0);

  const handleFilterModalChange = (open: boolean) => {
    setIsFilterModalOpen(open);
    if (!open) {
      setFilterDetailKey(null);
      setListSearchQ("");
    }
  };

  // Render helpers
  const renderCards = (agents: AgentDefinitionRecord[]) => (
    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-x-3 gap-y-3">
      {agents.map((a) => (
        <AgentCard
          key={a.id}
          id={a.id}
          onDelete={handleDeleteClick}
          onDuplicate={handleDuplicate}
          onNavigate={handleNavigate}
          isDeleting={deletingIds.has(a.id)}
          isDuplicating={duplicatingIds.has(a.id)}
          isNavigating={navigatingId === a.id}
          isAnyNavigating={navigatingId !== null}
          navigationIds={navigationIds}
        />
      ))}
    </div>
  );

  const renderList = (agents: AgentDefinitionRecord[]) => (
    <div className="mt-4 grid gap-2 grid-cols-1 md:grid-cols-2 lg:grid-cols-3">
      {agents.map((a) => (
        <AgentListItem
          key={a.id}
          id={a.id}
          onDelete={handleDeleteClick}
          onDuplicate={handleDuplicate}
          onNavigate={handleNavigate}
          isDeleting={deletingIds.has(a.id)}
          isDuplicating={duplicatingIds.has(a.id)}
          isNavigating={navigatingId === a.id}
          isAnyNavigating={navigatingId !== null}
          navigationIds={navigationIds}
        />
      ))}
    </div>
  );

  const renderShowMore = (remaining: number, onMore: () => void) =>
    isMobile ? (
      <div ref={listSentinelRef} className="h-8" />
    ) : (
      <div className="mt-4 flex justify-center">
        <Button variant="outline" onClick={onMore} className="w-full md:w-auto">
          Show More ({remaining} remaining)
        </Button>
      </div>
    );

  return (
    <>
      {/* Desktop controls — single row: Filter | Search | tabs | result count | New */}
      {!isMobile && (
        <div className="mb-3 pt-8">
          <div className="flex items-center gap-2">
            {/* Filter icon (left) */}
            <DesktopFilterPanel
              iconOnly
              sortBy={sortBy}
              setSortBy={setSortBy}
              activeTab={activeTab}
              setActiveTab={setActiveTab}
              includedCats={includedCats}
              setIncludedCats={(cats) => {
                const toAdd = cats.filter((c) => !includedCats.includes(c));
                const toRemove = includedCats.filter((c) => !cats.includes(c));
                toAdd.forEach(toggleCategory);
                toRemove.forEach(toggleCategory);
              }}
              includedTags={includedTags}
              setIncludedTags={(tags) => {
                const toAdd = tags.filter((t) => !includedTags.includes(t));
                const toRemove = includedTags.filter((t) => !tags.includes(t));
                toAdd.forEach(toggleTag);
                toRemove.forEach(toggleTag);
              }}
              favFilter={favFilter}
              setFavFilter={setFavFilter}
              archFilter={archFilter}
              setArchFilter={setArchFilter}
              favoritesFirst={favoritesFirst}
              setFavoritesFirst={toggleFavoritesFirst}
              allCategories={allCategories}
              allTags={allTags}
              resetFilters={resetFilters}
              activeFilterCount={activeFilterCount}
              hasShared={hasShared}
            />

            {/* Search */}
            <div className="flex-1 relative">
              <div className="flex items-center gap-3 p-1 rounded-full matrx-glass-thin-border hover:shadow-xl transition-shadow">
                <Search className="h-4 w-4 text-muted-foreground flex-shrink-0" />
                <input
                  type="text"
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  placeholder="Search agents..."
                  className="flex-1 bg-transparent border-0 outline-none text-base text-foreground placeholder:text-muted-foreground"
                />
                {searchTerm && (
                  <button
                    onClick={() => setSearchTerm("")}
                    className="p-1.5 hover:bg-muted/50 rounded-lg transition-colors flex-shrink-0"
                  >
                    <X className="h-4 w-4 text-muted-foreground" />
                  </button>
                )}
              </div>
            </div>

            {/* Ownership tabs (only when shared agents exist) */}
            {hasShared && (
              <div className="flex items-center gap-1 shrink-0">
                {(["mine", "shared", "all"] as const).map((t) => (
                  <button
                    key={t}
                    onClick={() => setActiveTab(t)}
                    className={cn(
                      "flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-medium transition-all active:scale-95",
                      activeTab === t
                        ? "bg-primary text-primary-foreground"
                        : "border border-border text-muted-foreground hover:text-foreground hover:bg-muted",
                    )}
                  >
                    {t === "mine" ? "Mine" : t === "shared" ? "Shared" : "All"}
                    <span className="text-[10px] opacity-70">
                      {t === "mine"
                        ? ownedAgents.length
                        : t === "shared"
                          ? sharedAgents.length
                          : filteredAgents.length}
                    </span>
                  </button>
                ))}
              </div>
            )}

            {searchTerm && (
              <span className="text-xs text-muted-foreground shrink-0">
                {filteredAgents.length} result
                {filteredAgents.length !== 1 ? "s" : ""}
              </span>
            )}

            {/* New agent icon (right) */}
            <Link href="/agents/new">
              <Button
                size="icon"
                className="h-8 w-8 rounded-full matrx-glass-thin-border hover:shadow-xl bg-primary hover:bg-primary/90 shrink-0"
                title="Create new agent"
              >
                <Plus className="h-4 w-4" />
              </Button>
            </Link>
          </div>
        </div>
      )}

      {/* Mobile tabs */}
      {isMobile && hasShared && (
        <div className="flex items-center gap-1 mb-3 pl-1">
          {(["mine", "shared", "all"] as const).map((t) => (
            <button
              key={t}
              onClick={() => setActiveTab(t)}
              className={cn(
                "flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-medium transition-all active:scale-95",
                activeTab === t
                  ? "bg-primary text-primary-foreground"
                  : "border border-border text-muted-foreground hover:text-foreground hover:bg-muted",
              )}
            >
              {t === "mine" ? "Mine" : t === "shared" ? "Shared" : "All"}
              <span className="text-[10px] opacity-70">
                {t === "mine"
                  ? ownedAgents.length
                  : t === "shared"
                    ? sharedAgents.length
                    : filteredAgents.length}
              </span>
            </button>
          ))}
        </div>
      )}

      {/* Content */}
      <div className={cn(isMobile && "pb-24 pt-10")}>
        {isLoading ? (
          <AgentsSkeleton count={isMobile ? 4 : 8} />
        ) : filteredAgents.length === 0 && !isLoading ? (
          <div className="border border-primary/20 rounded-xl p-8 bg-gradient-to-br from-primary/5 to-secondary/5">
            <div className="flex flex-col items-center text-center space-y-4">
              <div className="p-4 bg-primary/10 rounded-full">
                <Webhook className="h-8 w-8 text-primary" />
              </div>
              <div>
                <h3 className="text-xl font-semibold mb-2">
                  {hasActiveFilters
                    ? "No agents match your filters"
                    : "Create Your First Agent"}
                </h3>
                <p className="text-muted-foreground">
                  {hasActiveFilters
                    ? "Try adjusting your search or filters."
                    : "Start building your AI agent library."}
                </p>
              </div>
              {!hasActiveFilters && (
                <Link href="/agents/new">
                  <Button>
                    <Plus className="h-4 w-4 mr-2" />
                    Create Agent
                  </Button>
                </Link>
              )}
              {hasActiveFilters && (
                <Button variant="outline" onClick={resetFilters}>
                  Clear Filters
                </Button>
              )}
            </div>
          </div>
        ) : (
          <>
            {agentCards.length > 0 && renderCards(agentCards)}
            {agentListItems.length > 0 && (
              <>
                {renderList(agentListItems)}
                {hasMore &&
                  renderShowMore(
                    totalAfterCards - agentListItems.length,
                    loadMoreList,
                  )}
              </>
            )}
          </>
        )}
      </div>

      {/* Mobile Action Bar */}
      <MobileActionBar
        searchValue={searchTerm}
        onSearchChange={setSearchTerm}
        totalCount={filteredAgents.length}
        filteredCount={filteredAgents.length}
        onPrimaryAction={() => router.push("/agents/new")}
        primaryActionLabel="New Agent"
        primaryActionIcon={<Plus className="h-5 w-5" />}
        showFilterButton
        showVoiceSearch
        isFilterModalOpen={isFilterModalOpen}
        setIsFilterModalOpen={setIsFilterModalOpen}
        searchPlaceholder="Search agents..."
      />

      {/* Mobile Filter Bottom Sheet */}
      <BottomSheet
        open={isFilterModalOpen}
        onOpenChange={handleFilterModalChange}
        title="Filters"
      >
        <BottomSheetHeader
          title={
            filterDetailKey === "sortBy"
              ? "Sort By"
              : filterDetailKey === "show"
                ? "Show"
                : filterDetailKey === "cats"
                  ? "Category"
                  : filterDetailKey === "tags"
                    ? "Tags"
                    : filterDetailKey === "fav"
                      ? "Favorites"
                      : filterDetailKey === "arch"
                        ? "Archived"
                        : "Filters"
          }
          showBack={filterDetailKey !== null}
          onBack={() => {
            setFilterDetailKey(null);
            setListSearchQ("");
          }}
          trailing={
            !filterDetailKey && activeFilterCount > 0 ? (
              <button
                onClick={resetFilters}
                className="flex items-center gap-1 text-primary active:opacity-70 min-h-[44px] px-1"
              >
                <RotateCcw className="h-3.5 w-3.5" />
                <span className="text-[15px]">Reset</span>
              </button>
            ) : !filterDetailKey ? (
              <button
                onClick={() => handleFilterModalChange(false)}
                className="text-primary active:opacity-70 min-h-[44px] px-1 text-[15px]"
              >
                Done
              </button>
            ) : null
          }
        />
        <BottomSheetBody>
          {filterDetailKey === "sortBy" ? (
            <>
              {sortOptions.map((opt, idx) => (
                <button
                  key={opt.value}
                  onClick={() => {
                    setSortBy(opt.value);
                    setFilterDetailKey(null);
                  }}
                  className={cn(
                    "flex items-center w-full px-5 min-h-[44px] active:bg-white/5 transition-colors",
                    idx < sortOptions.length - 1 &&
                      "border-b border-white/[0.06]",
                  )}
                >
                  <span
                    className={cn(
                      "text-[15px] flex-1 text-left",
                      sortBy === opt.value && "font-medium",
                    )}
                  >
                    {opt.label}
                  </span>
                  {sortBy === opt.value && (
                    <Check className="h-5 w-5 text-primary shrink-0" />
                  )}
                </button>
              ))}
            </>
          ) : filterDetailKey === "show" ? (
            <>
              {[
                { value: "mine" as const, label: "My Agents" },
                { value: "shared" as const, label: "Shared with Me" },
                { value: "all" as const, label: "All Agents" },
              ].map((opt, idx, arr) => (
                <button
                  key={opt.value}
                  onClick={() => {
                    setActiveTab(opt.value);
                    setFilterDetailKey(null);
                  }}
                  className={cn(
                    "flex items-center w-full px-5 min-h-[44px] active:bg-white/5 transition-colors",
                    idx < arr.length - 1 && "border-b border-white/[0.06]",
                  )}
                >
                  <span
                    className={cn(
                      "text-[15px] flex-1 text-left",
                      activeTab === opt.value && "font-medium",
                    )}
                  >
                    {opt.label}
                  </span>
                  {activeTab === opt.value && (
                    <Check className="h-5 w-5 text-primary shrink-0" />
                  )}
                </button>
              ))}
            </>
          ) : filterDetailKey === "cats" ? (
            <>
              <div
                className="sticky top-0 z-10 px-4 pt-2 pb-3 border-b border-white/[0.06] space-y-2"
                style={{
                  background: "var(--matrx-glass-bg)",
                  backdropFilter: "blur(20px)",
                }}
              >
                <div className="flex items-center gap-2 px-3 h-9 rounded-lg bg-white/[0.06] border border-white/[0.08]">
                  <Search className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                  <input
                    type="text"
                    placeholder="Find a category..."
                    value={listSearchQ}
                    onChange={(e) => setListSearchQ(e.target.value)}
                    className="flex-1 bg-transparent text-foreground placeholder:text-muted-foreground/50 outline-none"
                    style={{ fontSize: "16px" }}
                  />
                  {listSearchQ && (
                    <button onClick={() => setListSearchQ("")}>
                      <X className="h-3.5 w-3.5 text-muted-foreground" />
                    </button>
                  )}
                </div>
                {includedCats.length > 0 && (
                  <button
                    onClick={() => includedCats.forEach(toggleCategory)}
                    className="w-full h-8 rounded-lg border border-white/[0.12] text-[13px] font-medium text-primary active:bg-white/10 transition-colors bg-white/[0.04] hover:bg-white/[0.08]"
                  >
                    Clear filter ({includedCats.length} selected)
                  </button>
                )}
              </div>
              {allCategories
                .filter(
                  (c) =>
                    !listSearchQ ||
                    c.toLowerCase().includes(listSearchQ.toLowerCase()),
                )
                .map((cat, idx, arr) => {
                  const isIncluded = includedCats.includes(cat);
                  return (
                    <button
                      key={cat}
                      onClick={() => toggleCategory(cat)}
                      className={cn(
                        "flex items-center w-full px-5 min-h-[44px] active:bg-white/5 transition-colors",
                        idx < arr.length - 1 && "border-b border-white/[0.06]",
                      )}
                    >
                      <div
                        className={cn(
                          "w-5 h-5 rounded border-2 flex items-center justify-center mr-3 shrink-0 transition-colors",
                          isIncluded
                            ? "bg-primary border-primary"
                            : "border-muted-foreground/40",
                        )}
                      >
                        {isIncluded && (
                          <Check className="h-3 w-3 text-primary-foreground" />
                        )}
                      </div>
                      <span className="text-[15px] flex-1 text-left">
                        {cat}
                      </span>
                    </button>
                  );
                })}
            </>
          ) : filterDetailKey === "tags" ? (
            <>
              <div
                className="sticky top-0 z-10 px-4 pt-2 pb-3 border-b border-white/[0.06] space-y-2"
                style={{
                  background: "var(--matrx-glass-bg)",
                  backdropFilter: "blur(20px)",
                }}
              >
                <div className="flex items-center gap-2 px-3 h-9 rounded-lg bg-white/[0.06] border border-white/[0.08]">
                  <Search className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                  <input
                    type="text"
                    placeholder="Find a tag..."
                    value={listSearchQ}
                    onChange={(e) => setListSearchQ(e.target.value)}
                    className="flex-1 bg-transparent text-foreground placeholder:text-muted-foreground/50 outline-none"
                    style={{ fontSize: "16px" }}
                  />
                  {listSearchQ && (
                    <button onClick={() => setListSearchQ("")}>
                      <X className="h-3.5 w-3.5 text-muted-foreground" />
                    </button>
                  )}
                </div>
                {includedTags.length > 0 && (
                  <button
                    onClick={() => includedTags.forEach(toggleTag)}
                    className="w-full h-8 rounded-lg border border-white/[0.12] text-[13px] font-medium text-primary active:bg-white/10 transition-colors bg-white/[0.04] hover:bg-white/[0.08]"
                  >
                    Clear filter ({includedTags.length} selected)
                  </button>
                )}
              </div>
              {allTags
                .filter(
                  (t) =>
                    !listSearchQ ||
                    t.toLowerCase().includes(listSearchQ.toLowerCase()),
                )
                .map((tag, idx, arr) => {
                  const isIncluded = includedTags.includes(tag);
                  return (
                    <button
                      key={tag}
                      onClick={() => toggleTag(tag)}
                      className={cn(
                        "flex items-center w-full px-5 min-h-[44px] active:bg-white/5 transition-colors",
                        idx < arr.length - 1 && "border-b border-white/[0.06]",
                      )}
                    >
                      <div
                        className={cn(
                          "w-5 h-5 rounded border-2 flex items-center justify-center mr-3 shrink-0 transition-colors",
                          isIncluded
                            ? "bg-primary border-primary"
                            : "border-muted-foreground/40",
                        )}
                      >
                        {isIncluded && (
                          <Check className="h-3 w-3 text-primary-foreground" />
                        )}
                      </div>
                      <span className="text-[15px] flex-1 text-left">
                        {tag}
                      </span>
                    </button>
                  );
                })}
            </>
          ) : filterDetailKey === "fav" ? (
            <>
              {[
                { value: "all" as const, label: "All" },
                { value: "yes" as const, label: "Favorites only" },
                { value: "no" as const, label: "Not favorites" },
              ].map((opt, idx, arr) => (
                <button
                  key={opt.value}
                  onClick={() => {
                    setFavFilter(opt.value);
                    setFilterDetailKey(null);
                  }}
                  className={cn(
                    "flex items-center w-full px-5 min-h-[44px] active:bg-white/5 transition-colors",
                    idx < arr.length - 1 && "border-b border-white/[0.06]",
                  )}
                >
                  <span
                    className={cn(
                      "text-[15px] flex-1 text-left",
                      favFilter === opt.value && "font-medium",
                    )}
                  >
                    {opt.label}
                  </span>
                  {favFilter === opt.value && (
                    <Check className="h-5 w-5 text-primary shrink-0" />
                  )}
                </button>
              ))}
            </>
          ) : filterDetailKey === "arch" ? (
            <>
              {[
                { value: "active" as const, label: "Active" },
                { value: "archived" as const, label: "Archived only" },
                { value: "both" as const, label: "All" },
              ].map((opt, idx, arr) => (
                <button
                  key={opt.value}
                  onClick={() => {
                    setArchFilter(opt.value);
                    setFilterDetailKey(null);
                  }}
                  className={cn(
                    "flex items-center w-full px-5 min-h-[44px] active:bg-white/5 transition-colors",
                    idx < arr.length - 1 && "border-b border-white/[0.06]",
                  )}
                >
                  <span
                    className={cn(
                      "text-[15px] flex-1 text-left",
                      archFilter === opt.value && "font-medium",
                    )}
                  >
                    {opt.label}
                  </span>
                  {archFilter === opt.value && (
                    <Check className="h-5 w-5 text-primary shrink-0" />
                  )}
                </button>
              ))}
            </>
          ) : (
            <>
              <button
                onClick={() => setFilterDetailKey("show")}
                className="flex items-center w-full px-5 min-h-[52px] active:bg-white/5 transition-colors border-b border-white/[0.06]"
              >
                <span className="text-[15px] font-medium flex-1 text-left">
                  Show
                </span>
                <span
                  className={cn(
                    "text-[15px] mr-1.5 truncate max-w-[180px]",
                    hasTabFilter ? "text-foreground" : "text-muted-foreground",
                  )}
                >
                  {activeTab === "mine"
                    ? "My Agents"
                    : activeTab === "shared"
                      ? "Shared with Me"
                      : "All"}
                </span>
                <ChevronRight className="h-4 w-4 text-muted-foreground/50 shrink-0" />
              </button>
              <button
                onClick={() => setFilterDetailKey("sortBy")}
                className="flex items-center w-full px-5 min-h-[52px] active:bg-white/5 transition-colors border-b border-white/[0.06]"
              >
                <span className="text-[15px] font-medium flex-1 text-left">
                  Sort By
                </span>
                <span
                  className={cn(
                    "text-[15px] mr-1.5 truncate max-w-[180px]",
                    hasSortFilter ? "text-foreground" : "text-muted-foreground",
                  )}
                >
                  {sortOptions.find((o) => o.value === sortBy)?.label}
                </span>
                <ChevronRight className="h-4 w-4 text-muted-foreground/50 shrink-0" />
              </button>
              <button
                onClick={() => setFilterDetailKey("fav")}
                className="flex items-center w-full px-5 min-h-[52px] active:bg-white/5 transition-colors border-b border-white/[0.06]"
              >
                <span className="text-[15px] font-medium flex-1 text-left">
                  Favorites
                </span>
                <span
                  className={cn(
                    "text-[15px] mr-1.5 truncate max-w-[180px]",
                    hasFavFilter ? "text-foreground" : "text-muted-foreground",
                  )}
                >
                  {favFilter === "yes"
                    ? "Favorites"
                    : favFilter === "no"
                      ? "Not Favorites"
                      : "All"}
                </span>
                <ChevronRight className="h-4 w-4 text-muted-foreground/50 shrink-0" />
              </button>
              <button
                onClick={() => setFilterDetailKey("arch")}
                className="flex items-center w-full px-5 min-h-[52px] active:bg-white/5 transition-colors border-b border-white/[0.06]"
              >
                <span className="text-[15px] font-medium flex-1 text-left">
                  Archived
                </span>
                <span
                  className={cn(
                    "text-[15px] mr-1.5 truncate max-w-[180px]",
                    hasArchFilter ? "text-foreground" : "text-muted-foreground",
                  )}
                >
                  {archFilter === "archived"
                    ? "Archived"
                    : archFilter === "both"
                      ? "All"
                      : "Active"}
                </span>
                <ChevronRight className="h-4 w-4 text-muted-foreground/50 shrink-0" />
              </button>
              <button
                onClick={() => setFilterDetailKey("cats")}
                className="flex items-center w-full px-5 min-h-[52px] active:bg-white/5 transition-colors border-b border-white/[0.06]"
              >
                <span className="text-[15px] font-medium flex-1 text-left">
                  Category
                </span>
                <span
                  className={cn(
                    "text-[15px] mr-1.5 truncate max-w-[180px]",
                    hasCatsFilter
                      ? "text-primary font-medium"
                      : "text-muted-foreground",
                  )}
                >
                  {hasCatsFilter ? `${includedCats.length} selected` : "All"}
                </span>
                <ChevronRight className="h-4 w-4 text-muted-foreground/50 shrink-0" />
              </button>
              <button
                onClick={() => setFilterDetailKey("tags")}
                className="flex items-center w-full px-5 min-h-[52px] active:bg-white/5 transition-colors border-b border-white/[0.06]"
              >
                <span className="text-[15px] font-medium flex-1 text-left">
                  Tags
                </span>
                <span
                  className={cn(
                    "text-[15px] mr-1.5 truncate max-w-[180px]",
                    hasTagsFilter
                      ? "text-primary font-medium"
                      : "text-muted-foreground",
                  )}
                >
                  {hasTagsFilter ? `${includedTags.length} selected` : "All"}
                </span>
                <ChevronRight className="h-4 w-4 text-muted-foreground/50 shrink-0" />
              </button>
              <button
                onClick={toggleFavoritesFirst}
                className="flex items-center w-full px-5 min-h-[52px] active:bg-white/5 transition-colors border-b border-white/[0.06]"
              >
                <span className="text-[15px] font-medium flex-1 text-left">
                  Favorites First
                </span>
                <div
                  className={cn(
                    "w-9 h-5 rounded-full relative transition-colors shrink-0",
                    favoritesFirst
                      ? "bg-primary"
                      : "bg-muted border border-border",
                  )}
                >
                  <span
                    className={cn(
                      "absolute top-0.5 w-4 h-4 rounded-full bg-white shadow-sm transition-all",
                      favoritesFirst ? "left-4" : "left-0.5",
                    )}
                  />
                </div>
              </button>
            </>
          )}
        </BottomSheetBody>
      </BottomSheet>

      {/* Delete Confirmation */}
      <AlertDialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle className="text-destructive">
              Delete Agent
            </AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to delete &ldquo;{agentToDelete?.name}
              &rdquo;? This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel
              onClick={() => {
                setDeleteDialogOpen(false);
                setAgentToDelete(null);
              }}
            >
              Cancel
            </AlertDialogCancel>
            <AlertDialogAction
              onClick={handleConfirmDelete}
              className="bg-destructive hover:bg-destructive/90"
            >
              Delete Agent
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
