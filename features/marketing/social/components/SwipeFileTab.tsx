"use client";

/**
 * Swipe file (UI-SPEC §5) — Foreplay-class: a collections rail, a masonry of
 * saved posts and ads, filters (type, platform, format, tag, date saved,
 * search), a note/tags/collections sheet per item, Save link, and bulk
 * actions (add to collection, transcribe with an estimate first).
 *
 * Archive, never delete: an archived collection leaves the rail and comes back
 * under "Show archived" with Restore; its items stay saved.
 *
 * Not here (open): `Add to board` — the board has no tile that can hold a
 * specific saved post or ad yet (board-tiles lane); the bulk bar gains the
 * action when it does.
 */

import Link from "next/link";
import { useMemo, useState } from "react";
import { Archive, Bookmark, FolderPlus, Link2, MoreHorizontal, RotateCcw, Tag } from "lucide-react";

import { Button, EmptyState, RegionSkeleton, SearchField, SegmentedControl, Select, type SelectOption } from "@ai-matrx/design-system/controls";
import { confirm } from "@/components/dialogs/confirm/ConfirmDialogHost";
import { ErrorAlchemyMenu } from "@/components/errors/ErrorAlchemyMenu";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { toast } from "@/lib/toast";
import { useMarketingBrand } from "@/features/marketing/lib/brand-context";
import { useSurfaceClientTools, useSurfaceRuntimeRegistration, useSurfaceWriteHandlers, type SurfaceWriteHandlerEntry } from "@ai-matrx/chat/surfaces/runtime/SurfaceRuntimeContext";
import { collectionWriteHandlers } from "@ai-matrx/chat/surfaces/runtime/collection-write-targets";
import { refuseSurfaceWrite } from "@ai-matrx/chat/surfaces/runtime/surface-writeback";
import { parseCreateSwipeLinks, parseUpdateSwipeCollections, parseUpdateSwipeItems } from "../agent-writes";
import { countOf, saveLinkToSwipe, withCostOn } from "../social-actions";
import { xmlElement, xmlList } from "@ai-matrx/chat/surfaces/runtime/context-bundle";
import {
  SOCIAL_SWIPE_SURFACE_NAME,
  SOCIAL_SWIPE_TOOLS,
  createSocialSwipeScope,
} from "@/features/surfaces/manifests/marketing-social-tabs.manifest";
import { cn } from "@/lib/utils";

import { useAllSwipeCollections, useInvalidateSocial, useSwipeItems } from "../hooks";
import { useSocialSpend } from "../cost";
import { createCollection, getTranscript, setItemNotes, socialErrorMessage } from "../server";
import { readTranscribedPostIds, renameCollection, setCollectionArchived, setCollectionBrand } from "../service";
import {
  ALL_SAVED,
  DEFAULT_SWIPE_FILTERS,
  collectionCounts,
  collectionsForBrandScope,
  filterSwipeItems,
  itemNote,
  itemTags,
  otherCollectionCount,
  swipeFacets,
  visibleCollections,
  type SwipeBrandScope,
  type SwipeDateRange,
  type SwipeFilters,
  type SwipeTypeFilter,
} from "../swipe";
import { isAdLibrary, isSocialPlatform, type PostCardModel, type SwipeItem } from "../types";
import { AdCard, libraryLabel } from "./AdCard";
import { useOpenPost } from "../useOpenPost";
import { platformLabel } from "./PlatformMark";
import { accountHref } from "../account-href";
import { useSocials } from "./SocialsContext";
import { SocialPostCard } from "./SocialPostCard";
import { CollectionNameDialog, SaveLinkDialog, SaveToCollectionDialog } from "./SwipeDialogs";
import { SwipeItemSheet } from "./SwipeItemSheet";

const TYPE_DATA = [
  { value: "all", label: "All" },
  { value: "posts", label: "Posts" },
  { value: "ads", label: "Ads" },
] as const;

const SAVED_OPTIONS: SelectOption<SwipeDateRange>[] = [
  { value: "any", label: "Any time" },
  { value: "7d", label: "Last 7 days" },
  { value: "30d", label: "Last 30 days" },
  { value: "90d", label: "Last 90 days" },
];

/** The platform filter speaks post platforms and ad libraries alike. */
function platformOptionLabel(value: string): string {
  return isAdLibrary(value) && !isSocialPlatform(value) ? libraryLabel(value) : platformLabel(value);
}

function chip(active: boolean) {
  return cn(
    "flex min-w-0 items-center justify-between gap-2 rounded-md px-2 py-1 text-left text-xs",
    active ? "bg-accent text-foreground" : "text-muted-foreground hover:bg-accent/50 hover:text-foreground",
  );
}

export function SwipeFileTab() {
  const { brandId, organizationId, canEdit } = useSocials();
  const { costText, agentCostText } = useSocialSpend(organizationId);
  const invalidate = useInvalidateSocial();
  const collections = useAllSwipeCollections();
  const [showArchived, setShowArchived] = useState(false);
  const [filters, setFilters] = useState<SwipeFilters>(DEFAULT_SWIPE_FILTERS);
  const [selected, setSelected] = useState<ReadonlySet<string>>(new Set());
  const [sheetKey, setSheetKey] = useState<string | null>(null);
  const openInPanel = useOpenPost();
  const [nameDialog, setNameDialog] = useState<{ mode: "create" } | { mode: "rename"; id: string; name: string } | null>(null);
  const [linkOpen, setLinkOpen] = useState(false);
  const [bulkSaveOpen, setBulkSaveOpen] = useState(false);
  const [bulkBusy, setBulkBusy] = useState(false);
  const [bulkError, setBulkError] = useState<{ message: string; failure: unknown } | null>(null);

  const [brandScope, setBrandScope] = useState<SwipeBrandScope>("brand");
  const everything = collections.data ?? [];
  const all = useMemo(() => collectionsForBrandScope(everything, brandId, brandScope), [everything, brandId, brandScope]);
  const otherCount = useMemo(() => otherCollectionCount(everything, brandId), [everything, brandId]);
  const live = useMemo(() => visibleCollections(all, false), [all]);
  const archived = useMemo(() => visibleCollections(all, true), [all]);
  const liveIds = useMemo(() => live.map((c) => c.id), [live]);
  const itemsEnabled = collections.isSuccess && liveIds.length > 0;
  const itemsQuery = useSwipeItems(liveIds, itemsEnabled);
  const items = useMemo(() => itemsQuery.data?.items ?? [], [itemsQuery.data]);

  const scope = filters.scope === ALL_SAVED || liveIds.includes(filters.scope) ? filters.scope : ALL_SAVED;
  const effective = scope === filters.scope ? filters : { ...filters, scope };
  const counts = useMemo(() => collectionCounts(items), [items]);
  const facets = useMemo(() => swipeFacets(items, scope), [items, scope]);
  const shown = useMemo(() => filterSwipeItems(items, effective), [items, effective]);
  const sheetItem = items.find((i) => i.key === sheetKey) ?? null;
  const selectedItems = shown.filter((i) => selected.has(i.key));
  const hasFilters = JSON.stringify({ ...effective, scope: ALL_SAVED }) !== JSON.stringify(DEFAULT_SWIPE_FILTERS);

  const set = (patch: Partial<SwipeFilters>) => setFilters({ ...effective, ...patch });
  const toggle = (key: string) =>
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });

  const platformOptions: SelectOption[] = [
    { value: "all", label: "All platforms" },
    ...facets.platforms.map((f) => ({ value: f.value, label: platformOptionLabel(f.value), meta: String(f.count) })),
  ];
  const formatOptions: SelectOption[] = [
    { value: "all", label: "All formats" },
    ...facets.formats.map((f) => ({ value: f.value, label: f.value, meta: String(f.count) })),
  ];
  const tagOptions: SelectOption[] = [
    { value: "all", label: "All tags" },
    ...facets.tags.map((f) => ({ value: f.value, label: f.value, meta: String(f.count) })),
  ];

  async function archive(id: string, name: string) {
    const ok = await confirm({
      title: `Archive ${name}?`,
      description: "It leaves the list. Everything saved in it is kept, and Show archived brings it back.",
      confirmLabel: "Archive",
      variant: "destructive",
    });
    if (!ok) return;
    try {
      await setCollectionArchived(id, true);
      if (filters.scope === id) setFilters({ ...filters, scope: ALL_SAVED });
      await invalidate();
      toast.success("Archived");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Couldn't archive");
    }
  }

  async function linkBrand(id: string, next: string | null) {
    try {
      await setCollectionBrand(id, next);
      await invalidate();
      toast.success(next ? "Linked to this brand" : "Unlinked from this brand");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Couldn't update the collection");
    }
  }

  async function restore(id: string) {
    try {
      await setCollectionArchived(id, false);
      await invalidate();
      toast.success("Restored");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Couldn't restore");
    }
  }

  async function bulkTranscribe() {
    const posts = selectedItems.filter((i) => i.post).map((i) => i.itemId);
    if (posts.length === 0) {
      toast.error("Select at least one post");
      return;
    }
    setBulkError(null);
    setBulkBusy(true);
    try {
      const done = await readTranscribedPostIds(posts);
      const todo = posts.filter((id) => !done.has(id));
      if (todo.length === 0) {
        toast.success("Every selected post already has a transcript");
        return;
      }
      const ok = await confirm({
        title: `Transcribe ${todo.length} ${todo.length === 1 ? "post" : "posts"}?`,
        description: [costText("transcript", todo.length), done.size ? `${done.size} already transcribed ${done.size === 1 ? "is" : "are"} skipped.` : null].filter(Boolean).join(" · ") || undefined,
        confirmLabel: "Transcribe",
        variant: "destructive",
      });
      if (!ok) return;
      let failed = 0;
      let lastError: unknown = null;
      for (const id of todo) {
        try {
          await getTranscript(id, { organizationId });
        } catch (err) {
          failed += 1;
          lastError = err;
        }
      }
      await invalidate();
      if (failed) {
        setBulkError({ message: `${failed} of ${todo.length} failed: ${socialErrorMessage(lastError, "Transcript failed")}`, failure: lastError });
      } else {
        toast.success(`Transcribed ${todo.length}`);
      }
    } catch (err) {
      setBulkError({ message: socialErrorMessage(err, "Couldn't transcribe"), failure: err });
    } finally {
      setBulkBusy(false);
    }
  }

  // The agent surface: built from what is already on screen (never a fetch).
  const brandName = useMarketingBrand().name;
  const noteOf = (i: SwipeItem) => itemNote(i, scope);
  const tagsOf = (i: SwipeItem) => itemTags(i, scope);
  useSurfaceRuntimeRegistration({
    surfaceName: SOCIAL_SWIPE_SURFACE_NAME,
    isEditable: false,
    getScope: () =>
      createSocialSwipeScope(
        collections.isError || itemsQuery.isError
          ? {
              swipe_loaded: false,
              load_error: socialErrorMessage(collections.error ?? itemsQuery.error, "Could not read the swipe file."),
              brand_id: brandId,
              brand_name: brandName,
            }
          : // A disabled query (no live collection) stays isPending forever: the brand has
            // no items, which is loaded-and-empty, never "still loading" (2026-10-10).
            collections.isPending || (itemsEnabled && itemsQuery.isPending)
            ? ({ swipe_loaded: false, brand_id: brandId, brand_name: brandName } as never)
            : {
                swipe_loaded: true,
                brand_id: brandId,
                brand_name: brandName,
                collections: live.map((c) => ({
                  id: c.id,
                  name: c.name,
                  item_count: counts.get(c.id) ?? 0,
                  linked_to_brand: c.brand_id === brandId,
                })),
                archived_collections: archived.map((c) => ({ id: c.id, name: c.name })),
                scope,
                filters: {
                  search: effective.search,
                  type: effective.type,
                  platform: effective.platform,
                  format: effective.format,
                  tag: effective.tag,
                  saved: effective.saved,
                },
                item_count: shown.length,
                item_list: xmlList(
                  "swipe_items",
                  shown,
                  (i) =>
                    xmlElement("item", {
                      key: i.key,
                      type: i.itemType,
                      platform: i.platform,
                      title: i.title,
                      handle: i.post?.handle ?? i.ad?.advertiser,
                      note: noteOf(i),
                      tags: tagsOf(i).join(","),
                    }),
                  { maxRows: 30, attrs: { brand: brandName } },
                ),
                items: shown.map((i) => ({
                  key: i.key,
                  item_type: i.itemType,
                  item_id: i.itemId,
                  platform: i.platform,
                  title: i.title,
                  handle: i.post?.handle ?? i.ad?.advertiser ?? null,
                  url: i.post?.url ?? i.ad?.libraryUrl ?? null,
                  note: noteOf(i),
                  tags: tagsOf(i),
                  collections: i.edges.map((e) => e.collectionId),
                })),
              },
      ),
  });
  useSurfaceClientTools(SOCIAL_SWIPE_SURFACE_NAME, {
    [SOCIAL_SWIPE_TOOLS.setFilters]: (input) => {
      const a = (input ?? {}) as Record<string, unknown>;
      const patch: Partial<SwipeFilters> = {};
      if (typeof a.search === "string") patch.search = a.search;
      if (a.type === "all" || a.type === "posts" || a.type === "ads") patch.type = a.type;
      if (typeof a.platform === "string") patch.platform = a.platform;
      if (typeof a.format === "string") patch.format = a.format;
      if (typeof a.tag === "string") patch.tag = a.tag;
      if (typeof a.collection_id === "string") patch.scope = a.collection_id === "all" ? ALL_SAVED : a.collection_id;
      set(patch);
      return "Filters updated.";
    },
    [SOCIAL_SWIPE_TOOLS.openItem]: (input) => {
      const key = String((input as { key?: unknown } | null)?.key ?? "");
      if (!items.some((i) => i.key === key)) throw new Error("That item is not saved here. Use a key from items.");
      setSheetKey(key);
      return "Opened the item.";
    },
    [SOCIAL_SWIPE_TOOLS.newCollection]: async (input) => {
      const name = String((input as { name?: unknown } | null)?.name ?? "").trim();
      if (!name) throw new Error("Name the collection.");
      const made = await createCollection({ name, brandId }, { organizationId });
      setFilters({ ...effective, scope: made.collection_id });
      await invalidate();
      return { id: made.collection_id, name };
    },
  });

  // Agent writes: Save link, Rename / Archive / Restore a collection, an item's note and tags — the
  // same saves the dialogs and the item sheet call. Each is approved on a card first.
  const collectionRefs = [...live, ...archived].map((c) => ({ id: c.id, name: c.name }));
  const swipeHandlers: Record<string, SurfaceWriteHandlerEntry> = {
    ...collectionWriteHandlers(
      {
        plural: "swipe_links",
        singular: "link",
        create: {
          parse: (value) => parseCreateSwipeLinks(value, liveIds),
          run: async (plan) => {
            const saved = await saveLinkToSwipe({ ...plan, brandId, organizationId });
            await invalidate();
            return { id: saved.postId, name: plan.url };
          },
          nameOf: (plan) => plan.url,
        },
      },
      refuseSurfaceWrite,
    ),
    ...collectionWriteHandlers(
      {
        plural: "swipe_collections",
        singular: "collection",
        update: {
          parse: (value) => parseUpdateSwipeCollections(value, collectionRefs),
          run: async (plan) => {
            if (plan.rename) await renameCollection(plan.id, plan.rename);
            if (plan.archived !== null) await setCollectionArchived(plan.id, plan.archived);
            if (plan.archived && filters.scope === plan.id) setFilters({ ...filters, scope: ALL_SAVED });
            await invalidate();
            return { id: plan.id, name: plan.rename ?? plan.name };
          },
          nameOf: (plan) => plan.name,
          changedOf: (plan) => [...(plan.rename ? ["name"] : []), ...(plan.archived !== null ? ["archived"] : [])],
        },
      },
      refuseSurfaceWrite,
    ),
    ...collectionWriteHandlers(
      {
        plural: "swipe_items",
        singular: "item",
        update: {
          parse: (value) => parseUpdateSwipeItems(value, items),
          run: async (plan) => {
            await setItemNotes(
              plan.collectionId,
              { itemType: plan.itemType as SwipeItem["itemType"], itemId: plan.itemId, note: plan.note, tags: plan.tags },
              { organizationId },
            );
            await invalidate();
            return { id: plan.key, name: plan.key };
          },
          nameOf: (plan) => plan.key,
          changedOf: () => ["note", "tags"],
        },
      },
      refuseSurfaceWrite,
    ),
  };
  // The cost wraps the COMPLETE set: reading it from inside its own literal threw
  // "Cannot access 'swipeWrites' before initialization" and took the whole tab down (2026-10-10).
  const swipeWrites: Record<string, SurfaceWriteHandlerEntry> = {
    ...swipeHandlers,
    // The approval card names the points, however small (one fetch per link).
    ...withCostOn(() => swipeHandlers)("create_swipe_links", (value) => agentCostText("save_link", countOf(value))),
  };
  useSurfaceWriteHandlers(SOCIAL_SWIPE_SURFACE_NAME, swipeWrites);

  if (collections.isPending) {
    return <RegionSkeleton shape="cards" count={6} />;
  }
  if (collections.isError) {
    return (
      <div className="flex flex-col items-start gap-2 p-3">
        <p className="flex items-center gap-1 text-sm">
          Couldn&apos;t load the swipe file
          <ErrorAlchemyMenu error={collections.error} operation="load swipe collections" />
        </p>
        <Button variant="outline" onClick={() => void collections.refetch()}>
          Retry
        </Button>
      </div>
    );
  }

  const empty = live.length === 0 || (items.length === 0 && !itemsQuery.isPending);

  return (
    <div className="matrx-touch-targets grid gap-3 lg:grid-cols-[14rem_minmax(0,1fr)]">
      {/* Rail */}
      <aside className="flex min-w-0 flex-col gap-0.5" aria-label="Collections">
        <SegmentedControl
          aria-label="Collections shown"
          value={brandScope}
          data={[{ value: "brand", label: "This brand" }, { value: "all", label: "All collections" }]}
          onValueChange={(v) => setBrandScope(v as SwipeBrandScope)}
        />
        <button type="button" className={chip(scope === ALL_SAVED)} onClick={() => set({ scope: ALL_SAVED })}>
          <span className="truncate">All saved</span>
          <span className="tabular-nums">{counts.get(ALL_SAVED) ?? 0}</span>
        </button>
        {live.map((c) => (
          <div key={c.id} className={cn(chip(scope === c.id), "p-0")}>
            <button type="button" className="flex min-w-0 flex-1 items-center justify-between gap-2 px-2 py-1 text-left" onClick={() => set({ scope: c.id })}>
              <span className="truncate" title={c.name}>
                {c.name}
              </span>
              <span className="tabular-nums">{counts.get(c.id) ?? 0}</span>
            </button>
            {canEdit ? (
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <button type="button" aria-label={`${c.name} actions`} className="mr-1 inline-flex h-5 w-5 shrink-0 items-center justify-center rounded text-muted-foreground hover:text-foreground">
                  <MoreHorizontal className="h-4 w-4" />
                </button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                <DropdownMenuItem onSelect={() => setNameDialog({ mode: "rename", id: c.id, name: c.name })}>Rename</DropdownMenuItem>
                <DropdownMenuItem onSelect={() => void linkBrand(c.id, c.brand_id === brandId ? null : brandId)}>
                  <Tag className="mr-2 h-4 w-4" />
                  {c.brand_id === brandId ? "Unlink from this brand" : "Link to this brand"}
                </DropdownMenuItem>
                <DropdownMenuItem onSelect={() => void archive(c.id, c.name)}>
                  <Archive className="mr-2 h-4 w-4" />
                  Archive
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
            ) : null}
          </div>
        ))}
        {canEdit ? (
          <div className="pt-1">
            <Button variant="quiet" icon={<FolderPlus />} onClick={() => setNameDialog({ mode: "create" })}>
              New collection
            </Button>
          </div>
        ) : null}
        {archived.length || showArchived ? (
          <div className="pt-2">
            <Button variant="quiet" onClick={() => setShowArchived(!showArchived)} meta={String(archived.length)}>
              {showArchived ? "Hide archived" : "Show archived"}
            </Button>
            {showArchived
              ? archived.map((c) => (
                  <div key={c.id} className="flex items-center justify-between gap-2 px-2 py-1 text-xs text-muted-foreground">
                    <span className="truncate" title={c.name}>
                      {c.name}
                    </span>
                    <Button variant="quiet" icon={<RotateCcw />} onClick={() => void restore(c.id)}>
                      Restore
                    </Button>
                  </div>
                ))
              : null}
          </div>
        ) : null}
      </aside>

      {/* Main */}
      <div className="flex min-w-0 flex-col gap-3">
        <div className="flex flex-wrap items-center gap-2">
          <SearchField
            aria-label="Search saved"
            placeholder="Search saved"
            value={effective.search}
            onChange={(e) => set({ search: e.target.value })}
            className="min-w-40 flex-1"
          />
          <SegmentedControl aria-label="Type" value={effective.type} data={TYPE_DATA} onValueChange={(v) => set({ type: v as SwipeTypeFilter })} />
          <Select aria-label="Platform" value={effective.platform} options={platformOptions} onValueChange={(v) => set({ platform: v })} />
          <Select aria-label="Format" value={effective.format} options={formatOptions} onValueChange={(v) => set({ format: v })} />
          <Select aria-label="Tag" value={effective.tag} options={tagOptions} onValueChange={(v) => set({ tag: v })} />
          <Select aria-label="Date saved" value={effective.saved} options={SAVED_OPTIONS} onValueChange={(v) => set({ saved: v })} />
          {hasFilters ? (
            <Button variant="quiet" onClick={() => setFilters({ ...DEFAULT_SWIPE_FILTERS, scope })}>
              Clear
            </Button>
          ) : null}
          {canEdit ? (
            <Button variant="primary" icon={<Link2 />} onClick={() => setLinkOpen(true)}>
              Save link
            </Button>
          ) : null}
        </div>

        {selected.size > 0 ? (
          <div className="flex flex-wrap items-center gap-2 rounded-lg border border-border bg-card px-2 py-1.5" role="toolbar" aria-label="Bulk actions">
            <span className="text-xs tabular-nums text-foreground">{selected.size} selected</span>
            {canEdit ? (
              <>
                <Button variant="outline" icon={<Bookmark />} onClick={() => setBulkSaveOpen(true)} disabled={bulkBusy}>
                  Add to collection
                </Button>
                <Button variant="outline" onClick={() => void bulkTranscribe()} disabled={bulkBusy}>
                  {bulkBusy ? "Working…" : "Transcribe"}
                </Button>
              </>
            ) : null}
            <Button variant="quiet" onClick={() => setSelected(new Set())}>
              Clear selection
            </Button>
            {bulkError ? (
              <span className="flex items-center gap-1 text-xs text-destructive">
                {bulkError.message}
                <ErrorAlchemyMenu error={bulkError.failure} operation="bulk transcribe" />
              </span>
            ) : null}
          </div>
        ) : null}

        {itemsQuery.isError ? (
          <div className="flex flex-col items-start gap-2 p-3">
            <p className="flex items-center gap-1 text-sm">
              Couldn&apos;t load saved items
              <ErrorAlchemyMenu error={itemsQuery.error} operation="load swipe items" />
            </p>
            <Button variant="outline" onClick={() => void itemsQuery.refetch()}>
              Retry
            </Button>
          </div>
        ) : empty ? (
          <div className="flex min-h-[40vh] items-center justify-center">
            <EmptyState
              icon={<Bookmark className="h-5 w-5" />}
              title="Nothing saved"
              line={live.length === 0 ? "Create a collection, or save a link" : "Save a link, or use the extension"}
              action={
                <div className="flex flex-wrap justify-center gap-2">
                  {brandScope === "brand" && otherCount > 0 ? (
                    <Button variant="outline" onClick={() => setBrandScope("all")}>
                      Show all collections ({otherCount})
                    </Button>
                  ) : null}
                  <Button variant="outline" asChild>
                    <Link href="/extend" target="_blank">
                      Get the Chrome extension
                    </Link>
                  </Button>
                </div>
              }
            />
          </div>
        ) : itemsQuery.isPending ? (
          <RegionSkeleton shape="cards" count={6} />
        ) : shown.length === 0 ? (
          <div className="flex min-h-[30vh] items-center justify-center">
            <EmptyState
              icon={<Bookmark className="h-5 w-5" />}
              title="No matches"
              action={
                <Button variant="outline" onClick={() => setFilters({ ...DEFAULT_SWIPE_FILTERS, scope })}>
                  Clear filters
                </Button>
              }
            />
          </div>
        ) : (
          <div className="columns-2 gap-3 sm:columns-3 xl:columns-4 2xl:columns-5" data-testid="swipe-grid">
            {shown.map((item) => (
              <SwipeCell
                key={item.key}
                item={item}
                scope={scope}
                selected={selected.has(item.key)}
                onToggle={() => toggle(item.key)}
                onOpen={() => setSheetKey(item.key)}
              />
            ))}
          </div>
        )}
        {itemsQuery.data && itemsQuery.data.missing > 0 ? (
          <p data-error-box className="text-xs text-muted-foreground">{itemsQuery.data.missing} saved items could not be read<ErrorAlchemyMenu /></p>
        ) : null}
      </div>

      <SwipeItemSheet
        item={sheetItem}
        collections={live}
        initialCollectionId={scope}
        organizationId={organizationId}
        onClose={() => setSheetKey(null)}
        onOpenPost={(i) => {
          if (!i.post) return;
          setSheetKey(null);
          openInPanel(i.post);
        }}
      />

      <CollectionNameDialog
        open={nameDialog !== null}
        onOpenChange={(o) => (o ? undefined : setNameDialog(null))}
        title={nameDialog?.mode === "rename" ? "Rename collection" : "New collection"}
        initial={nameDialog?.mode === "rename" ? nameDialog.name : ""}
        confirmLabel={nameDialog?.mode === "rename" ? "Rename" : "Create"}
        onSubmit={async (name) => {
          if (!nameDialog) return;
          if (nameDialog.mode === "rename") await renameCollection(nameDialog.id, name);
          else {
            const made = await createCollection({ name, brandId }, { organizationId });
            setFilters({ ...effective, scope: made.collection_id });
          }
          await invalidate();
        }}
      />
      <SaveLinkDialog
        open={linkOpen}
        onOpenChange={setLinkOpen}
        organizationId={organizationId}
        brandId={brandId}
        defaultCollectionId={scope === ALL_SAVED ? null : scope}
      />
      <SaveToCollectionDialog
        open={bulkSaveOpen}
        onOpenChange={setBulkSaveOpen}
        organizationId={organizationId}
        brandId={brandId}
        title="Add to collection"
        targets={selectedItems.map((i) => ({ itemType: i.itemType, itemId: i.itemId }))}
        defaultCollectionId={scope === ALL_SAVED ? null : scope}
        onSaved={() => setSelected(new Set())}
      />
    </div>
  );
}

function SwipeCell({
  item,
  scope,
  selected,
  onToggle,
  onOpen,
}: {
  item: SwipeItem;
  scope: string;
  selected: boolean;
  onToggle: () => void;
  onOpen: () => void;
}) {
  const { brandSeg } = useSocials();
  const tags = itemTags(item, scope);
  const note = itemNote(item, scope);
  return (
    <div className="group relative mb-3 break-inside-avoid">
      <label
        className={cn(
          "absolute left-1.5 top-9 z-10 flex h-5 w-5 items-center justify-center rounded bg-card/90 shadow-sm",
          selected ? "opacity-100" : "opacity-0 focus-within:opacity-100 group-hover:opacity-100",
        )}
      >
        <input type="checkbox" checked={selected} onChange={onToggle} aria-label={`Select ${item.title || "item"}`} />
      </label>
      <div className={cn("rounded-lg", selected && "ring-2 ring-primary")}>
        {item.post ? (
          <SocialPostCard
            post={item.post}
            accountHref={accountHref(brandSeg, item.post)}
            hideOutlier
            onOpen={onOpen}
            extraActions={[{ id: "edit", label: "Note, tags and collections", onSelect: onOpen }]}
          />
        ) : item.ad ? (
          <AdCard ad={item.ad} onOpen={onOpen} />
        ) : null}
        {note || tags.length ? (
          <div className="flex min-w-0 flex-col gap-0.5 px-2 pb-1.5 pt-1 text-xs text-muted-foreground">
            {note ? (
              <p className="line-clamp-2" title={note}>
                {note}
              </p>
            ) : null}
            {tags.length ? (
              <p className="truncate" title={tags.map((t) => `#${t}`).join(" ")}>
                {tags.slice(0, 2).map((t) => `#${t}`).join(" ")}
                {tags.length > 2 ? ` +${tags.length - 2}` : ""}
              </p>
            ) : null}
          </div>
        ) : null}
      </div>
    </div>
  );
}
