"use client";

import { useState, useTransition, useMemo, useRef, useEffect } from "react";
import { PromptCard } from "./PromptCard";
import { SharedPromptCard } from "./SharedPromptCard";
import { PromptListItem } from "./PromptListItem";
import { SharedPromptListItem } from "./SharedPromptListItem";
import { MobileActionBar } from "@/components/official/mobile-action-bar/MobileActionBar";
import {
  BottomSheet,
  BottomSheetHeader,
  BottomSheetBody,
} from "@/components/official/bottom-sheet/BottomSheet";
import { Check, ChevronRight, RotateCcw, X, Search } from "lucide-react";
import { DesktopSearchBar } from "./DesktopSearchBar";
import { DesktopFilterPanel } from "./DesktopFilterPanel";
import dynamic from "next/dynamic";

const NewPromptModal = dynamic(
    () => import("./NewPromptModal").then(m => ({ default: m.NewPromptModal })),
    { ssr: false }
);
import { useRouter } from "next/navigation";
import { toast } from "@/lib/toast-service";
import { useIsMobile } from "@/hooks/use-mobile";
import { cn } from "@/lib/utils";
import { Plus, Users, LayoutPanelTop } from "lucide-react";
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
import { useAppDispatch, useAppSelector } from "@/lib/redux/hooks";
import {
  selectAllUserPrompts,
  selectPromptsListStatus,
} from "@/lib/redux/slices/promptCacheSlice";
import {
  deleteUserPrompt,
  duplicateUserPrompt,
  initializeUserPrompts,
} from "@/lib/redux/thunks/promptCrudThunks";
import type { SharedPromptRecord } from "@/lib/redux/slices/promptCacheSlice";
import type { PromptData } from "../../types/core";
import { usePromptConsumer, NONE_SENTINEL } from "../../hooks/usePromptConsumer";
import type { PromptSortOption, FavFilter, ArchFilter } from "../../hooks/usePromptConsumer";
import { usePromptsBasePath } from "../../hooks/usePromptsBasePath";
import {
  makeSelectFilteredPrompts,
  makeSelectFilteredSharedPrompts,
  makeSelectPromptCards,
  makeSelectPromptListItems,
  makeSelectSharedPromptCards,
  makeSelectSharedPromptListItems,
  selectAllCategories,
  selectAllTags,
} from "@/lib/redux/selectors/promptSelectors";

const CONSUMER_ID = "prompts-main";

// ---------------------------------------------------------------------------
// Skeleton
// ---------------------------------------------------------------------------

function PromptsSkeleton({ count = 4 }: { count?: number }) {
  return (
    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
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

// ---------------------------------------------------------------------------
// Main component
// ---------------------------------------------------------------------------

export function PromptsGrid() {
  const dispatch = useAppDispatch();
  const router = useRouter();
  const isMobile = useIsMobile();
  const basePath = usePromptsBasePath();

  useEffect(() => {
    dispatch(initializeUserPrompts());
  }, [dispatch]);

  const listStatus = useAppSelector(selectPromptsListStatus);
  const isLoading  = listStatus === "idle" || listStatus === "loading";

  const cardsLimitValue = isMobile ? 4 : 8;

  const [, startTransition] = useTransition();
  const [navigatingId, setNavigatingId]     = useState<string | null>(null);
  const [deletingIds, setDeletingIds]       = useState<Set<string>>(new Set());
  const [duplicatingIds, setDuplicatingIds] = useState<Set<string>>(new Set());
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [promptToDelete, setPromptToDelete] = useState<{ id: string; name: string } | null>(null);

  // ── Consumer hook (all filter/sort/page state in Redux) ─────────────────────
  const {
    tab:            activeTab,
    sortBy,
    searchTerm,
    includedCats,
    includedTags,
    favFilter,
    archFilter,
    favoritesFirst,
    listPage,
    sharedPage,
    hasActiveFilters,
    isSearching,
    setTab:            setActiveTab,
    setSortBy,
    setSearchTerm,
    setIncludedCats,
    setIncludedTags,
    setFavFilter,
    setArchFilter,
    setFavoritesFirst,
    setListPage,
    setSharedPage,
    resetFilters,
  } = usePromptConsumer(CONSUMER_ID);

  const [isFilterModalOpen, setIsFilterModalOpen] = useState(false);
  const [isNewModalOpen, setIsNewModalOpen]       = useState(false);

  // ── Memoized selector instances (stable per isMobile) ───────────────────────
  const selectFilteredPrompts       = useMemo(() => makeSelectFilteredPrompts(CONSUMER_ID), []);
  const selectFilteredShared        = useMemo(() => makeSelectFilteredSharedPrompts(CONSUMER_ID), []);
  const selectCards                 = useMemo(() => makeSelectPromptCards(CONSUMER_ID, isMobile), [isMobile]);
  const selectListItems             = useMemo(() => makeSelectPromptListItems(CONSUMER_ID, isMobile), [isMobile]);
  const selectSharedCards           = useMemo(() => makeSelectSharedPromptCards(CONSUMER_ID, isMobile), [isMobile]);
  const selectSharedListItems       = useMemo(() => makeSelectSharedPromptListItems(CONSUMER_ID, isMobile), [isMobile]);

  // ── Selectors ────────────────────────────────────────────────────────────────
  const prompts                = useAppSelector(selectAllUserPrompts);
  const filteredPrompts        = useAppSelector(selectFilteredPrompts);
  const filteredSharedPrompts  = useAppSelector(selectFilteredShared);
  const promptCards            = useAppSelector(selectCards);
  const { items: promptListItems, hasMore: hasMorePrompts, totalAfterCards: totalAfterCards } = useAppSelector(selectListItems);
  const sharedPromptCards      = useAppSelector(selectSharedCards);
  const { items: sharedPromptListItems, hasMore: hasMoreShared, totalAfterCards: totalSharedAfterCards } = useAppSelector(selectSharedListItems);
  const allCategories           = useAppSelector(selectAllCategories);
  const allTags                 = useAppSelector(selectAllTags);
  const totalSharedPrompts      = useAppSelector((s) => s.promptCache?.sharedPrompts?.length ?? 0);

  const hasShared = filteredSharedPrompts.length > 0 || totalSharedPrompts > 0;

  // ── Mobile auto-pagination sentinels ────────────────────────────────────────
  const promptSentinelRef = useRef<HTMLDivElement>(null);
  const sharedSentinelRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!isMobile) return;
    const el = promptSentinelRef.current;
    if (!el || !hasMorePrompts) return;
    const observer = new IntersectionObserver(
      ([entry]) => { if (entry.isIntersecting) setListPage(listPage + 1); },
      { rootMargin: "300px" }
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, [isMobile, hasMorePrompts, listPage, setListPage]);

  useEffect(() => {
    if (!isMobile) return;
    const el = sharedSentinelRef.current;
    if (!el || !hasMoreShared) return;
    const observer = new IntersectionObserver(
      ([entry]) => { if (entry.isIntersecting) setSharedPage(sharedPage + 1); },
      { rootMargin: "300px" }
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, [isMobile, hasMoreShared, sharedPage, setSharedPage]);

  // ── Handlers ─────────────────────────────────────────────────────────────────

  const handleDeleteClick = (id: string, name: string) => {
    setPromptToDelete({ id, name });
    setDeleteDialogOpen(true);
  };

  const handleConfirmDelete = async () => {
    if (!promptToDelete) return;
    const { id } = promptToDelete;
    setDeletingIds((prev) => new Set(prev).add(id));
    setDeleteDialogOpen(false);
    setPromptToDelete(null);
    try {
      await dispatch(deleteUserPrompt(id)).unwrap();
      toast.success("Prompt deleted successfully!");
    } catch (error) {
      console.error("Error deleting prompt:", error);
      toast.error("Failed to delete prompt. Please try again.");
    } finally {
      setDeletingIds((prev) => { const next = new Set(prev); next.delete(id); return next; });
    }
  };

  const handleDuplicate = async (id: string) => {
    setDuplicatingIds((prev) => new Set(prev).add(id));
    try {
      await dispatch(duplicateUserPrompt(id)).unwrap();
      toast.success("Prompt duplicated successfully!");
    } catch (error) {
      console.error("Error duplicating prompt:", error);
      toast.error("Failed to duplicate prompt. Please try again.");
    } finally {
      setDuplicatingIds((prev) => { const next = new Set(prev); next.delete(id); return next; });
    }
  };

  const handleDuplicateShared = async (id: string) => {
    setDuplicatingIds((prev) => new Set(prev).add(id));
    try {
      await dispatch(duplicateUserPrompt(id)).unwrap();
      toast.success("Prompt copied to your prompts!");
    } catch (error) {
      console.error("Error copying shared prompt:", error);
      toast.error("Failed to copy prompt. Please try again.");
    } finally {
      setDuplicatingIds((prev) => { const next = new Set(prev); next.delete(id); return next; });
    }
  };

  const handleCancelDelete = () => {
    setDeleteDialogOpen(false);
    setPromptToDelete(null);
  };

  const handleNavigate = (id: string, path: string) => {
    if (navigatingId) return;
    setNavigatingId(id);
    startTransition(() => { router.push(path); });
  };

  // ── Desktop filter badge counts ──────────────────────────────────────────────

  const sortOptions = [
    { value: "updated-desc", label: "Recently Updated" },
    { value: "created-desc", label: "Recently Created" },
    { value: "name-asc",     label: "Name (A-Z)" },
    { value: "name-desc",    label: "Name (Z-A)" },
    { value: "category-asc", label: "Category (A-Z)" },
  ];

  const hasSortFilter  = sortBy     !== "updated-desc";
  const hasShowFilter  = activeTab  !== "mine";
  const hasCatsFilter  = includedCats.length > 0;
  const hasTagsFilter  = includedTags.length > 0;
  const hasFavFilter   = favFilter  !== "all";
  const hasArchFilter  = archFilter !== "active";
  const hasFavFirstOff = !favoritesFirst;

  const activeFilterCount =
    (hasSortFilter  ? 1 : 0) +
    (hasShowFilter  ? 1 : 0) +
    (hasCatsFilter  ? 1 : 0) +
    (hasTagsFilter  ? 1 : 0) +
    (hasFavFilter   ? 1 : 0) +
    (hasArchFilter  ? 1 : 0) +
    (hasFavFirstOff ? 1 : 0);

  // ── Mobile bottom-sheet filter state ────────────────────────────────────────

  const [filterDetailKey, setFilterDetailKey] = useState<string | null>(null);
  const [listSearchQ, setListSearchQ]         = useState("");

  const handleFilterModalChange = (open: boolean) => {
    setIsFilterModalOpen(open);
    if (!open) { setFilterDetailKey(null); setListSearchQ(""); }
  };

  const handleFilterDetailKey = (key: string | null) => {
    setFilterDetailKey(key);
    setListSearchQ("");
  };

  const categoryLabel  = hasCatsFilter ? `${includedCats.length} selected` : "All";
  const tagsLabel      = hasTagsFilter ? `${includedTags.length} selected` : "All";
  const archLabel      = archFilter === "archived" ? "Archived" : archFilter === "both" ? "All" : "Active";
  const favLabel       = favFilter  === "yes"      ? "Favorites" : favFilter === "no" ? "Not Favorites" : "All";
  const otherTabLabel  = activeTab  === "mine"     ? "Shared" : "Mine";
  const otherTabFiltered = activeTab === "mine" ? filteredSharedPrompts : filteredPrompts;

  // ── Render helpers ────────────────────────────────────────────────────────────

  const renderOwnedCards = (cards: PromptData[]) => (
    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
      {cards.map((prompt) => (
        <PromptCard
          key={prompt.id}
          id={prompt.id}
          name={prompt.name}
          description={prompt.description}
          promptData={prompt}
          onDelete={(id) => { const p = prompts.find((x) => x.id === id); if (p) handleDeleteClick(id, p.name); }}
          onDuplicate={handleDuplicate}
          onNavigate={handleNavigate}
          isDeleting={deletingIds.has(prompt.id!)}
          isDuplicating={duplicatingIds.has(prompt.id!)}
          isNavigating={navigatingId === prompt.id}
          isAnyNavigating={navigatingId !== null}
        />
      ))}
    </div>
  );

  const renderOwnedList = (items: PromptData[]) => (
    <div className="mt-6 grid gap-3 grid-cols-1 md:grid-cols-2 lg:grid-cols-3">
      {items.map((prompt) => (
        <PromptListItem
          key={prompt.id}
          id={prompt.id}
          name={prompt.name}
          description={prompt.description}
          promptData={prompt}
          onDelete={(id) => { const p = prompts.find((x) => x.id === id); if (p) handleDeleteClick(id, p.name); }}
          onDuplicate={handleDuplicate}
          onNavigate={handleNavigate}
          isDeleting={deletingIds.has(prompt.id!)}
          isDuplicating={duplicatingIds.has(prompt.id!)}
          isNavigating={navigatingId === prompt.id}
          isAnyNavigating={navigatingId !== null}
        />
      ))}
    </div>
  );

  const renderSharedCards = (cards: SharedPromptRecord[]) => (
    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
      {cards.map((prompt) => (
        <SharedPromptCard
          key={prompt.id}
          id={prompt.id}
          name={prompt.name}
          description={prompt.description}
          permissionLevel={prompt.permissionLevel}
          ownerEmail={prompt.ownerEmail}
          onDuplicate={handleDuplicateShared}
          onNavigate={handleNavigate}
          isDuplicating={duplicatingIds.has(prompt.id)}
          isNavigating={navigatingId === prompt.id}
          isAnyNavigating={navigatingId !== null}
        />
      ))}
    </div>
  );

  const renderSharedList = (items: SharedPromptRecord[]) => (
    <div className="mt-6 grid gap-3 grid-cols-1 md:grid-cols-2 lg:grid-cols-3">
      {items.map((prompt) => (
        <SharedPromptListItem
          key={prompt.id}
          id={prompt.id}
          name={prompt.name}
          description={prompt.description}
          permissionLevel={prompt.permissionLevel}
          ownerEmail={prompt.ownerEmail}
          onDuplicate={handleDuplicateShared}
          onNavigate={handleNavigate}
          isDuplicating={duplicatingIds.has(prompt.id)}
          isNavigating={navigatingId === prompt.id}
          isAnyNavigating={navigatingId !== null}
        />
      ))}
    </div>
  );

  const renderShowMore = (
    remaining: number,
    onMore: () => void,
    sentinelRef: React.RefObject<HTMLDivElement | null>,
  ) =>
    isMobile ? (
      <div ref={sentinelRef} className="h-8" />
    ) : (
      <div className="mt-4 flex justify-center">
        <Button variant="outline" onClick={onMore} className="w-full md:w-auto">
          Show More ({remaining} remaining)
        </Button>
      </div>
    );

  // ── JSX ───────────────────────────────────────────────────────────────────────

  return (
    <>
      {/* Desktop: search bar + integrated filter popover */}
      {!isMobile && (
        <div className="mb-4">
          <div className="flex items-center gap-2">
            <div className="flex-1">
              <DesktopSearchBar
                searchValue={searchTerm}
                onSearchChange={setSearchTerm}
                onNewClick={() => setIsNewModalOpen(true)}
              />
            </div>
          </div>
          <div className="flex items-center justify-between mt-2">
            <div className="flex items-center gap-2">
              {/* Pill tabs (only when shared prompts exist) */}
              {hasShared && (
                <>
                  <button
                    onClick={() => setActiveTab("mine")}
                    className={cn(
                      "flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-medium transition-all active:scale-95",
                      activeTab === "mine"
                        ? "bg-primary text-primary-foreground"
                        : "border border-border text-muted-foreground hover:text-foreground hover:bg-muted",
                    )}
                  >
                    Mine
                    <span className="text-[10px] opacity-70">{filteredPrompts.length}</span>
                  </button>
                  <button
                    onClick={() => setActiveTab("shared")}
                    className={cn(
                      "flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-medium transition-all active:scale-95",
                      activeTab === "shared"
                        ? "bg-primary text-primary-foreground"
                        : "border border-border text-muted-foreground hover:text-foreground hover:bg-muted",
                    )}
                  >
                    Shared
                    <span className="text-[10px] opacity-70">{filteredSharedPrompts.length}</span>
                  </button>
                  <button
                    onClick={() => setActiveTab("all")}
                    className={cn(
                      "flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-medium transition-all active:scale-95",
                      activeTab === "all"
                        ? "bg-primary text-primary-foreground"
                        : "border border-border text-muted-foreground hover:text-foreground hover:bg-muted",
                    )}
                  >
                    All
                    <span className="text-[10px] opacity-70">{filteredPrompts.length + filteredSharedPrompts.length}</span>
                  </button>
                </>
              )}
              {isSearching && (
                <span className="text-xs text-muted-foreground ml-2">
                  {filteredPrompts.length} result{filteredPrompts.length !== 1 ? "s" : ""}
                </span>
              )}
            </div>
            <DesktopFilterPanel
              sortBy={sortBy}
              setSortBy={setSortBy}
              activeTab={activeTab}
              setActiveTab={setActiveTab}
              includedCats={includedCats}
              setIncludedCats={setIncludedCats}
              includedTags={includedTags}
              setIncludedTags={setIncludedTags}
              favFilter={favFilter}
              setFavFilter={setFavFilter}
              archFilter={archFilter}
              setArchFilter={setArchFilter}
              favoritesFirst={favoritesFirst}
              setFavoritesFirst={setFavoritesFirst}
              allCategories={allCategories}
              allTags={allTags}
              resetFilters={resetFilters}
              activeFilterCount={activeFilterCount}
              hasShared={hasShared}
            />
          </div>
        </div>
      )}

      {/* Mobile pill tabs */}
      {isMobile && hasShared && (
        <div className="flex items-center gap-1 mb-3 pl-1">
          <button
            onClick={() => setActiveTab("mine")}
            className={cn(
              "flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-medium transition-all active:scale-95",
              activeTab === "mine"
                ? "bg-primary text-primary-foreground"
                : "border border-border text-muted-foreground hover:text-foreground hover:bg-muted",
            )}
          >
            Mine
            <span className="text-[10px] opacity-70">{filteredPrompts.length}</span>
          </button>
          <button
            onClick={() => setActiveTab("shared")}
            className={cn(
              "flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-medium transition-all active:scale-95",
              activeTab === "shared"
                ? "bg-primary text-primary-foreground"
                : "border border-border text-muted-foreground hover:text-foreground hover:bg-muted",
            )}
          >
            Shared
            <span className="text-[10px] opacity-70">{filteredSharedPrompts.length}</span>
          </button>
          <button
            onClick={() => setActiveTab("all")}
            className={cn(
              "flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-medium transition-all active:scale-95",
              activeTab === "all"
                ? "bg-primary text-primary-foreground"
                : "border border-border text-muted-foreground hover:text-foreground hover:bg-muted",
            )}
          >
            All
            <span className="text-[10px] opacity-70">{filteredPrompts.length + filteredSharedPrompts.length}</span>
          </button>
        </div>
      )}

      {/* Active Tab Content */}
      <div className={cn(isMobile && "pb-24")}>
        {activeTab === "mine" ? (
          <>
            {isLoading ? (
              <PromptsSkeleton count={cardsLimitValue} />
            ) : prompts.length === 0 ? (
              <div className="mb-8">
                <div className="border border-primary/20 rounded-xl p-8 bg-gradient-to-br from-primary/5 to-secondary/5">
                  <div className="flex flex-col items-center text-center space-y-4">
                    <div className="p-4 bg-primary/10 rounded-full">
                      <Plus className="h-8 w-8 text-primary" />
                    </div>
                    <div>
                      <h3 className="text-xl font-semibold mb-2">Create Your First Prompt</h3>
                      <p className="text-muted-foreground">
                        Start from scratch or use a template to build your prompt library
                      </p>
                    </div>
                    <div className="flex flex-col sm:flex-row gap-3 pt-2">
                      <button
                        onClick={() => setIsNewModalOpen(true)}
                        className="inline-flex items-center justify-center rounded-md text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:opacity-50 disabled:pointer-events-none ring-offset-background bg-primary text-primary-foreground hover:bg-primary/90 h-10 py-2 px-4"
                      >
                        <Plus className="h-4 w-4 mr-2" />
                        Create Blank Prompt
                      </button>
                      <button
                        onClick={() => router.push(`${basePath}/templates`)}
                        className="inline-flex items-center justify-center rounded-md text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:opacity-50 disabled:pointer-events-none ring-offset-background border border-input hover:bg-accent hover:text-accent-foreground h-10 py-2 px-4"
                      >
                        <LayoutPanelTop className="h-4 w-4 mr-2" />
                        Browse Templates
                      </button>
                    </div>
                  </div>
                </div>
              </div>
            ) : filteredPrompts.length === 0 ? (
              <div className="text-center py-12">
                <p className="text-muted-foreground">No prompts match your search.</p>
              </div>
            ) : (
              <>
                {promptCards.length > 0 && renderOwnedCards(promptCards)}
                {promptListItems.length > 0 && (
                  <>
                    {renderOwnedList(promptListItems)}
                    {hasMorePrompts &&
                      renderShowMore(
                        totalAfterCards - promptListItems.length,
                        () => setListPage(listPage + 1),
                        promptSentinelRef,
                      )}
                  </>
                )}
              </>
            )}
          </>
        ) : activeTab === "shared" ? (
          <>
            {isLoading ? (
              <PromptsSkeleton count={cardsLimitValue} />
            ) : filteredSharedPrompts.length === 0 ? (
              <div className="text-center py-12">
                <p className="text-muted-foreground">
                  {searchTerm
                    ? "No shared prompts match your search."
                    : "No prompts have been shared with you yet."}
                </p>
              </div>
            ) : (
              <>
                {sharedPromptCards.length > 0 && renderSharedCards(sharedPromptCards)}
                {sharedPromptListItems.length > 0 && (
                  <>
                    {renderSharedList(sharedPromptListItems)}
                    {hasMoreShared &&
                      renderShowMore(
                        totalSharedAfterCards - sharedPromptListItems.length,
                        () => setSharedPage(sharedPage + 1),
                        sharedSentinelRef,
                      )}
                  </>
                )}
              </>
            )}
          </>
        ) : (
          /* All Tab */
          <>
            {filteredPrompts.length > 0 && (
              <>
                {hasShared && (
                  <p className="text-xs font-medium text-muted-foreground mb-3">My Prompts</p>
                )}
                {promptCards.length > 0 && renderOwnedCards(promptCards)}
                {promptListItems.length > 0 && (
                  <>
                    {renderOwnedList(promptListItems)}
                    {hasMorePrompts &&
                      renderShowMore(
                        totalAfterCards - promptListItems.length,
                        () => setListPage(listPage + 1),
                        promptSentinelRef,
                      )}
                  </>
                )}
              </>
            )}

            {filteredPrompts.length > 0 && filteredSharedPrompts.length > 0 && (
              <div className="flex items-center gap-3 my-6">
                <div className="flex-1 border-t border-border" />
                <div className="flex items-center gap-1.5">
                  <Users className="w-3.5 h-3.5 text-muted-foreground" />
                  <span className="text-xs text-muted-foreground font-medium">Shared with me</span>
                </div>
                <div className="flex-1 border-t border-border" />
              </div>
            )}

            {filteredSharedPrompts.length > 0 && (
              <>
                {sharedPromptCards.length > 0 && renderSharedCards(sharedPromptCards)}
                {sharedPromptListItems.length > 0 && (
                  <>
                    {renderSharedList(sharedPromptListItems)}
                    {hasMoreShared &&
                      renderShowMore(
                        totalSharedAfterCards - sharedPromptListItems.length,
                        () => setSharedPage(sharedPage + 1),
                        sharedSentinelRef,
                      )}
                  </>
                )}
              </>
            )}

            {isLoading && <PromptsSkeleton count={cardsLimitValue} />}

            {!isLoading && filteredPrompts.length === 0 && filteredSharedPrompts.length === 0 && (
              <div className="text-center py-12">
                <p className="text-muted-foreground">
                  {searchTerm ? "No prompts match your search." : "You have no prompts yet."}
                </p>
              </div>
            )}
          </>
        )}

        {/* Cross-tab search results */}
        {isSearching && hasShared && activeTab !== "all" && otherTabFiltered.length > 0 && (
          <div className="mt-6 border-t border-border pt-4">
            <div className="flex items-center gap-2 mb-3">
              <Users className="w-4 h-4 text-muted-foreground" />
              <span className="text-xs font-medium text-muted-foreground">
                Also found in {otherTabLabel} ({otherTabFiltered.length})
              </span>
            </div>
            <div className="grid gap-3 grid-cols-1 md:grid-cols-2 lg:grid-cols-3">
              {activeTab === "mine"
                ? (otherTabFiltered as SharedPromptRecord[]).map((prompt) => (
                    <SharedPromptListItem
                      key={prompt.id}
                      id={prompt.id}
                      name={prompt.name}
                      description={prompt.description}
                      permissionLevel={prompt.permissionLevel}
                      ownerEmail={prompt.ownerEmail}
                      onDuplicate={handleDuplicateShared}
                      onNavigate={handleNavigate}
                      isDuplicating={duplicatingIds.has(prompt.id)}
                      isNavigating={navigatingId === prompt.id}
                      isAnyNavigating={navigatingId !== null}
                    />
                  ))
                : (otherTabFiltered as PromptData[]).map((prompt) => (
                    <PromptListItem
                      key={prompt.id}
                      id={prompt.id}
                      name={prompt.name}
                      description={prompt.description}
                      promptData={prompt}
                      onDelete={(id) => { const p = prompts.find((x) => x.id === id); if (p) handleDeleteClick(id, p.name); }}
                      onDuplicate={handleDuplicate}
                      onNavigate={handleNavigate}
                      isDeleting={deletingIds.has(prompt.id!)}
                      isDuplicating={duplicatingIds.has(prompt.id!)}
                      isNavigating={navigatingId === prompt.id}
                      isAnyNavigating={navigatingId !== null}
                    />
                  ))}
            </div>
          </div>
        )}
      </div>

      {/* Mobile Action Bar */}
      <MobileActionBar
        searchValue={searchTerm}
        onSearchChange={setSearchTerm}
        totalCount={prompts.length}
        filteredCount={filteredPrompts.length}
        onPrimaryAction={() => setIsNewModalOpen(true)}
        primaryActionLabel="New Prompt"
        primaryActionIcon={<Plus className="h-5 w-5" />}
        showFilterButton={true}
        showVoiceSearch={true}
        isFilterModalOpen={isFilterModalOpen}
        setIsFilterModalOpen={setIsFilterModalOpen}
        searchPlaceholder="Search prompts..."
      />

      {/* New prompt modal */}
      <NewPromptModal
        isOpen={isNewModalOpen}
        onClose={() => setIsNewModalOpen(false)}
      />

      {/* Mobile Filter Bottom Sheet (inclusion model) */}
      <BottomSheet open={isFilterModalOpen} onOpenChange={handleFilterModalChange} title="Filters">
        <BottomSheetHeader
          title={
            filterDetailKey === "sortBy" ? "Sort By"
            : filterDetailKey === "show" ? "Show"
            : filterDetailKey === "cats" ? "Category"
            : filterDetailKey === "tags" ? "Tags"
            : filterDetailKey === "fav"  ? "Favorites"
            : filterDetailKey === "arch" ? "Archived"
            : "Filters"
          }
          showBack={filterDetailKey !== null}
          onBack={() => handleFilterDetailKey(null)}
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
              {sortOptions.map((option, idx) => (
                <button
                  key={option.value}
                  onClick={() => { setSortBy(option.value as PromptSortOption); handleFilterDetailKey(null); }}
                  className={cn(
                    "flex items-center w-full px-5 min-h-[44px] active:bg-white/5 transition-colors",
                    idx < sortOptions.length - 1 && "border-b border-white/[0.06]",
                  )}
                >
                  <span className={cn("text-[15px] flex-1 text-left", sortBy === option.value && "font-medium")}>
                    {option.label}
                  </span>
                  {sortBy === option.value && <Check className="h-5 w-5 text-primary shrink-0" />}
                </button>
              ))}
            </>
          ) : filterDetailKey === "show" ? (
            <>
              {[
                { value: "mine"   as const, label: "My Prompts" },
                { value: "shared" as const, label: "Shared with Me" },
                { value: "all"    as const, label: "All Prompts" },
              ].map((option, idx, arr) => (
                <button
                  key={option.value}
                  onClick={() => { setActiveTab(option.value); handleFilterDetailKey(null); }}
                  className={cn(
                    "flex items-center w-full px-5 min-h-[44px] active:bg-white/5 transition-colors",
                    idx < arr.length - 1 && "border-b border-white/[0.06]",
                  )}
                >
                  <span className={cn("text-[15px] flex-1 text-left", activeTab === option.value && "font-medium")}>
                    {option.label}
                  </span>
                  {activeTab === option.value && <Check className="h-5 w-5 text-primary shrink-0" />}
                </button>
              ))}
            </>
          ) : filterDetailKey === "cats" ? (
            /* Category (INCLUSION model) */
            <>
              <div
                className="sticky top-0 z-10 px-4 pt-2 pb-3 border-b border-white/[0.06] space-y-2"
                style={{ background: "var(--matrx-glass-bg)", backdropFilter: "blur(20px)" }}
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
                    <button onClick={() => setListSearchQ("")} className="text-muted-foreground hover:text-foreground transition-colors">
                      <X className="h-3.5 w-3.5" />
                    </button>
                  )}
                </div>
                {includedCats.length > 0 && (
                  <button
                    onClick={() => setIncludedCats([])}
                    className="w-full h-8 rounded-lg border border-white/[0.12] text-[13px] font-medium text-primary active:bg-white/10 transition-colors bg-white/[0.04] hover:bg-white/[0.08]"
                  >
                    Clear filter ({includedCats.length} selected)
                  </button>
                )}
              </div>
              <div className="px-4 py-2">
                <p className="text-[12px] text-muted-foreground">
                  Tap to select categories. Only matching prompts will show. No selection = show all.
                </p>
              </div>
              {!listSearchQ && (() => {
                const isIncluded = includedCats.includes(NONE_SENTINEL);
                return (
                  <button
                    onClick={() => setIncludedCats(isIncluded ? includedCats.filter((c) => c !== NONE_SENTINEL) : [...includedCats, NONE_SENTINEL])}
                    className="flex items-center w-full px-5 min-h-[44px] active:bg-white/5 transition-colors border-b border-white/[0.06]"
                  >
                    <div className={cn("w-5 h-5 rounded border-2 flex items-center justify-center mr-3 shrink-0 transition-colors", isIncluded ? "bg-primary border-primary" : "border-muted-foreground/40")}>
                      {isIncluded && <Check className="h-3 w-3 text-primary-foreground" />}
                    </div>
                    <span className="text-[15px] flex-1 text-left italic text-muted-foreground">Uncategorized</span>
                  </button>
                );
              })()}
              {allCategories
                .filter((cat) => !listSearchQ || cat.toLowerCase().includes(listSearchQ.toLowerCase()))
                .map((cat, idx, arr) => {
                  const isIncluded = includedCats.includes(cat);
                  return (
                    <button
                      key={cat}
                      onClick={() => setIncludedCats(isIncluded ? includedCats.filter((c) => c !== cat) : [...includedCats, cat])}
                      className={cn("flex items-center w-full px-5 min-h-[44px] active:bg-white/5 transition-colors", idx < arr.length - 1 && "border-b border-white/[0.06]")}
                    >
                      <div className={cn("w-5 h-5 rounded border-2 flex items-center justify-center mr-3 shrink-0 transition-colors", isIncluded ? "bg-primary border-primary" : "border-muted-foreground/40")}>
                        {isIncluded && <Check className="h-3 w-3 text-primary-foreground" />}
                      </div>
                      <span className="text-[15px] flex-1 text-left">{cat}</span>
                    </button>
                  );
                })}
              {allCategories.length === 0 && (
                <div className="px-5 py-6 text-center text-sm text-muted-foreground">No categories yet</div>
              )}
              {allCategories.length > 0 && listSearchQ && allCategories.filter((c) => c.toLowerCase().includes(listSearchQ.toLowerCase())).length === 0 && (
                <div className="px-5 py-6 text-center text-sm text-muted-foreground">No matching categories</div>
              )}
            </>
          ) : filterDetailKey === "tags" ? (
            /* Tags (INCLUSION model) */
            <>
              <div
                className="sticky top-0 z-10 px-4 pt-2 pb-3 border-b border-white/[0.06] space-y-2"
                style={{ background: "var(--matrx-glass-bg)", backdropFilter: "blur(20px)" }}
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
                    <button onClick={() => setListSearchQ("")} className="text-muted-foreground hover:text-foreground transition-colors">
                      <X className="h-3.5 w-3.5" />
                    </button>
                  )}
                </div>
                {includedTags.length > 0 && (
                  <button
                    onClick={() => setIncludedTags([])}
                    className="w-full h-8 rounded-lg border border-white/[0.12] text-[13px] font-medium text-primary active:bg-white/10 transition-colors bg-white/[0.04] hover:bg-white/[0.08]"
                  >
                    Clear filter ({includedTags.length} selected)
                  </button>
                )}
              </div>
              <div className="px-4 py-2">
                <p className="text-[12px] text-muted-foreground">
                  Tap to select tags. Only matching prompts will show. No selection = show all.
                </p>
              </div>
              {!listSearchQ && (() => {
                const isIncluded = includedTags.includes(NONE_SENTINEL);
                return (
                  <button
                    onClick={() => setIncludedTags(isIncluded ? includedTags.filter((t) => t !== NONE_SENTINEL) : [...includedTags, NONE_SENTINEL])}
                    className="flex items-center w-full px-5 min-h-[44px] active:bg-white/5 transition-colors border-b border-white/[0.06]"
                  >
                    <div className={cn("w-5 h-5 rounded border-2 flex items-center justify-center mr-3 shrink-0 transition-colors", isIncluded ? "bg-primary border-primary" : "border-muted-foreground/40")}>
                      {isIncluded && <Check className="h-3 w-3 text-primary-foreground" />}
                    </div>
                    <span className="text-[15px] flex-1 text-left italic text-muted-foreground">No tags</span>
                  </button>
                );
              })()}
              {allTags
                .filter((tag) => !listSearchQ || tag.toLowerCase().includes(listSearchQ.toLowerCase()))
                .map((tag, idx, arr) => {
                  const isIncluded = includedTags.includes(tag);
                  return (
                    <button
                      key={tag}
                      onClick={() => setIncludedTags(isIncluded ? includedTags.filter((t) => t !== tag) : [...includedTags, tag])}
                      className={cn("flex items-center w-full px-5 min-h-[44px] active:bg-white/5 transition-colors", idx < arr.length - 1 && "border-b border-white/[0.06]")}
                    >
                      <div className={cn("w-5 h-5 rounded border-2 flex items-center justify-center mr-3 shrink-0 transition-colors", isIncluded ? "bg-primary border-primary" : "border-muted-foreground/40")}>
                        {isIncluded && <Check className="h-3 w-3 text-primary-foreground" />}
                      </div>
                      <span className="text-[15px] flex-1 text-left">{tag}</span>
                    </button>
                  );
                })}
              {allTags.length === 0 && (
                <div className="px-5 py-6 text-center text-sm text-muted-foreground">No tags yet</div>
              )}
              {allTags.length > 0 && listSearchQ && allTags.filter((t) => t.toLowerCase().includes(listSearchQ.toLowerCase())).length === 0 && (
                <div className="px-5 py-6 text-center text-sm text-muted-foreground">No matching tags</div>
              )}
            </>
          ) : filterDetailKey === "fav" ? (
            <>
              {(
                [
                  { value: "all" as const, label: "All" },
                  { value: "yes" as const, label: "Favorites only" },
                  { value: "no"  as const, label: "Not favorites" },
                ] satisfies { value: FavFilter; label: string }[]
              ).map((opt, idx, arr) => (
                <button
                  key={opt.value}
                  onClick={() => { setFavFilter(opt.value); handleFilterDetailKey(null); }}
                  className={cn("flex items-center w-full px-5 min-h-[44px] active:bg-white/5 transition-colors", idx < arr.length - 1 && "border-b border-white/[0.06]")}
                >
                  <span className={cn("text-[15px] flex-1 text-left", favFilter === opt.value && "font-medium")}>{opt.label}</span>
                  {favFilter === opt.value && <Check className="h-5 w-5 text-primary shrink-0" />}
                </button>
              ))}
            </>
          ) : filterDetailKey === "arch" ? (
            <>
              {(
                [
                  { value: "active"   as const, label: "Active (not archived)" },
                  { value: "archived" as const, label: "Archived only" },
                  { value: "both"     as const, label: "All (active + archived)" },
                ] satisfies { value: ArchFilter; label: string }[]
              ).map((opt, idx, arr) => (
                <button
                  key={opt.value}
                  onClick={() => { setArchFilter(opt.value); handleFilterDetailKey(null); }}
                  className={cn("flex items-center w-full px-5 min-h-[44px] active:bg-white/5 transition-colors", idx < arr.length - 1 && "border-b border-white/[0.06]")}
                >
                  <span className={cn("text-[15px] flex-1 text-left", archFilter === opt.value && "font-medium")}>{opt.label}</span>
                  {archFilter === opt.value && <Check className="h-5 w-5 text-primary shrink-0" />}
                </button>
              ))}
            </>
          ) : (
            /* Main filter menu */
            <>
              <button onClick={() => handleFilterDetailKey("show")} className="flex items-center w-full px-5 min-h-[52px] active:bg-white/5 transition-colors border-b border-white/[0.06]">
                <span className="text-[15px] font-medium flex-1 text-left">Show</span>
                <span className={cn("text-[15px] mr-1.5 truncate max-w-[180px]", hasShowFilter ? "text-foreground" : "text-muted-foreground")}>
                  {activeTab === "mine" ? "My Prompts" : activeTab === "shared" ? "Shared with Me" : "All"}
                </span>
                <ChevronRight className="h-4 w-4 text-muted-foreground/50 shrink-0" />
              </button>

              <button onClick={() => handleFilterDetailKey("sortBy")} className="flex items-center w-full px-5 min-h-[52px] active:bg-white/5 transition-colors border-b border-white/[0.06]">
                <span className="text-[15px] font-medium flex-1 text-left">Sort By</span>
                <span className={cn("text-[15px] mr-1.5 truncate max-w-[180px]", hasSortFilter ? "text-foreground" : "text-muted-foreground")}>
                  {sortOptions.find((o) => o.value === sortBy)?.label}
                </span>
                <ChevronRight className="h-4 w-4 text-muted-foreground/50 shrink-0" />
              </button>

              <button onClick={() => handleFilterDetailKey("fav")} className="flex items-center w-full px-5 min-h-[52px] active:bg-white/5 transition-colors border-b border-white/[0.06]">
                <span className="text-[15px] font-medium flex-1 text-left">Favorites</span>
                <span className={cn("text-[15px] mr-1.5 truncate max-w-[180px]", hasFavFilter ? "text-foreground" : "text-muted-foreground")}>{favLabel}</span>
                <ChevronRight className="h-4 w-4 text-muted-foreground/50 shrink-0" />
              </button>

              <button onClick={() => handleFilterDetailKey("arch")} className="flex items-center w-full px-5 min-h-[52px] active:bg-white/5 transition-colors border-b border-white/[0.06]">
                <span className="text-[15px] font-medium flex-1 text-left">Archived</span>
                <span className={cn("text-[15px] mr-1.5 truncate max-w-[180px]", hasArchFilter ? "text-foreground" : "text-muted-foreground")}>{archLabel}</span>
                <ChevronRight className="h-4 w-4 text-muted-foreground/50 shrink-0" />
              </button>

              <button onClick={() => handleFilterDetailKey("cats")} className="flex items-center w-full px-5 min-h-[52px] active:bg-white/5 transition-colors border-b border-white/[0.06]">
                <span className="text-[15px] font-medium flex-1 text-left">Category</span>
                <span className={cn("text-[15px] mr-1.5 truncate max-w-[180px]", hasCatsFilter ? "text-primary font-medium" : "text-muted-foreground")}>{categoryLabel}</span>
                <ChevronRight className="h-4 w-4 text-muted-foreground/50 shrink-0" />
              </button>

              <button onClick={() => handleFilterDetailKey("tags")} className="flex items-center w-full px-5 min-h-[52px] active:bg-white/5 transition-colors border-b border-white/[0.06]">
                <span className="text-[15px] font-medium flex-1 text-left">Tags</span>
                <span className={cn("text-[15px] mr-1.5 truncate max-w-[180px]", hasTagsFilter ? "text-primary font-medium" : "text-muted-foreground")}>{tagsLabel}</span>
                <ChevronRight className="h-4 w-4 text-muted-foreground/50 shrink-0" />
              </button>

              <button onClick={() => setFavoritesFirst(!favoritesFirst)} className="flex items-center w-full px-5 min-h-[52px] active:bg-white/5 transition-colors border-b border-white/[0.06]">
                <span className="text-[15px] font-medium flex-1 text-left">Favorites First</span>
                <div className={cn("w-9 h-5 rounded-full relative transition-colors shrink-0", favoritesFirst ? "bg-primary" : "bg-muted border border-border")}>
                  <span className={cn("absolute top-0.5 w-4 h-4 rounded-full bg-white shadow-sm transition-all", favoritesFirst ? "left-4" : "left-0.5")} />
                </div>
              </button>

              {activeFilterCount > 0 && (
                <div className="pt-4 pb-2">
                  <p className="text-[13px] text-muted-foreground text-center">
                    {activeFilterCount} active {activeFilterCount === 1 ? "filter" : "filters"}
                  </p>
                </div>
              )}
            </>
          )}
        </BottomSheetBody>
      </BottomSheet>

      {/* Delete Confirmation Dialog */}
      <AlertDialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle className="text-destructive">Delete Prompt</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to delete &ldquo;{promptToDelete?.name}&rdquo;? This action cannot be undone and will permanently remove the prompt from your account.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel onClick={handleCancelDelete}>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={handleConfirmDelete} className="bg-destructive hover:bg-destructive/90">
              Delete Prompt
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
