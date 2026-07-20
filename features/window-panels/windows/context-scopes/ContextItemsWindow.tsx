"use client";

/**
 * ContextItemsWindow — the one Add/Edit/Manage surface for context items.
 *
 * Sidebar lists every context item defined on a scope type; clicking a row
 * opens it as a closeable tab in the body so several items can stay open
 * side-by-side. The "+" button opens a new draft tab (create form); on save
 * it swaps in place for the real item's tab — no separate "add" surface.
 *
 * Works for "one item" (open with `initialItemId`, sidebar still lets you
 * jump to others) or "all of them" (open with just `scopeTypeId`).
 *
 * UI modeled on `SurfaceContextInspectorWindow` (sidebar + tab bar). Reuses
 * the canonical forms — `ContextItemSettingsForm` (edit) and
 * `ContextItemAddForm` (create) — rather than forking a third editor.
 */

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type KeyboardEvent,
} from "react";
import {
  ArrowUpDown,
  ListChecks,
  Loader2,
  Plus,
  Search,
  X,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { WindowPanel } from "@/features/window-panels/WindowPanel";
import { useAppDispatch, useAppSelector } from "@/lib/redux/hooks";
import {
  listScopeTypeItems,
  selectItemsByType,
  selectItemsLoadedForType,
  updateContextItem,
  type ContextItem,
} from "@/features/scope-system/redux/contextItemsSlice";
import { VALUE_TYPE_CONFIG } from "@/features/agent-context/constants";
import { ContextItemSettingsForm } from "@/features/scope-system/components/forms/ContextItemSettingsForm";
import { ContextItemAddForm } from "@/features/scope-system/components/ContextItemAddForm";
import { ReorderDialog } from "@/features/scope-system/components/ReorderDialog";
import { ensureScopeTree } from "@/features/scopes/redux/thunks/ensureScopeTree";
import { makeSelectScopeType } from "@/features/scopes/redux/selectors/tree";
import { cn } from "@/lib/utils";
import { toast } from "@/lib/toast";

// ─── Props ────────────────────────────────────────────────────────────────────

export interface ContextItemsWindowData {
  /** Which scope type's context items to manage. */
  scopeTypeId: string;
  /** Open directly to one item as a tab (e.g. from an "Edit" affordance). */
  initialItemId?: string | null;
  /** Open directly to a blank "new item" draft tab. */
  openNewOnMount?: boolean;
}

interface ContextItemsWindowProps {
  isOpen: boolean;
  onClose: () => void;
  data?: ContextItemsWindowData;
}

const OVERLAY_ID = "contextItemsWindow";
const NEW_TAB_PREFIX = "__new__";

type TabId = string;

function isNewTab(id: TabId): boolean {
  return id.startsWith(NEW_TAB_PREFIX);
}

// ─── Tab state ────────────────────────────────────────────────────────────────

function useContextItemTabs(
  initialItemId?: string | null,
  openNewOnMount?: boolean,
) {
  const [openTabIds, setOpenTabIds] = useState<TabId[]>(() => {
    if (initialItemId) return [initialItemId];
    if (openNewOnMount) return [`${NEW_TAB_PREFIX}:0`];
    return [];
  });
  const [activeTabId, setActiveTabId] = useState<TabId | null>(
    openTabIds[0] ?? null,
  );

  const openTab = useCallback((id: TabId) => {
    setOpenTabIds((prev) => (prev.includes(id) ? prev : [...prev, id]));
    setActiveTabId(id);
  }, []);

  const openNewTab = useCallback(() => {
    const id = `${NEW_TAB_PREFIX}:${Date.now()}`;
    setOpenTabIds((prev) => [...prev, id]);
    setActiveTabId(id);
  }, []);

  const closeTab = useCallback(
    (id: TabId) => {
      const next = openTabIds.filter((tabId) => tabId !== id);
      const nextActiveId =
        activeTabId !== id
          ? activeTabId
          : next.length > 0
            ? next[next.length - 1]
            : null;
      setOpenTabIds(next);
      setActiveTabId(nextActiveId);
      if (nextActiveId) {
        requestAnimationFrame(() => {
          document.getElementById(tabDomId(nextActiveId))?.focus();
        });
      }
    },
    [activeTabId, openTabIds],
  );

  /** Swap a draft tab's id for the newly-created item's real id, in place. */
  const replaceTab = useCallback((oldId: TabId, newId: TabId) => {
    setOpenTabIds((prev) => prev.map((t) => (t === oldId ? newId : t)));
    setActiveTabId((active) => (active === oldId ? newId : active));
  }, []);

  return {
    openTabIds,
    activeTabId,
    setActiveTabId,
    openTab,
    openNewTab,
    closeTab,
    replaceTab,
  };
}

// ─── Sidebar ──────────────────────────────────────────────────────────────────

function SidebarRow({
  item,
  isOpenTab,
  isActive,
  tabIndex,
  onSelect,
  onKeyDown,
}: {
  item: ContextItem;
  isOpenTab: boolean;
  isActive: boolean;
  tabIndex: number;
  onSelect: () => void;
  onKeyDown: (event: KeyboardEvent<HTMLButtonElement>) => void;
}) {
  return (
    <button
      type="button"
      onClick={onSelect}
      onKeyDown={onKeyDown}
      tabIndex={tabIndex}
      aria-current={isActive ? "page" : undefined}
      data-context-item-sidebar-row
      className={cn(
        "flex w-full min-w-0 items-start gap-1.5 border-l-2 px-2 py-1.5 text-left transition-colors",
        isActive
          ? "border-primary bg-primary/8"
          : "border-transparent hover:bg-muted/40",
      )}
    >
      <div className="min-w-0 flex-1 space-y-0.5">
        <div className="flex min-w-0 items-center gap-1">
          <span
            className={cn(
              "truncate text-[11px] font-medium",
              isActive ? "text-primary" : "text-foreground",
            )}
          >
            {item.display_name}
          </span>
          {isOpenTab && !isActive && (
            <span className="h-1 w-1 shrink-0 rounded-full bg-primary/60" />
          )}
        </div>
        <div className="flex min-w-0 items-center gap-1">
          <Badge
            variant="secondary"
            className="h-3.5 shrink-0 px-1 text-[8px] leading-none"
          >
            {VALUE_TYPE_CONFIG[item.value_type]?.label ?? item.value_type}
          </Badge>
          {item.category && (
            <span className="truncate text-[10px] text-muted-foreground">
              {item.category}
            </span>
          )}
        </div>
      </div>
    </button>
  );
}

function ContextItemsSidebar({
  items,
  loaded,
  openTabIds,
  activeTabId,
  onSelect,
  onAdd,
  onReorder,
}: {
  items: ContextItem[];
  loaded: boolean;
  openTabIds: TabId[];
  activeTabId: TabId | null;
  onSelect: (id: TabId) => void;
  onAdd: () => void;
  onReorder: () => void;
}) {
  const [query, setQuery] = useState("");
  const navRef = useRef<HTMLElement>(null);
  const filtered = query.trim()
    ? items.filter((i) =>
        i.display_name.toLowerCase().includes(query.trim().toLowerCase()),
      )
    : items;
  const activeItemIsVisible = filtered.some((item) => item.id === activeTabId);

  function moveSidebarFocus(nextIndex: number) {
    const rows = navRef.current?.querySelectorAll<HTMLButtonElement>(
      "[data-context-item-sidebar-row]",
    );
    const target = Math.max(0, Math.min(nextIndex, filtered.length - 1));
    const item = filtered[target];
    if (!item) return;
    onSelect(item.id);
    requestAnimationFrame(() => rows?.[target]?.focus());
  }

  function handleSidebarKeyDown(
    event: KeyboardEvent<HTMLButtonElement>,
    index: number,
  ) {
    let target: number | null = null;
    if (event.key === "ArrowDown") target = index + 1;
    if (event.key === "ArrowUp") target = index - 1;
    if (event.key === "Home") target = 0;
    if (event.key === "End") target = filtered.length - 1;
    if (target === null) return;
    event.preventDefault();
    moveSidebarFocus(target);
  }

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="shrink-0 space-y-1.5 border-b border-border p-2">
        <div className="flex items-center gap-1.5">
          <div className="relative flex-1">
            <Search className="pointer-events-none absolute left-2 top-1/2 h-3 w-3 -translate-y-1/2 text-muted-foreground" />
            <Input
              aria-label="Search context items"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search items…"
              className="h-7 pl-6 text-xs"
              style={{ fontSize: "13px" }}
            />
          </div>
          <button
            type="button"
            onClick={onAdd}
            title="Add context item"
            aria-label="Add context item"
            className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
          >
            <Plus className="h-4 w-4" />
          </button>
        </div>
        {items.length > 1 && (
          <button
            type="button"
            onClick={onReorder}
            className="flex items-center gap-1 text-[10px] text-muted-foreground transition-colors hover:text-foreground"
          >
            <ArrowUpDown className="h-2.5 w-2.5" />
            Reorder
          </button>
        )}
      </div>

      <nav
        ref={navRef}
        aria-label="Context items"
        className="flex min-h-0 flex-1 flex-col overflow-y-auto"
      >
        {!loaded ? (
          <div className="flex items-center justify-center py-8">
            <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
          </div>
        ) : filtered.length === 0 ? (
          <div className="px-3 py-6 text-center text-[11px] text-muted-foreground">
            {items.length === 0 ? "No context items yet." : "No matches."}
          </div>
        ) : (
          filtered.map((item, index) => (
            <SidebarRow
              key={item.id}
              item={item}
              isOpenTab={openTabIds.includes(item.id)}
              isActive={activeTabId === item.id}
              tabIndex={
                activeTabId === item.id || (!activeItemIsVisible && index === 0)
                  ? 0
                  : -1
              }
              onSelect={() => onSelect(item.id)}
              onKeyDown={(event) => handleSidebarKeyDown(event, index)}
            />
          ))
        )}
      </nav>
    </div>
  );
}

// ─── Tab bar ──────────────────────────────────────────────────────────────────

function TabBar({
  openTabIds,
  activeTabId,
  itemById,
  onActivate,
  onClose,
}: {
  openTabIds: TabId[];
  activeTabId: TabId | null;
  itemById: Map<string, ContextItem>;
  onActivate: (id: TabId) => void;
  onClose: (id: TabId) => void;
}) {
  if (openTabIds.length === 0) return null;

  function activateByKeyboard(
    event: KeyboardEvent<HTMLButtonElement>,
    index: number,
  ) {
    let target: number | null = null;
    if (event.key === "ArrowRight") target = (index + 1) % openTabIds.length;
    if (event.key === "ArrowLeft") {
      target = (index - 1 + openTabIds.length) % openTabIds.length;
    }
    if (event.key === "Home") target = 0;
    if (event.key === "End") target = openTabIds.length - 1;
    if (target === null) return;
    event.preventDefault();
    const nextId = openTabIds[target];
    onActivate(nextId);
    requestAnimationFrame(() => {
      document.getElementById(tabDomId(nextId))?.focus();
    });
  }

  return (
    <div
      role="tablist"
      aria-label="Open context items"
      className="no-scrollbar flex h-8 shrink-0 items-end overflow-x-auto border-b border-border bg-muted/20 px-1"
    >
      {openTabIds.map((id, index) => {
        const label = isNewTab(id)
          ? "New item"
          : (itemById.get(id)?.display_name ?? "…");
        const isActive = id === activeTabId;
        return (
          <div
            key={id}
            className={cn(
              "group flex h-full min-w-[80px] max-w-[180px] shrink-0 select-none items-center rounded-t border border-b-0 pl-2.5 pr-1 transition-colors",
              isActive
                ? "z-10 translate-y-px border-border bg-background pb-px font-medium text-foreground"
                : "border-border/40 bg-muted/20 text-muted-foreground hover:border-border/70 hover:bg-muted/40 hover:text-foreground",
            )}
          >
            <button
              id={tabDomId(id)}
              type="button"
              role="tab"
              aria-selected={isActive}
              aria-controls={tabPanelDomId(id)}
              tabIndex={isActive ? 0 : -1}
              onClick={() => onActivate(id)}
              onKeyDown={(event) => activateByKeyboard(event, index)}
              className="flex min-w-0 flex-1 items-center rounded-sm text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              {isNewTab(id) && <Plus className="mr-1 h-3 w-3 shrink-0" />}
              <span className="flex-1 truncate text-xs">{label}</span>
            </button>
            <button
              type="button"
              tabIndex={isActive ? 0 : -1}
              aria-label={`Close ${label}`}
              onClick={(e) => {
                e.stopPropagation();
                onClose(id);
              }}
              className={cn(
                "ml-1 flex h-4 w-4 shrink-0 items-center justify-center rounded-sm transition-colors",
                isActive
                  ? "text-muted-foreground hover:bg-muted"
                  : "text-muted-foreground opacity-0 hover:bg-muted/80 group-hover:opacity-100",
              )}
            >
              <X className="h-3 w-3" />
            </button>
          </div>
        );
      })}
    </div>
  );
}

function tabDomId(id: TabId): string {
  return `context-item-tab-${encodeURIComponent(id)}`;
}

function tabPanelDomId(id: TabId): string {
  return `context-item-tabpanel-${encodeURIComponent(id)}`;
}

// ─── Body ─────────────────────────────────────────────────────────────────────

function ContextItemsBody({
  activeTabId,
  scopeTypeId,
  labelPlural,
  onCreated,
  onDeleted,
  onCancelNew,
}: {
  activeTabId: TabId | null;
  scopeTypeId: string;
  labelPlural: string;
  onCreated: (tabId: TabId, item: ContextItem) => void;
  onDeleted: (tabId: TabId) => void;
  onCancelNew: (tabId: TabId) => void;
}) {
  if (!activeTabId) {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-3 px-6 text-center text-muted-foreground">
        <ListChecks className="h-10 w-10 opacity-15" />
        <div className="space-y-1">
          <p className="text-sm font-medium text-foreground">
            No item selected
          </p>
          <p className="text-xs opacity-60">
            Pick a context item from the sidebar, or add a new one.
          </p>
        </div>
      </div>
    );
  }

  if (isNewTab(activeTabId)) {
    return (
      <div className="p-4">
        <ContextItemAddForm
          scopeTypeId={scopeTypeId}
          labelPlural={labelPlural}
          onAdded={(item) => onCreated(activeTabId, item)}
          onClose={() => onCancelNew(activeTabId)}
        />
      </div>
    );
  }

  return (
    <div className="p-4">
      <ContextItemSettingsForm
        key={activeTabId}
        itemId={activeTabId}
        autoFocus
        onDeleted={() => onDeleted(activeTabId)}
      />
    </div>
  );
}

// ─── Window inner ─────────────────────────────────────────────────────────────

function ContextItemsWindowInner({
  onClose,
  data,
}: {
  onClose: () => void;
  data: ContextItemsWindowData;
}) {
  const dispatch = useAppDispatch();
  const { scopeTypeId, initialItemId, openNewOnMount } = data;

  const items = useAppSelector((s) => selectItemsByType(s, scopeTypeId));
  const loaded = useAppSelector((s) =>
    selectItemsLoadedForType(s, scopeTypeId),
  );
  const selectScopeType = useMemo(() => makeSelectScopeType(), []);
  const scopeType = useAppSelector((s) => selectScopeType(s, scopeTypeId));

  useEffect(() => {
    void dispatch(listScopeTypeItems(scopeTypeId));
  }, [dispatch, scopeTypeId]);
  useEffect(() => {
    void dispatch(ensureScopeTree());
  }, [dispatch]);

  const tabs = useContextItemTabs(initialItemId, openNewOnMount);
  const [reorderOpen, setReorderOpen] = useState(false);

  const itemById = useMemo(() => new Map(items.map((i) => [i.id, i])), [items]);

  const handleCreated = useCallback(
    (tabId: TabId, item: ContextItem) => {
      tabs.replaceTab(tabId, item.id);
    },
    [tabs],
  );

  const saveOrder = useCallback(
    async (orderedIds: string[]) => {
      await Promise.all(
        orderedIds.map((id, i) =>
          dispatch(updateContextItem({ id, sort_order: i + 1 })).unwrap(),
        ),
      );
      toast.success("Order saved");
    },
    [dispatch],
  );

  const labelPlural = scopeType?.label_plural ?? "items";

  const titleNode = (
    <div className="flex max-w-[min(420px,50vw)] items-center justify-center gap-1.5 truncate">
      <span className="truncate text-sm font-medium">Context Items</span>
      <Badge
        variant="outline"
        className="max-w-[180px] truncate font-mono text-[10px]"
      >
        {labelPlural}
      </Badge>
    </div>
  );

  return (
    <WindowPanel
      id="context-items-window"
      overlayId={OVERLAY_ID}
      onClose={onClose}
      titleNode={titleNode}
      width={860}
      height={600}
      minWidth={520}
      minHeight={360}
      position="center"
      bodyClassName="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden p-0"
      sidebarDefaultSize={220}
      sidebarMinSize={170}
      defaultSidebarOpen
      sidebar={
        <ContextItemsSidebar
          items={items}
          loaded={loaded}
          openTabIds={tabs.openTabIds}
          activeTabId={tabs.activeTabId}
          onSelect={tabs.openTab}
          onAdd={tabs.openNewTab}
          onReorder={() => setReorderOpen(true)}
        />
      }
      footerLeft={
        <span className="text-[11px] text-muted-foreground">
          <span className="font-semibold text-foreground">{items.length}</span>{" "}
          item{items.length === 1 ? "" : "s"}
        </span>
      }
    >
      <div className="flex h-full min-h-0 min-w-0 flex-col overflow-hidden">
        <TabBar
          openTabIds={tabs.openTabIds}
          activeTabId={tabs.activeTabId}
          itemById={itemById}
          onActivate={tabs.setActiveTabId}
          onClose={tabs.closeTab}
        />
        <div
          id={tabs.activeTabId ? tabPanelDomId(tabs.activeTabId) : undefined}
          role={tabs.activeTabId ? "tabpanel" : undefined}
          aria-labelledby={
            tabs.activeTabId ? tabDomId(tabs.activeTabId) : undefined
          }
          className="min-h-0 min-w-0 flex-1 overflow-y-auto"
        >
          <ContextItemsBody
            activeTabId={tabs.activeTabId}
            scopeTypeId={scopeTypeId}
            labelPlural={labelPlural}
            onCreated={handleCreated}
            onDeleted={tabs.closeTab}
            onCancelNew={tabs.closeTab}
          />
        </div>
      </div>

      <ReorderDialog
        open={reorderOpen}
        onOpenChange={setReorderOpen}
        title="Reorder context items"
        description="Drag the handle or use the arrows, then save."
        items={items.map((i) => ({
          id: i.id,
          label: i.display_name,
          sublabel: i.category ?? undefined,
        }))}
        onSave={saveOrder}
      />
    </WindowPanel>
  );
}

// ─── Shell ────────────────────────────────────────────────────────────────────

export default function ContextItemsWindow({
  isOpen,
  onClose,
  data,
}: ContextItemsWindowProps) {
  if (!isOpen || !data?.scopeTypeId) return null;
  return <ContextItemsWindowInner onClose={onClose} data={data} />;
}
