"use client";

// System Context console — Super Admin only.
//
// The (admin) layout already requires Super Admin and the
// /api/admin/system-context route re-checks server-side. This is the control
// plane for platform-wide "System Context resources" that resolve for EVERY
// user with no scope selection (their scope types carry is_system=true in the
// member-less "Matrx System" org).
//
// A resource is a DEFINITION + a FEED — the value is the feed's output, not the
// authored thing. Feeds (see FeedConfigEditor.tsx):
//   - dataset  — points at a RAG data store; agents query it (LIVE: the AMA
//     Guides). Resolves to a pointer via resolve_full_context loop 4c.
//   - manual   — a typed value (rare; the component-aware editor). LIVE.
//   - computed — code/expression at resolution (the ambient current_* keys are
//     reserved computes in matrx_ai.context_engine; user-defined code later).
//   - agent / api / web — definition captured now; executor lands later
//     (feed_status='pending', honestly labeled in the UI).
// "Preview agent context" shows exactly what an agent receives globally.
//
// List surface: canonical MatrxDataTable (per-column sort+filter, search,
// Copy for AI, side-panel detail). Categories are a toolbar facet; selecting
// one exposes its scoped Add-item / Delete-category actions.
//
// THE DOOR LAW (common-docs/policies/no-dead-ends.md): a feed POINTS at a real
// record — the dataset it queries, the agent it runs — so that record opens
// (`EntityRef`, routes from the entity registry). The Category cell reaches the
// items in its category. The toolbar's `Label · count` facets are already
// doors: clicking one narrows the table to exactly those rows.

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  Boxes,
  Clock,
  Database,
  Eye,
  Globe,
  Layers,
  Loader2,
  Lock,
  Pencil,
  Plus,
  RefreshCw,
  Tag,
  Trash2,
} from "lucide-react";
import { toast } from "@/lib/toast";

import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { confirm } from "@/components/dialogs/confirm/ConfirmDialogHost";
import { MatrxDataTable } from "@/components/official/matrx-data-table/MatrxDataTable";
import type { MatrxColumnDef } from "@/components/official/matrx-data-table/types";
import { EntityRef } from "@/components/official/entity-ref/EntityRef";
import { ContextValueDisplay } from "@/features/scopes/components/reference/ContextValueDisplay";
import type {
  SystemContextCategory,
  SystemContextItem,
  SystemContextPayload,
} from "@/app/api/admin/system-context/route";
import {
  feedTypeMeta,
  feedTypeTone,
  feedSourceLink,
  OpenSourceLink,
  asFeedConfig,
} from "./FeedConfigEditor";
import {
  AddItemDialog,
  EditItemDialog,
  NewScopeTypeDialog,
} from "./ItemDialogs";
import { PreviewDialog } from "./PreviewDialog";
import {
  PAGE_LOCATION,
  SENSITIVITY_STYLES,
  itemSummary,
  valueTypeTone,
} from "./shared";

/**
 * The record a feed points at, as a token + id + name — or null when the feed
 * has no external source (manual value, ambient compute, or a definition whose
 * executor hasn't landed and therefore carries no id yet).
 *
 * THE DOOR LAW: this is what turns "→ AMA Guides" from a label into the store
 * itself. Tokens resolve their own route + peek through the entity registry
 * (`data_store` → /rag/data-stores?store_id=, `agent` → /agents/[id]), so this
 * function never writes a URL.
 */
function feedTarget(
  item: SystemContextItem,
): { token: string; id: string; name: string | null } | null {
  const cfg = asFeedConfig(item.feed_config);
  const str = (key: string): string | null =>
    typeof cfg[key] === "string" && cfg[key] ? (cfg[key] as string) : null;
  if (item.feed_type === "dataset") {
    const id = str("data_store_id");
    return id
      ? { token: "data_store", id, name: str("data_store_name") }
      : null;
  }
  if (item.feed_type === "agent") {
    const id = str("agent_id");
    return id ? { token: "agent", id, name: str("agent_name") } : null;
  }
  return null;
}

// The Feed cell — how the item is populated, with live status.
function FeedCell({ item }: { item: SystemContextItem }) {
  const meta = feedTypeMeta(item.feed_type);
  const Icon = meta.icon;
  const cfg = asFeedConfig(item.feed_config);
  const target = feedTarget(item);
  // Only fall back to the bare "Open source" link when there is no id to hang a
  // real EntityRef on — a link with no record behind it is the dead end.
  const sourceLink = target ? null : feedSourceLink(item.feed_type, cfg);
  return (
    <div className="group/entity-ref space-y-0.5">
      <span
        className={`inline-flex items-center gap-1 rounded px-1.5 py-0.5 text-[11px] font-medium ${feedTypeTone(
          item.feed_type,
        )}`}
      >
        <Icon className="h-3 w-3" /> {meta.label}
      </span>
      {target && (
        <div className="flex max-w-[180px] items-center gap-1 text-[11px] text-muted-foreground">
          <span className="shrink-0">→</span>
          <EntityRef
            token={target.token}
            id={target.id}
            name={target.name}
            showIcon={false}
            alwaysShowActions
            className="min-w-0"
          />
        </div>
      )}
      {sourceLink && <OpenSourceLink link={sourceLink} />}
      {item.feed_status && item.feed_type !== "manual" && (
        <div className="text-[10px] uppercase tracking-wide text-muted-foreground">
          {item.feed_status}
        </div>
      )}
    </div>
  );
}

// The Output cell — the value (or what stands in for it per feed type).
function OutputCell({ item }: { item: SystemContextItem }) {
  if (item.is_computed) {
    return (
      <span className="inline-flex items-center gap-1 rounded-full bg-amber-100 px-2 py-0.5 text-[11px] font-medium text-amber-800 dark:bg-amber-900/40 dark:text-amber-200">
        <Clock className="h-3 w-3" /> Computed
      </span>
    );
  }
  if (item.feed_type === "dataset") {
    return (
      <span className="text-[11px] italic text-muted-foreground">
        queried live (no stored value)
      </span>
    );
  }
  if (item.current_value === null) {
    return (
      <span className="text-xs italic text-muted-foreground">
        {item.feed_type === "manual" ? "not set" : "awaiting feed"}
      </span>
    );
  }
  // Reference cells store a canonical ```matrx fence in value_text — render it
  // as live chips (the same renderer used everywhere a fence appears), never a
  // raw fence string.
  if (item.value_type === "reference") {
    return (
      <ContextValueDisplay
        value={{ value_text: item.current_value }}
        valueType="reference"
        className="max-w-[220px]"
      />
    );
  }
  return (
    <code className="block max-w-[220px] truncate font-mono text-xs text-foreground">
      {item.current_value}
    </code>
  );
}

// Sort/filter/search text standing in for the Output cell's rendered state.
function outputText(it: SystemContextItem): string {
  if (it.is_computed) return "(computed)";
  if (it.feed_type === "dataset") return "(queried live)";
  if (it.current_value === null)
    return it.feed_type === "manual" ? "(not set)" : "(awaiting feed)";
  return it.current_value;
}

function StatCard({
  icon,
  label,
  value,
  tone,
}: {
  icon: React.ReactNode;
  label: string;
  value: number;
  tone: string;
}) {
  return (
    <Card>
      <CardContent className="flex items-center justify-between p-3">
        <div>
          <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
            {icon}
            {label}
          </div>
          <div className={`mt-1 text-2xl font-semibold tabular-nums ${tone}`}>
            {value}
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

export function SystemContextConsole() {
  const [data, setData] = useState<SystemContextPayload | null>(null);
  const [loading, setLoading] = useState(true);
  const [fetching, setFetching] = useState(false);
  const [scopeFilter, setScopeFilter] = useState<string>("all");
  const [editing, setEditing] = useState<SystemContextItem | null>(null);
  const [creatingCategory, setCreatingCategory] = useState(false);
  const [addItemPreset, setAddItemPreset] =
    useState<SystemContextCategory | null>(null);
  const [addItemOpen, setAddItemOpen] = useState(false);
  const [previewOpen, setPreviewOpen] = useState(false);

  const fetchData = useCallback(async () => {
    setFetching(true);
    try {
      const res = await fetch("/api/admin/system-context");
      if (!res.ok) {
        const { error } = await res
          .json()
          .catch(() => ({ error: res.statusText }));
        toast.error(`Failed to load system context: ${error}`);
        return;
      }
      setData((await res.json()) as SystemContextPayload);
    } finally {
      setLoading(false);
      setFetching(false);
    }
  }, []);

  useEffect(() => {
    void fetchData();
  }, [fetchData]);

  const openAddItem = useCallback((category: SystemContextCategory | null) => {
    setAddItemPreset(category);
    setAddItemOpen(true);
  }, []);

  const handleDeleteItem = useCallback(
    async (it: SystemContextItem) => {
      const ok = await confirm({
        title: `Delete "${it.key}"?`,
        description: `This removes the system context item and its stored value. Agents bound to it will fall back to their default. This cannot be undone.`,
        confirmLabel: "Delete item",
        variant: "destructive",
      });
      if (!ok) return;
      const res = await fetch(
        `/api/admin/system-context?type=item&id=${it.id}`,
        { method: "DELETE" },
      );
      if (!res.ok) {
        const { error } = await res
          .json()
          .catch(() => ({ error: res.statusText }));
        toast.error(`Delete failed: ${error}`);
        return;
      }
      toast.success(`Deleted ${it.key}.`);
      await fetchData();
    },
    [fetchData],
  );

  const handleDeleteCategory = useCallback(
    async (category: SystemContextCategory) => {
      const ok = await confirm({
        title: `Delete category "${category.label_singular}"?`,
        description: `This deletes the scope type and ALL ${category.item_count} item(s) and values inside it. This cannot be undone.`,
        confirmLabel: "Delete category",
        variant: "destructive",
      });
      if (!ok) return;
      const res = await fetch(
        `/api/admin/system-context?type=scope_type&id=${category.scope_type_id}`,
        { method: "DELETE" },
      );
      if (!res.ok) {
        const { error } = await res
          .json()
          .catch(() => ({ error: res.statusText }));
        toast.error(`Delete failed: ${error}`);
        return;
      }
      toast.success(`Deleted category ${category.label_singular}.`);
      setScopeFilter("all");
      await fetchData();
    },
    [fetchData],
  );

  const items = useMemo(() => data?.items ?? [], [data]);
  const categories = useMemo(() => data?.categories ?? [], [data]);

  const stats = useMemo(() => {
    const total = items.length;
    const computed = items.filter((i) => i.is_computed).length;
    const stored = total - computed;
    return { total, computed, stored, categories: categories.length };
  }, [items, categories]);

  // Category narrowing is a toolbar facet; the table owns search + per-column
  // filters over the narrowed rows.
  const rows = useMemo(
    () =>
      scopeFilter === "all"
        ? items
        : items.filter((it) => it.scope_type_id === scopeFilter),
    [items, scopeFilter],
  );

  const activeCategory = useMemo(
    () =>
      scopeFilter === "all"
        ? null
        : (categories.find((c) => c.scope_type_id === scopeFilter) ?? null),
    [categories, scopeFilter],
  );
  // The built-in Environment category holds the read-only ambient items; it
  // can't be deleted (the API guards it too).
  const activeCategoryProtected = useMemo(
    () =>
      activeCategory !== null &&
      items.some(
        (it) =>
          it.scope_type_id === activeCategory.scope_type_id && it.is_computed,
      ),
    [activeCategory, items],
  );

  const columns = useMemo((): MatrxColumnDef<SystemContextItem>[] => {
    return [
      {
        id: "key",
        header: "Key",
        // Tags ride along so global search + the column filter reach them.
        accessorFn: (r) => [r.key, ...r.tags].join(" "),
        width: 220,
        cell: (r) => (
          <div>
            <code className="font-mono text-xs text-foreground">{r.key}</code>
            {r.tags.length > 0 && (
              <div className="mt-1 flex flex-wrap items-center gap-1">
                <Tag className="h-3 w-3 text-muted-foreground" />
                {r.tags.slice(0, 3).map((t) => (
                  <span
                    key={t}
                    className="rounded bg-muted px-1 py-0.5 text-[10px] text-muted-foreground"
                  >
                    {t}
                  </span>
                ))}
              </div>
            )}
          </div>
        ),
      },
      {
        id: "name",
        accessorKey: "display_name",
        header: "Name",
        width: 240,
        cell: (r) => (
          <div>
            <div className="font-medium text-foreground">{r.display_name}</div>
            {r.description && (
              <div className="mt-0.5 max-w-xs truncate text-xs text-muted-foreground">
                {r.description}
              </div>
            )}
          </div>
        ),
      },
      {
        id: "category",
        accessorKey: "scope_type_label",
        header: "Category",
        filter: "select",
        width: 140,
        // A category is a `context.scope_types` row with no record route of its
        // own — this console IS its home. So the door is the one destination
        // that exists: narrow the table to that category (the same state the
        // toolbar facet drives, which then exposes its Add-item / Delete
        // actions). Naming a category without reaching its items was the dead
        // end.
        cell: (r) => (
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              setScopeFilter(r.scope_type_id);
            }}
            title={`Show only ${r.scope_type_label} items`}
            className="inline-flex items-center gap-1 rounded px-1 py-0.5 text-xs text-foreground transition-colors hover:bg-accent hover:text-primary"
          >
            <Layers className="h-3 w-3 text-muted-foreground" />
            {r.scope_type_label}
          </button>
        ),
      },
      {
        id: "feed",
        header: "Feed",
        accessorFn: (r) => feedTypeMeta(r.feed_type).label,
        filter: "select",
        width: 170,
        cell: (r) => <FeedCell item={r} />,
      },
      {
        id: "value_type",
        accessorKey: "value_type",
        header: "Type",
        filter: "select",
        width: 110,
        cell: (r) => (
          <span
            className={`inline-flex rounded px-1.5 py-0.5 text-[11px] font-medium ${valueTypeTone(
              r.value_type,
            )}`}
          >
            {r.value_type}
          </span>
        ),
      },
      {
        id: "output",
        header: "Output",
        accessorFn: outputText,
        width: 230,
        cell: (r) => <OutputCell item={r} />,
      },
      {
        id: "sensitivity",
        accessorKey: "sensitivity",
        header: "Sensitivity",
        filter: "select",
        width: 120,
        cell: (r) => (
          <span
            className={`inline-flex rounded-full px-2 py-0.5 text-[11px] font-medium ${
              SENSITIVITY_STYLES[r.sensitivity] ??
              "bg-muted text-muted-foreground"
            }`}
          >
            {r.sensitivity}
          </span>
        ),
      },
      // No `fk.token`: `context_item` is a registered entity token but has no
      // `hrefFor` and no peek, so a token here would resolve to nothing. The id
      // stays a copy-only uuid cell until the registry gains a door — the row
      // itself opens through the detail panel. Reported as a registry gap.
      {
        id: "id",
        accessorKey: "id",
        header: "ID",
        cellKind: "uuid",
        width: 110,
      },
    ];
  }, []);

  return (
    <div className="h-[calc(100dvh-2.5rem)] flex flex-col overflow-hidden bg-textured">
      <div className="flex min-h-0 flex-1 flex-col gap-4 p-6">
        <header className="flex flex-wrap items-start justify-between gap-4 pr-14">
          <div className="min-w-0">
            <h1 className="flex items-center gap-2 text-2xl font-semibold text-foreground">
              <Globe className="h-6 w-6 text-sky-500" />
              System Context
            </h1>
            <p className="mt-1 max-w-3xl text-sm text-muted-foreground">
              Platform-wide context items that resolve for{" "}
              <span className="font-medium text-foreground">every user</span>{" "}
              with no scope set — ambient (date / time / user), curated globals,
              and industry datasets. Stored in the member-less{" "}
              <code className="text-xs">matrx-system</code> org; served globally
              because their scope types are{" "}
              <code className="text-xs">is_system</code>.
            </p>
          </div>
          <div className="flex shrink-0 items-center gap-2">
            <Button
              type="button"
              size="sm"
              variant="outline"
              onClick={() => setPreviewOpen(true)}
              title="What an agent receives for global system context"
            >
              <Eye className="mr-1.5 h-4 w-4" /> Preview agent context
            </Button>
            <Button
              type="button"
              size="sm"
              variant="outline"
              onClick={() => setCreatingCategory(true)}
            >
              <Layers className="mr-1.5 h-4 w-4" /> New category
            </Button>
            <Button
              type="button"
              size="sm"
              onClick={() => openAddItem(activeCategory)}
              disabled={categories.length === 0}
              title={
                categories.length === 0
                  ? "Create a category first"
                  : "Add a system context item"
              }
            >
              <Plus className="mr-1.5 h-4 w-4" /> Add item
            </Button>
          </div>
        </header>

        {/* Stat cards */}
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          <StatCard
            icon={<Database className="h-4 w-4" />}
            label="Total items"
            value={stats.total}
            tone="text-foreground"
          />
          <StatCard
            icon={<Layers className="h-4 w-4" />}
            label="Categories"
            value={stats.categories}
            tone="text-indigo-600 dark:text-indigo-400"
          />
          <StatCard
            icon={<Clock className="h-4 w-4" />}
            label="Computed (Class 1)"
            value={stats.computed}
            tone="text-amber-600 dark:text-amber-400"
          />
          <StatCard
            icon={<Boxes className="h-4 w-4" />}
            label="Stored values"
            value={stats.stored}
            tone="text-emerald-600 dark:text-emerald-400"
          />
        </div>

        <div className="min-h-0 flex-1">
          <MatrxDataTable
            urlState={{ id: "system-context" }}
            data={rows}
            columns={columns}
            getRowId={(r) => r.id}
            isLoading={loading}
            isFetching={fetching}
            pageSize={50}
            emptyState={
              items.length === 0
                ? {
                    title: "No system context items",
                    description:
                      "No items found in the matrx-system org yet. Create a category, then add items.",
                  }
                : { title: "No items match your filters" }
            }
            toolbar={{
              search: true,
              searchPlaceholder: "Search key, name, description, tag…",
              facets: [
                {
                  type: "button-group",
                  id: "category",
                  label: "Category",
                  value: scopeFilter,
                  defaultValue: "all",
                  options: [
                    { value: "all", label: `All · ${items.length}` },
                    ...categories.map((c) => ({
                      value: c.scope_type_id,
                      label: `${c.label_singular} · ${c.item_count}`,
                    })),
                  ],
                  onChange: setScopeFilter,
                },
              ],
              actions: (
                <div className="flex items-center gap-1">
                  {activeCategory && (
                    <>
                      <Button
                        type="button"
                        size="sm"
                        variant="outline"
                        className="h-8 px-2"
                        onClick={() => openAddItem(activeCategory)}
                      >
                        <Plus className="mr-1 h-3 w-3" /> Add to{" "}
                        {activeCategory.label_singular}
                      </Button>
                      {!activeCategoryProtected && (
                        <Button
                          type="button"
                          size="icon"
                          variant="ghost"
                          className="h-8 w-8 text-muted-foreground hover:text-destructive"
                          title={`Delete category ${activeCategory.label_singular}`}
                          onClick={() => handleDeleteCategory(activeCategory)}
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </Button>
                      )}
                    </>
                  )}
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => void fetchData()}
                    disabled={fetching}
                  >
                    {fetching ? (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    ) : (
                      <RefreshCw className="h-4 w-4" />
                    )}
                  </Button>
                </div>
              ),
            }}
            copy={{
              label: "System context item",
              listLabel: "System context items (this view)",
              location: PAGE_LOCATION,
              rowKind: "system-context-item",
              listKind: "system-context-items",
              rowDescription: "A single system context item.",
              humanRow: itemSummary,
              rowAttributes: (r) => ({ id: r.id, key: r.key }),
            }}
            rowActions={(r) =>
              r.is_computed ? (
                <span
                  className="inline-flex items-center gap-1 rounded px-1.5 py-0.5 text-[11px] text-muted-foreground"
                  title="Computed at runtime — no stored value to edit"
                >
                  <Lock className="h-3 w-3" /> read-only
                </span>
              ) : (
                <div className="flex items-center justify-end gap-1">
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    className="h-7 px-2"
                    onClick={(e) => {
                      e.stopPropagation();
                      setEditing(r);
                    }}
                  >
                    <Pencil className="mr-1 h-3 w-3" /> Edit
                  </Button>
                  <Button
                    type="button"
                    size="icon"
                    variant="ghost"
                    className="h-7 w-7 text-muted-foreground hover:text-destructive"
                    title={`Delete ${r.key}`}
                    onClick={(e) => {
                      e.stopPropagation();
                      void handleDeleteItem(r);
                    }}
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </Button>
                </div>
              )
            }
            detail={{
              title: (r) => <code className="font-mono text-sm">{r.key}</code>,
              description: (r) => r.display_name,
              headerActions: (r) =>
                r.is_computed ? undefined : (
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    className="h-7 px-2"
                    onClick={() => setEditing(r)}
                  >
                    <Pencil className="mr-1 h-3 w-3" /> Edit
                  </Button>
                ),
            }}
            window={{ title: (r) => r.key }}
          />
        </div>
      </div>

      {editing && (
        <EditItemDialog
          item={editing}
          categories={categories}
          onClose={() => setEditing(null)}
          onSaved={async () => {
            setEditing(null);
            await fetchData();
          }}
        />
      )}

      {creatingCategory && (
        <NewScopeTypeDialog
          onClose={() => setCreatingCategory(false)}
          onSaved={async () => {
            setCreatingCategory(false);
            await fetchData();
          }}
        />
      )}

      {addItemOpen && (
        <AddItemDialog
          categories={categories}
          preset={addItemPreset}
          onClose={() => setAddItemOpen(false)}
          onSaved={async () => {
            setAddItemOpen(false);
            await fetchData();
          }}
        />
      )}

      {previewOpen && <PreviewDialog onClose={() => setPreviewOpen(false)} />}
    </div>
  );
}
