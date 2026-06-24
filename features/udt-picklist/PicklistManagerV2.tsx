"use client";

import {
  type ChangeEvent,
  type KeyboardEvent,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import {
  Check,
  ChevronDown,
  Globe,
  ListPlus,
  Lock,
  Plus,
  Search,
  Trash2,
  Users,
  X,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
// DB/user-selected icon renderer via the dynamic front door.
import IconResolver from "@/components/official/icons/IconResolver.dynamic";
import {
  useOpenCuratedIconPickerWindow,
  type CuratedIconPickerHandle,
} from "@/features/window-panels/windows/icons/useOpenCuratedIconPickerWindow";
import type { UserListItem } from "@/features/user-lists/types";
import { usePicklists, type PicklistSummary } from "./usePicklists";
import { idMatchesQuery } from "@/utils/search-scoring";

interface PicklistManagerV2Props {
  /** Pin to a specific list and hide the switcher (e.g. in a modal). */
  forcedListId?: string;
  className?: string;
}

/**
 * PicklistManagerV2 — flat-table picklist manager (`udt_picklists` /
 * `udt_picklist_items`).
 *
 * One screen, one table, five editable columns
 * (Label / Description / Help Text / Group / Icon). Embeddable as-is in a
 * route, modal, or window panel — pass `forcedListId` to lock to one list.
 */
export function PicklistManagerV2({
  forcedListId,
  className,
}: PicklistManagerV2Props) {
  const q = usePicklists();
  useEffect(() => {
    if (forcedListId) q.setActiveListId(forcedListId);
  }, [forcedListId]); // eslint-disable-line react-hooks/exhaustive-deps

  const activeList = useMemo(
    () => q.lists.find((l) => l.id === q.activeListId) ?? null,
    [q.lists, q.activeListId],
  );

  return (
    <div
      className={cn(
        "relative flex h-full min-h-0 w-full flex-col overflow-hidden bg-background text-foreground",
        className,
      )}
    >
      <TopBar
        list={activeList}
        lists={q.lists}
        loadingLists={q.loadingLists}
        forced={!!forcedListId}
        onSelect={(id) => q.setActiveListId(id)}
        onNewList={() => q.createNewList()}
        onPatchList={(patch) => activeList && q.patchList(activeList.id, patch)}
        onDeleteList={() =>
          activeList ? q.removeList(activeList.id) : undefined
        }
      />

      {activeList ? (
        <ItemsTable
          list={activeList}
          items={q.items}
          loading={q.loadingItems}
          onAdd={(seed) => q.addItem(activeList.id, seed)}
          onPatch={(id, patch) => q.patchItem(activeList.id, id, patch)}
          onRemove={(id) => q.removeItem(activeList.id, id)}
        />
      ) : (
        <EmptyState
          loading={q.loadingLists}
          hasLists={q.lists.length > 0}
          onNew={() => q.createNewList()}
        />
      )}

      {q.error && (
        <div
          role="status"
          className="absolute bottom-3 right-3 max-w-sm rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-xs text-destructive shadow"
        >
          <div className="flex items-start gap-2">
            <span className="flex-1">{q.error}</span>
            <button
              type="button"
              onClick={q.clearError}
              className="rounded p-0.5 hover:bg-destructive/20"
            >
              <X className="size-3.5" />
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

// ── Top bar ────────────────────────────────────────────────────────────────
type Visibility = "private" | "authenticated" | "public";

function visibilityOf(l: {
  is_public: boolean;
  public_read: boolean;
}): Visibility {
  if (l.is_public) return "public";
  if (l.public_read) return "authenticated";
  return "private";
}

const VISIBILITY_OPTIONS: Array<{
  value: Visibility;
  label: string;
  icon: typeof Lock;
  hint: string;
}> = [
  { value: "private", label: "Private", icon: Lock, hint: "Only you" },
  {
    value: "authenticated",
    label: "Shared",
    icon: Users,
    hint: "Signed-in users",
  },
  { value: "public", label: "Public", icon: Globe, hint: "Anyone on the web" },
];

interface TopBarProps {
  list: PicklistSummary | null;
  lists: PicklistSummary[];
  loadingLists: boolean;
  forced: boolean;
  onSelect: (id: string) => void;
  onNewList: () => void;
  onPatchList: (patch: Partial<PicklistSummary>) => void;
  onDeleteList: () => void;
}

function TopBar({
  list,
  lists,
  loadingLists,
  forced,
  onSelect,
  onNewList,
  onPatchList,
  onDeleteList,
}: TopBarProps) {
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [busyDelete, setBusyDelete] = useState(false);
  const [editingName, setEditingName] = useState(false);
  const [nameDraft, setNameDraft] = useState(list?.list_name ?? "");
  const [descDraft, setDescDraft] = useState(list?.description ?? "");
  const lastSaved = useRef({
    name: list?.list_name ?? "",
    desc: list?.description ?? "",
  });

  useEffect(() => {
    setNameDraft(list?.list_name ?? "");
    setDescDraft(list?.description ?? "");
    lastSaved.current = {
      name: list?.list_name ?? "",
      desc: list?.description ?? "",
    };
    setEditingName(false);
  }, [list?.id, list?.list_name, list?.description]);

  const flushName = () => {
    const v = nameDraft.trim();
    if (!v) {
      setNameDraft(lastSaved.current.name);
      setEditingName(false);
      return;
    }
    if (v !== lastSaved.current.name) {
      lastSaved.current.name = v;
      onPatchList({ list_name: v });
    }
    setEditingName(false);
  };
  const flushDesc = () => {
    if (descDraft !== lastSaved.current.desc) {
      lastSaved.current.desc = descDraft;
      onPatchList({ description: descDraft });
    }
  };

  return (
    <>
      <div className="flex items-center gap-1.5 border-b border-border bg-muted/20 px-2 py-1.5 sm:px-3">
        {!forced && (
          <ListSwitcher
            lists={lists}
            activeId={list?.id ?? null}
            loading={loadingLists}
            onSelect={onSelect}
            onNew={onNewList}
          />
        )}

        {/* Inline editable list name */}
        {list && (
          <div className="flex min-w-0 flex-1 items-baseline gap-2">
            {editingName ? (
              <input
                autoFocus
                value={nameDraft}
                onChange={(e) => setNameDraft(e.target.value)}
                onBlur={flushName}
                onKeyDown={(e) => {
                  if (e.key === "Enter") flushName();
                  else if (e.key === "Escape") {
                    setNameDraft(lastSaved.current.name);
                    setEditingName(false);
                  }
                }}
                className="min-w-0 flex-1 rounded border border-border bg-background px-1.5 py-0.5 text-sm font-medium outline-none focus:ring-1 focus:ring-ring"
                style={{ fontSize: 16 }}
              />
            ) : (
              <button
                type="button"
                onClick={() => setEditingName(true)}
                className="truncate rounded px-1.5 py-0.5 text-sm font-medium hover:bg-muted"
                title="Click to rename"
              >
                {list.list_name?.trim() || (
                  <span className="italic text-muted-foreground">Untitled</span>
                )}
              </button>
            )}

            <input
              value={descDraft}
              onChange={(e) => setDescDraft(e.target.value)}
              onBlur={flushDesc}
              onKeyDown={(e) => {
                if (e.key === "Enter") (e.target as HTMLInputElement).blur();
              }}
              placeholder="Add description…"
              className="hidden min-w-0 flex-1 truncate rounded bg-transparent px-1.5 py-0.5 text-xs text-muted-foreground outline-none placeholder:text-muted-foreground/50 hover:bg-muted focus:bg-background focus:ring-1 focus:ring-ring sm:block"
              style={{ fontSize: 16 }}
            />
          </div>
        )}

        {/* Right side controls */}
        {list && (
          <div className="ml-auto flex items-center gap-1">
            <VisibilityChip
              value={visibilityOf(list)}
              onChange={(v) => {
                if (v === "public")
                  onPatchList({ is_public: true, public_read: true });
                else if (v === "authenticated")
                  onPatchList({ is_public: false, public_read: true });
                else onPatchList({ is_public: false, public_read: false });
              }}
            />
            {!forced && (
              <button
                type="button"
                onClick={() => setConfirmDelete(true)}
                className="rounded-md p-1.5 text-muted-foreground transition-colors hover:bg-destructive/10 hover:text-destructive"
                title="Delete list"
                aria-label="Delete list"
              >
                <Trash2 className="size-4" />
              </button>
            )}
          </div>
        )}

        {!list && !forced && (
          <button
            type="button"
            onClick={onNewList}
            className="ml-auto inline-flex items-center gap-1.5 rounded-md bg-primary px-2.5 py-1 text-xs text-primary-foreground hover:opacity-90"
          >
            <ListPlus className="size-3.5" />
            New list
          </button>
        )}
      </div>

      {list && (
        <ConfirmDialog
          open={confirmDelete}
          onOpenChange={(o) => !busyDelete && setConfirmDelete(o)}
          title="Delete list"
          description={
            <>
              Permanently delete <b>{list.list_name || "this list"}</b> and all
              of its items. This cannot be undone.
            </>
          }
          confirmLabel="Delete"
          variant="destructive"
          busy={busyDelete}
          onConfirm={async () => {
            setBusyDelete(true);
            try {
              onDeleteList();
              setConfirmDelete(false);
            } finally {
              setBusyDelete(false);
            }
          }}
        />
      )}
    </>
  );
}

function ListSwitcher({
  lists,
  activeId,
  loading,
  onSelect,
  onNew,
}: {
  lists: PicklistSummary[];
  activeId: string | null;
  loading: boolean;
  onSelect: (id: string) => void;
  onNew: () => void;
}) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");
  const ref = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!open) return;
    const onDoc = (e: MouseEvent) => {
      if (!ref.current?.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, [open]);

  const filtered = useMemo(() => {
    const s = search.trim().toLowerCase();
    if (!s) return lists;
    return lists.filter(
      (l) =>
        (l.list_name ?? "").toLowerCase().includes(s) || idMatchesQuery(l, s),
    );
  }, [lists, search]);

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="flex items-center gap-1 rounded-md p-1 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
        title="Switch list"
        aria-label="Switch list"
      >
        <ChevronDown className="size-4" />
      </button>
      {open && (
        <div className="absolute left-0 top-full z-30 mt-1 w-72 overflow-hidden rounded-md border border-border bg-popover shadow-md">
          <div className="border-b border-border p-2">
            <div className="relative">
              <Search className="pointer-events-none absolute left-2 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground/60" />
              <input
                autoFocus
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search lists…"
                className="w-full rounded-md border border-border bg-background py-1 pl-7 pr-2 text-xs outline-none placeholder:text-muted-foreground/50 focus:ring-1 focus:ring-ring"
                style={{ fontSize: 16 }}
              />
            </div>
          </div>
          <div className="max-h-72 overflow-y-auto py-1">
            {loading && lists.length === 0 ? (
              <div className="px-3 py-2 text-xs text-muted-foreground">
                Loading…
              </div>
            ) : filtered.length === 0 ? (
              <div className="px-3 py-2 text-xs text-muted-foreground">
                {lists.length === 0 ? "No lists yet." : "No matches."}
              </div>
            ) : (
              filtered.map((l) => {
                const active = l.id === activeId;
                return (
                  <button
                    key={l.id}
                    type="button"
                    onClick={() => {
                      onSelect(l.id);
                      setOpen(false);
                      setSearch("");
                    }}
                    className={cn(
                      "flex w-full items-center gap-2 px-2.5 py-1.5 text-left text-sm transition-colors hover:bg-accent",
                      active && "bg-accent/60",
                    )}
                  >
                    <Check
                      className={cn(
                        "size-3.5 shrink-0",
                        active ? "text-foreground" : "text-transparent",
                      )}
                    />
                    <span className="min-w-0 flex-1 truncate">
                      {l.list_name?.trim() || (
                        <span className="italic text-muted-foreground">
                          Untitled
                        </span>
                      )}
                    </span>
                    <span className="shrink-0 text-[11px] tabular-nums text-muted-foreground/70">
                      {l.item_count}
                    </span>
                  </button>
                );
              })
            )}
          </div>
          <button
            type="button"
            onClick={() => {
              onNew();
              setOpen(false);
            }}
            className="flex w-full items-center gap-2 border-t border-border bg-muted/30 px-3 py-2 text-left text-xs text-primary hover:bg-primary/10"
          >
            <ListPlus className="size-3.5" />
            New list
          </button>
        </div>
      )}
    </div>
  );
}

function VisibilityChip({
  value,
  onChange,
}: {
  value: Visibility;
  onChange: (v: Visibility) => void;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement | null>(null);
  useEffect(() => {
    if (!open) return;
    const onDoc = (e: MouseEvent) => {
      if (!ref.current?.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, [open]);

  const current =
    VISIBILITY_OPTIONS.find((o) => o.value === value) ?? VISIBILITY_OPTIONS[0]!;
  const Icon = current.icon;
  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="flex items-center gap-1.5 rounded-md px-2 py-1 text-xs text-muted-foreground transition-colors hover:bg-muted"
        title={current.hint}
      >
        <Icon className="size-3.5" />
        <span className="hidden sm:inline">{current.label}</span>
      </button>
      {open && (
        <div className="absolute right-0 top-full z-20 mt-1 w-56 rounded-md border border-border bg-popover py-1 shadow-md">
          {VISIBILITY_OPTIONS.map((opt) => {
            const OptIcon = opt.icon;
            const active = opt.value === value;
            return (
              <button
                key={opt.value}
                type="button"
                onClick={() => {
                  onChange(opt.value);
                  setOpen(false);
                }}
                className={cn(
                  "flex w-full items-start gap-2 px-2.5 py-1.5 text-left text-xs transition-colors hover:bg-accent",
                  active && "bg-accent/60",
                )}
              >
                <OptIcon className="mt-0.5 size-3.5 text-muted-foreground" />
                <div className="min-w-0 flex-1">
                  <div className="font-medium text-foreground">{opt.label}</div>
                  <div className="text-[11px] text-muted-foreground">
                    {opt.hint}
                  </div>
                </div>
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}

// ── Items table ────────────────────────────────────────────────────────────
type Col = "label" | "description" | "help_text" | "group" | "icon";

interface ItemsTableProps {
  list: PicklistSummary;
  items: UserListItem[];
  loading: boolean;
  onAdd: (seed: {
    label: string;
    description?: string | null;
    help_text?: string | null;
    group_name?: string | null;
    icon_name?: string | null;
  }) => Promise<UserListItem | null>;
  onPatch: (itemId: string, patch: Partial<UserListItem>) => void;
  onRemove: (itemId: string) => void;
}

function ItemsTable({
  list,
  items,
  loading,
  onAdd,
  onPatch,
  onRemove,
}: ItemsTableProps) {
  const knownGroups = useMemo(() => {
    const s = new Set<string>();
    for (const it of items) {
      if (it.group_name?.trim()) s.add(it.group_name.trim());
    }
    return Array.from(s).sort();
  }, [items]);

  const rowRefs = useRef<
    Map<string, Partial<Record<Col, HTMLInputElement | HTMLButtonElement>>>
  >(new Map());
  const ghostRef = useRef<HTMLInputElement | null>(null);

  const focusRow = useCallback((id: string, col: Col = "label") => {
    requestAnimationFrame(() => rowRefs.current.get(id)?.[col]?.focus());
  }, []);

  // Ghost row state — typing in label commits a new row.
  const [draft, setDraft] = useState<{
    label: string;
    description: string;
    help_text: string;
    group: string;
    icon: string;
  }>({ label: "", description: "", help_text: "", group: "", icon: "" });

  const commitDraft = useCallback(
    async (focusAfter = true) => {
      const label = draft.label.trim();
      if (!label) return null;
      const created = await onAdd({
        label,
        description: draft.description.trim() || null,
        help_text: draft.help_text.trim() || null,
        group_name: draft.group.trim() || null,
        icon_name: draft.icon.trim() || null,
      });
      setDraft({
        label: "",
        description: "",
        help_text: "",
        group: "",
        icon: "",
      });
      if (focusAfter) {
        requestAnimationFrame(() => ghostRef.current?.focus());
      }
      return created;
    },
    [draft, onAdd],
  );

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      {/* Scroll container */}
      <div className="flex-1 overflow-auto">
        <div className="min-w-[820px]">
          {/* Header */}
          <div className="sticky top-0 z-10 grid grid-cols-[minmax(160px,1.4fr)_minmax(180px,1.8fr)_minmax(160px,1.4fr)_minmax(120px,0.8fr)_120px_36px] items-center gap-px border-b border-border bg-muted/40 text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
            <HeaderCell>Label</HeaderCell>
            <HeaderCell>Description</HeaderCell>
            <HeaderCell>Help text</HeaderCell>
            <HeaderCell>Group</HeaderCell>
            <HeaderCell>Icon</HeaderCell>
            <span />
          </div>

          {/* Rows */}
          <div className="divide-y divide-border/60">
            {items.length === 0 && !loading && (
              <div className="px-3 py-3 text-xs text-muted-foreground">
                No items yet — start typing on the last row to add one.
              </div>
            )}

            {items.map((it) => (
              <ItemRow
                key={it.id}
                item={it}
                knownGroups={knownGroups}
                registerRef={(col, el) => {
                  const m = rowRefs.current.get(it.id) ?? {};
                  if (el) m[col] = el;
                  else delete m[col];
                  rowRefs.current.set(it.id, m);
                }}
                onPatch={(patch) => onPatch(it.id, patch)}
                onRemove={() => {
                  const idx = items.findIndex((x) => x.id === it.id);
                  onRemove(it.id);
                  const prev = items[idx - 1];
                  if (prev) focusRow(prev.id, "label");
                  else ghostRef.current?.focus();
                }}
                onEnter={() => ghostRef.current?.focus()}
              />
            ))}

            {/* Ghost / add row */}
            <GhostRow
              labelRef={ghostRef}
              draft={draft}
              setDraft={setDraft}
              knownGroups={knownGroups}
              onCommit={commitDraft}
            />

            {loading && items.length === 0 && (
              <div className="space-y-1 p-3">
                {Array.from({ length: 4 }).map((_, i) => (
                  <div
                    key={i}
                    className="h-8 animate-pulse rounded-md bg-muted/40"
                  />
                ))}
              </div>
            )}
          </div>
        </div>
      </div>

      <div className="flex shrink-0 items-center justify-between border-t border-border px-3 py-1.5 text-[11px] text-muted-foreground">
        <span>
          {items.length} {items.length === 1 ? "item" : "items"}
          {knownGroups.length > 0 && (
            <>
              {" · "}
              {knownGroups.length}{" "}
              {knownGroups.length === 1 ? "group" : "groups"}
            </>
          )}
        </span>
        <span className="hidden text-muted-foreground/70 sm:inline">
          Tab to move · Enter to add · Backspace on empty Label to delete
        </span>
      </div>
    </div>
  );
}

function HeaderCell({ children }: { children: React.ReactNode }) {
  return <div className="px-2.5 py-1.5">{children}</div>;
}

// ── Item row ───────────────────────────────────────────────────────────────
interface ItemRowProps {
  item: UserListItem;
  knownGroups: string[];
  registerRef: (
    col: Col,
    el: HTMLInputElement | HTMLButtonElement | null,
  ) => void;
  onPatch: (patch: Partial<UserListItem>) => void;
  onRemove: () => void;
  onEnter: () => void;
}

function ItemRow({
  item,
  knownGroups,
  registerRef,
  onPatch,
  onRemove,
  onEnter,
}: ItemRowProps) {
  const [vals, setVals] = useState({
    label: item.label ?? "",
    description: item.description ?? "",
    help_text: item.help_text ?? "",
    group: item.group_name ?? "",
    icon: item.icon_name ?? "",
  });
  const focused = useRef<Col | null>(null);
  const lastSaved = useRef({ ...vals });

  useEffect(() => {
    if (focused.current) return;
    const next = {
      label: item.label ?? "",
      description: item.description ?? "",
      help_text: item.help_text ?? "",
      group: item.group_name ?? "",
      icon: item.icon_name ?? "",
    };
    setVals(next);
    lastSaved.current = next;
  }, [
    item.id,
    item.label,
    item.description,
    item.help_text,
    item.group_name,
    item.icon_name,
  ]);

  const setCol = (col: Col) => (e: ChangeEvent<HTMLInputElement>) =>
    setVals((v) => ({ ...v, [col]: e.target.value }));

  const flushCol = (col: Col) => {
    const v = vals[col];
    if (col === "label") {
      const trimmed = v.trim();
      if (!trimmed) {
        // empty label → delete row
        onRemove();
        return;
      }
      if (trimmed !== lastSaved.current.label) {
        lastSaved.current.label = trimmed;
        onPatch({ label: trimmed });
      }
      return;
    }
    if (v === lastSaved.current[col]) return;
    lastSaved.current[col] = v;
    if (col === "description") onPatch({ description: v.trim() || null });
    else if (col === "help_text") onPatch({ help_text: v.trim() || null });
    else if (col === "group") onPatch({ group_name: v.trim() || null });
    else if (col === "icon") onPatch({ icon_name: v.trim() || null });
  };

  const handleKey = (col: Col) => (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter") {
      e.preventDefault();
      flushCol(col);
      onEnter();
    } else if (col === "label" && e.key === "Backspace" && vals.label === "") {
      e.preventDefault();
      onRemove();
    }
  };

  const cellCls =
    "w-full bg-transparent border-0 outline-none px-2.5 py-1.5 text-sm placeholder:text-muted-foreground/50 focus:bg-background focus:ring-1 focus:ring-inset focus:ring-ring/40";

  return (
    <div className="group grid grid-cols-[minmax(160px,1.4fr)_minmax(180px,1.8fr)_minmax(160px,1.4fr)_minmax(120px,0.8fr)_120px_36px] items-stretch gap-px hover:bg-muted/20">
      <input
        ref={(el) => registerRef("label", el)}
        value={vals.label}
        onFocus={() => (focused.current = "label")}
        onChange={setCol("label")}
        onBlur={() => {
          focused.current = null;
          flushCol("label");
        }}
        onKeyDown={handleKey("label")}
        placeholder="Label"
        className={cn(cellCls, "font-medium")}
        style={{ fontSize: 16 }}
      />
      <input
        ref={(el) => registerRef("description", el)}
        value={vals.description}
        onFocus={() => (focused.current = "description")}
        onChange={setCol("description")}
        onBlur={() => {
          focused.current = null;
          flushCol("description");
        }}
        onKeyDown={handleKey("description")}
        placeholder="Description"
        className={cn(cellCls, "text-muted-foreground")}
        style={{ fontSize: 16 }}
      />
      <input
        ref={(el) => registerRef("help_text", el)}
        value={vals.help_text}
        onFocus={() => (focused.current = "help_text")}
        onChange={setCol("help_text")}
        onBlur={() => {
          focused.current = null;
          flushCol("help_text");
        }}
        onKeyDown={handleKey("help_text")}
        placeholder="Help text"
        className={cn(cellCls, "text-muted-foreground")}
        style={{ fontSize: 16 }}
      />
      <GroupCombobox
        value={vals.group}
        knownGroups={knownGroups}
        inputRef={(el) => registerRef("group", el)}
        onFocus={() => (focused.current = "group")}
        onChange={(v) => setVals((s) => ({ ...s, group: v }))}
        onCommit={() => {
          focused.current = null;
          flushCol("group");
        }}
        onEnter={() => {
          flushCol("group");
          onEnter();
        }}
        className={cellCls}
      />
      <IconCell
        value={vals.icon}
        onChange={(v) => {
          setVals((s) => ({ ...s, icon: v }));
          lastSaved.current.icon = v;
          onPatch({ icon_name: v.trim() || null });
        }}
        buttonRef={(el) => registerRef("icon", el)}
      />
      <div className="flex items-center justify-center">
        <button
          type="button"
          tabIndex={-1}
          onClick={onRemove}
          className="flex h-full w-9 items-center justify-center text-muted-foreground/40 opacity-0 transition-all hover:bg-destructive/10 hover:text-destructive group-hover:opacity-100 focus:opacity-100"
          aria-label="Remove item"
          title="Remove"
        >
          <Trash2 className="size-3.5" />
        </button>
      </div>
    </div>
  );
}

// ── Ghost row ──────────────────────────────────────────────────────────────
function GhostRow({
  labelRef,
  draft,
  setDraft,
  knownGroups,
  onCommit,
}: {
  labelRef: React.MutableRefObject<HTMLInputElement | null>;
  draft: {
    label: string;
    description: string;
    help_text: string;
    group: string;
    icon: string;
  };
  setDraft: React.Dispatch<
    React.SetStateAction<{
      label: string;
      description: string;
      help_text: string;
      group: string;
      icon: string;
    }>
  >;
  knownGroups: string[];
  onCommit: (focusAfter?: boolean) => Promise<unknown>;
}) {
  const cellCls =
    "w-full bg-transparent border-0 outline-none px-2.5 py-1.5 text-sm placeholder:text-muted-foreground/50 focus:bg-background focus:ring-1 focus:ring-inset focus:ring-ring/40";

  const handleKey = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter") {
      e.preventDefault();
      void onCommit(true);
    }
  };

  const handleBlur = () => {
    if (draft.label.trim()) void onCommit(false);
  };

  return (
    <div className="group grid grid-cols-[minmax(160px,1.4fr)_minmax(180px,1.8fr)_minmax(160px,1.4fr)_minmax(120px,0.8fr)_120px_36px] items-stretch gap-px bg-muted/10">
      <div className="relative">
        <Plus className="pointer-events-none absolute left-2 top-1/2 size-3 -translate-y-1/2 text-muted-foreground/40" />
        <input
          ref={labelRef}
          value={draft.label}
          onChange={(e) => setDraft((d) => ({ ...d, label: e.target.value }))}
          onKeyDown={handleKey}
          onBlur={handleBlur}
          placeholder="Add an item…"
          className={cn(cellCls, "pl-6 font-medium")}
          style={{ fontSize: 16 }}
        />
      </div>
      <input
        value={draft.description}
        onChange={(e) =>
          setDraft((d) => ({ ...d, description: e.target.value }))
        }
        onKeyDown={handleKey}
        onBlur={handleBlur}
        placeholder="Description"
        className={cn(cellCls, "text-muted-foreground")}
        style={{ fontSize: 16 }}
      />
      <input
        value={draft.help_text}
        onChange={(e) => setDraft((d) => ({ ...d, help_text: e.target.value }))}
        onKeyDown={handleKey}
        onBlur={handleBlur}
        placeholder="Help text"
        className={cn(cellCls, "text-muted-foreground")}
        style={{ fontSize: 16 }}
      />
      <GroupCombobox
        value={draft.group}
        knownGroups={knownGroups}
        onChange={(v) => setDraft((d) => ({ ...d, group: v }))}
        onCommit={handleBlur}
        onEnter={() => void onCommit(true)}
        className={cellCls}
      />
      <IconCell
        value={draft.icon}
        onChange={(v) => setDraft((d) => ({ ...d, icon: v }))}
      />
      <span />
    </div>
  );
}

// ── Group combobox (free-text + filtered dropdown) ────────────────────────
function GroupCombobox({
  value,
  knownGroups,
  inputRef,
  onFocus,
  onChange,
  onCommit,
  onEnter,
  className,
}: {
  value: string;
  knownGroups: string[];
  inputRef?: (el: HTMLInputElement | null) => void;
  onFocus?: () => void;
  onChange: (v: string) => void;
  onCommit: () => void;
  onEnter: () => void;
  className?: string;
}) {
  const [open, setOpen] = useState(false);
  const [highlight, setHighlight] = useState(0);
  const wrapRef = useRef<HTMLDivElement | null>(null);

  const matches = useMemo(() => {
    const s = value.trim().toLowerCase();
    if (!s) return knownGroups;
    return knownGroups.filter((g) => g.toLowerCase().includes(s));
  }, [value, knownGroups]);

  useEffect(() => {
    setHighlight(0);
  }, [matches.length]);

  useEffect(() => {
    if (!open) return;
    const onDoc = (e: MouseEvent) => {
      if (!wrapRef.current?.contains(e.target as Node)) {
        setOpen(false);
        onCommit();
      }
    };
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, [open, onCommit]);

  const handleKey = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "ArrowDown") {
      e.preventDefault();
      if (matches.length === 0) return;
      setOpen(true);
      setHighlight((h) => (h + 1) % matches.length);
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      if (matches.length === 0) return;
      setOpen(true);
      setHighlight((h) => (h - 1 + matches.length) % matches.length);
    } else if (e.key === "Enter") {
      e.preventDefault();
      if (open && matches[highlight]) {
        onChange(matches[highlight]!);
        setOpen(false);
      }
      onEnter();
    } else if (e.key === "Escape") {
      setOpen(false);
    } else if (e.key === "Tab") {
      // Let native tab move focus — commit on blur.
      setOpen(false);
    }
  };

  return (
    <div ref={wrapRef} className="relative">
      <input
        ref={inputRef}
        value={value}
        onFocus={() => {
          onFocus?.();
          setOpen(true);
        }}
        onChange={(e) => {
          onChange(e.target.value);
          setOpen(true);
        }}
        onBlur={() => {
          // Defer so a click on a menu item can fire first.
          requestAnimationFrame(() => {
            setOpen(false);
            onCommit();
          });
        }}
        onKeyDown={handleKey}
        placeholder="Group"
        className={cn(className, "text-muted-foreground")}
        style={{ fontSize: 16 }}
        autoComplete="off"
      />
      {open && matches.length > 0 && (
        <div className="absolute left-0 right-0 top-full z-30 mt-0.5 max-h-60 overflow-y-auto rounded-md border border-border bg-popover py-1 shadow-md">
          {matches.map((g, i) => (
            <button
              key={g}
              type="button"
              onMouseDown={(e) => {
                // Prevent input blur firing before click.
                e.preventDefault();
                onChange(g);
                setOpen(false);
                onCommit();
              }}
              onMouseEnter={() => setHighlight(i)}
              className={cn(
                "block w-full truncate px-2.5 py-1 text-left text-xs transition-colors",
                i === highlight
                  ? "bg-accent text-accent-foreground"
                  : "text-foreground hover:bg-accent/60",
              )}
            >
              {g}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

// ── Icon cell (uses the official curated icon picker window) ──────────────
function IconCell({
  value,
  onChange,
  buttonRef,
}: {
  value: string;
  onChange: (v: string) => void;
  buttonRef?: (el: HTMLButtonElement | null) => void;
}) {
  const openIconPicker = useOpenCuratedIconPickerWindow();
  const handleRef = useRef<CuratedIconPickerHandle | null>(null);

  useEffect(() => {
    return () => {
      handleRef.current?.close();
      handleRef.current = null;
    };
  }, []);

  const open = () => {
    if (handleRef.current) handleRef.current.close();
    handleRef.current = openIconPicker({
      onPicked: (e) => {
        onChange(e.iconId);
        handleRef.current?.close();
        handleRef.current = null;
      },
      onWindowClose: () => {
        handleRef.current = null;
      },
    });
  };

  return (
    <div className="relative flex items-center">
      <button
        type="button"
        ref={buttonRef}
        onClick={open}
        className="flex w-full items-center gap-1.5 px-2.5 py-1.5 text-left text-xs text-muted-foreground transition-colors hover:bg-muted/40 focus:bg-background focus:outline-none focus:ring-1 focus:ring-inset focus:ring-ring/40"
        title={value || "Pick icon"}
      >
        {value ? (
          <IconResolver iconName={value} className="size-3.5 text-foreground" />
        ) : (
          <span className="size-3.5 rounded-sm border border-dashed border-muted-foreground/40" />
        )}
        <span className="truncate">
          {value || <span className="text-muted-foreground/50">Icon</span>}
        </span>
        {value && (
          <span
            role="button"
            tabIndex={-1}
            aria-label="Clear icon"
            title="Clear icon"
            onClick={(e) => {
              e.stopPropagation();
              onChange("");
            }}
            className="ml-auto rounded p-0.5 text-muted-foreground/50 hover:bg-destructive/10 hover:text-destructive"
          >
            <X className="size-3" />
          </span>
        )}
      </button>
    </div>
  );
}

// ── Empty state ────────────────────────────────────────────────────────────
function EmptyState({
  loading,
  hasLists,
  onNew,
}: {
  loading: boolean;
  hasLists: boolean;
  onNew: () => void;
}) {
  if (loading) {
    return (
      <div className="flex flex-1 items-center justify-center text-xs text-muted-foreground">
        Loading…
      </div>
    );
  }
  return (
    <div className="flex flex-1 flex-col items-center justify-center gap-3 p-6 text-center">
      <div className="flex size-10 items-center justify-center rounded-full bg-muted">
        <ListPlus className="size-5 text-muted-foreground" />
      </div>
      <div className="space-y-1">
        <div className="text-sm font-medium">
          {hasLists ? "Select a list" : "No lists yet"}
        </div>
        <div className="text-xs text-muted-foreground">
          {hasLists
            ? "Pick one from the switcher to start editing."
            : "Create your first list and start adding items."}
        </div>
      </div>
      {!hasLists && (
        <button
          type="button"
          onClick={onNew}
          className="inline-flex items-center gap-1.5 rounded-md bg-primary px-3 py-1.5 text-xs text-primary-foreground hover:opacity-90"
        >
          <ListPlus className="size-3.5" />
          New list
        </button>
      )}
    </div>
  );
}
