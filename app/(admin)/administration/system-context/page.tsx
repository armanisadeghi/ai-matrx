"use client";

// System Context — Super Admin only.
//
// The (admin) layout already requires Super Admin and the
// /api/admin/system-context route re-checks server-side. This is the control
// plane for platform-wide "System Context resources" that resolve for EVERY
// user with no scope selection (their scope types carry is_system=true in the
// member-less "Matrx System" org).
//
// A resource is a DEFINITION + a FEED — the value is the feed's output, not the
// authored thing. Feeds (see parts/FeedConfigEditor.tsx):
//   - dataset  — points at a RAG data store; agents query it (LIVE: the AMA
//     Guides). Resolves to a pointer via resolve_full_context loop 4c.
//   - manual   — a typed value (rare; the component-aware editor). LIVE.
//   - computed — code/expression at resolution (the ambient current_* keys are
//     reserved computes in matrx_ai.context_engine; user-defined code later).
//   - agent / api / web — definition captured now; executor lands later
//     (feed_status='pending', honestly labeled in the UI).
// "Preview agent context" shows exactly what an agent receives globally.

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
  Search,
  Tag,
  Trash2,
} from "lucide-react";
import { toast } from "sonner";

import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { CopyButtons } from "@/components/agent-copy/CopyButtons";
import { confirm } from "@/components/dialogs/confirm/ConfirmDialogHost";
import { CustomComponentConfigurator } from "@/features/agents/components/variables-management/CustomComponentConfigurator";
import { VariableInputComponent } from "@/features/agents/components/inputs/input-components/VariableInputComponent";
import { buildScopeValuePayload } from "@/features/scope-system/utils/scopeValuePayload";
import type { VariableCustomComponent } from "@/features/agents/types/agent-definition.types";
import {
  FeedConfigEditor,
  feedTypeMeta,
  feedTypeTone,
  asFeedConfig,
  type FeedType,
  type FeedConfig,
} from "./parts/FeedConfigEditor";
import type { Database as DB } from "@/types/database.types";
import type {
  ResolvedPreviewEntry,
  SystemContextCategory,
  SystemContextItem,
  SystemContextPayload,
} from "@/app/api/admin/system-context/route";

type ValueType = DB["public"]["Enums"]["context_value_type"];
type Sensitivity = DB["public"]["Enums"]["context_sensitivity"];

const VALUE_TYPE_OPTIONS: { value: ValueType; label: string }[] = [
  { value: "string", label: "Text (string)" },
  { value: "number", label: "Number" },
  { value: "boolean", label: "Boolean" },
  { value: "date", label: "Date" },
  { value: "object", label: "Object (JSON)" },
  { value: "array", label: "Array (JSON)" },
  { value: "document", label: "Document / media" },
  { value: "reference", label: "Reference" },
];

const SENSITIVITY_OPTIONS: { value: Sensitivity; label: string }[] = [
  { value: "public", label: "Public" },
  { value: "internal", label: "Internal" },
  { value: "restricted", label: "Restricted" },
  { value: "privileged", label: "Privileged" },
];

const PAGE_LOCATION =
  "AI Matrx Admin — System Context (/administration/system-context)";

const SENSITIVITY_STYLES: Record<string, string> = {
  public:
    "bg-emerald-100 text-emerald-800 dark:bg-emerald-900/40 dark:text-emerald-200",
  internal: "bg-sky-100 text-sky-800 dark:bg-sky-900/40 dark:text-sky-200",
  restricted:
    "bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-200",
  privileged:
    "bg-rose-100 text-rose-800 dark:bg-rose-900/40 dark:text-rose-200",
};

function valueTypeTone(t: string): string {
  switch (t) {
    case "string":
      return "bg-blue-100 text-blue-800 dark:bg-blue-900/40 dark:text-blue-200";
    case "number":
      return "bg-violet-100 text-violet-800 dark:bg-violet-900/40 dark:text-violet-200";
    case "boolean":
      return "bg-teal-100 text-teal-800 dark:bg-teal-900/40 dark:text-teal-200";
    case "date":
      return "bg-cyan-100 text-cyan-800 dark:bg-cyan-900/40 dark:text-cyan-200";
    case "object":
    case "array":
      return "bg-indigo-100 text-indigo-800 dark:bg-indigo-900/40 dark:text-indigo-200";
    case "document":
      return "bg-fuchsia-100 text-fuchsia-800 dark:bg-fuchsia-900/40 dark:text-fuchsia-200";
    case "reference":
      return "bg-pink-100 text-pink-800 dark:bg-pink-900/40 dark:text-pink-200";
    default:
      return "bg-muted text-muted-foreground";
  }
}

function itemSummary(it: SystemContextItem): string {
  return [
    `Key: ${it.key}`,
    `Name: ${it.display_name}`,
    `Category: ${it.scope_type_label}`,
    `Type: ${it.value_type}`,
    `Component: ${it.component_type ?? "—"}`,
    `Sensitivity: ${it.sensitivity}`,
    `Status: ${it.status}`,
    `Value: ${it.is_computed ? "(computed at runtime)" : (it.current_value ?? "—")}`,
    it.description ? `Description: ${it.description}` : null,
  ]
    .filter(Boolean)
    .join("\n");
}

export default function SystemContextPage() {
  const [data, setData] = useState<SystemContextPayload | null>(null);
  const [loading, setLoading] = useState(true);
  const [query, setQuery] = useState("");
  const [scopeFilter, setScopeFilter] = useState<string>("all");
  const [editing, setEditing] = useState<SystemContextItem | null>(null);
  const [creatingCategory, setCreatingCategory] = useState(false);
  const [addItemPreset, setAddItemPreset] = useState<SystemContextCategory | null>(
    null,
  );
  const [addItemOpen, setAddItemOpen] = useState(false);
  const [previewOpen, setPreviewOpen] = useState(false);

  const fetchData = useCallback(async () => {
    const res = await fetch("/api/admin/system-context");
    if (!res.ok) {
      const { error } = await res
        .json()
        .catch(() => ({ error: res.statusText }));
      toast.error(`Failed to load system context: ${error}`);
      return;
    }
    setData((await res.json()) as SystemContextPayload);
  }, []);

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
        const { error } = await res.json().catch(() => ({ error: res.statusText }));
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
        const { error } = await res.json().catch(() => ({ error: res.statusText }));
        toast.error(`Delete failed: ${error}`);
        return;
      }
      toast.success(`Deleted category ${category.label_singular}.`);
      await fetchData();
    },
    [fetchData],
  );

  useEffect(() => {
    fetchData().finally(() => setLoading(false));
  }, [fetchData]);

  const items = data?.items ?? [];
  const categories = data?.categories ?? [];

  const stats = useMemo(() => {
    const total = items.length;
    const computed = items.filter((i) => i.is_computed).length;
    const stored = total - computed;
    return { total, computed, stored, categories: categories.length };
  }, [items, categories]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return items.filter((it) => {
      if (scopeFilter !== "all" && it.scope_type_id !== scopeFilter)
        return false;
      if (!q) return true;
      return (
        it.key.toLowerCase().includes(q) ||
        it.display_name.toLowerCase().includes(q) ||
        (it.description ?? "").toLowerCase().includes(q) ||
        it.tags.some((t) => t.toLowerCase().includes(q))
      );
    });
  }, [items, query, scopeFilter]);

  // Group filtered items by scope type (category) for a dense, scannable list.
  const grouped = useMemo(() => {
    const byType = new Map<string, SystemContextItem[]>();
    for (const it of filtered) {
      const arr = byType.get(it.scope_type_id) ?? [];
      arr.push(it);
      byType.set(it.scope_type_id, arr);
    }
    return categories
      .map((c) => ({ category: c, rows: byType.get(c.scope_type_id) ?? [] }))
      .filter((g) => g.rows.length > 0);
  }, [filtered, categories]);

  return (
    <div className="h-[calc(100dvh-2.5rem)] flex flex-col overflow-hidden bg-textured">
      <div className="flex-1 overflow-y-auto p-6 space-y-6">
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
              because their scope types are <code className="text-xs">
                is_system
              </code>
              .
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
              onClick={() => openAddItem(null)}
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

        {/* Toolbar */}
        <div className="flex flex-wrap items-center gap-3">
          <div className="relative flex-1 min-w-[240px]">
            <Search className="absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search by key, name, description, or tag"
              className="pl-8"
            />
          </div>
          <div className="flex flex-wrap items-center gap-1">
            <Button
              type="button"
              size="sm"
              variant={scopeFilter === "all" ? "default" : "outline"}
              onClick={() => setScopeFilter("all")}
            >
              All
            </Button>
            {categories.map((c) => (
              <Button
                key={c.scope_type_id}
                type="button"
                size="sm"
                variant={scopeFilter === c.scope_type_id ? "default" : "outline"}
                onClick={() => setScopeFilter(c.scope_type_id)}
              >
                {c.label_singular}
                <span className="ml-1.5 text-xs opacity-70">{c.item_count}</span>
              </Button>
            ))}
          </div>
        </div>

        {/* Catalog */}
        {loading ? (
          <div className="flex items-center justify-center gap-2 rounded-lg border border-border bg-card p-10 text-muted-foreground">
            <Loader2 className="h-5 w-5 animate-spin" /> Loading system context…
          </div>
        ) : items.length === 0 ? (
          <div className="rounded-lg border border-border bg-card p-10 text-center text-sm text-muted-foreground">
            No system context items found in the{" "}
            <code className="text-xs">matrx-system</code> org.
          </div>
        ) : grouped.length === 0 ? (
          <div className="rounded-lg border border-border bg-card p-10 text-center text-sm text-muted-foreground">
            No items match your filters.
          </div>
        ) : (
          <div className="space-y-4">
            {grouped.map(({ category, rows }) => (
              <CategoryBlock
                key={category.scope_type_id}
                category={category}
                rows={rows}
                onEdit={setEditing}
                onAddItem={openAddItem}
                onDeleteItem={handleDeleteItem}
                onDeleteCategory={handleDeleteCategory}
              />
            ))}
          </div>
        )}
      </div>

      {editing && (
        <EditItemDialog
          item={editing}
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

// Shows exactly what an agent receives for global system context (no scope),
// straight from the live resolver — the end-to-end proof that feeds deliver.
function PreviewDialog({ onClose }: { onClose: () => void }) {
  const [entries, setEntries] = useState<ResolvedPreviewEntry[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const res = await fetch("/api/admin/system-context?preview=1");
      if (!res.ok) {
        const { error } = await res.json().catch(() => ({ error: res.statusText }));
        if (!cancelled) setError(String(error));
        return;
      }
      const { resolved } = (await res.json()) as { resolved: ResolvedPreviewEntry[] };
      if (!cancelled) setEntries(resolved);
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-h-[90dvh] overflow-y-auto sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Eye className="h-5 w-5 text-sky-500" /> What agents receive
          </DialogTitle>
          <DialogDescription>
            The live global system context — what every agent gets with no scope
            selected, straight from <code className="text-xs">resolve_full_context</code>.
            Ambient values compute fresh per request; dataset feeds arrive as
            pointers agents query with the RAG tools.
          </DialogDescription>
        </DialogHeader>

        {error ? (
          <p className="py-6 text-center text-sm text-destructive">{error}</p>
        ) : entries === null ? (
          <div className="flex items-center justify-center gap-2 py-10 text-muted-foreground">
            <Loader2 className="h-5 w-5 animate-spin" /> Resolving…
          </div>
        ) : entries.length === 0 ? (
          <p className="py-10 text-center text-sm text-muted-foreground">
            No global system context resolves yet.
          </p>
        ) : (
          <div className="space-y-2 py-1">
            {entries.map((e) => (
              <div key={e.key} className="rounded-md border border-border bg-card p-3">
                <div className="flex items-center gap-2">
                  <code className="font-mono text-xs font-semibold text-foreground">
                    {e.key}
                  </code>
                  <span className="rounded bg-muted px-1.5 py-0.5 text-[10px] text-muted-foreground">
                    {e.type}
                  </span>
                </div>
                {e.description && (
                  <div className="mt-0.5 text-xs text-muted-foreground">
                    {e.description}
                  </div>
                )}
                <pre className="mt-1.5 overflow-x-auto whitespace-pre-wrap break-words rounded bg-muted/50 p-2 font-mono text-[11px] text-foreground">
                  {typeof e.value === "string"
                    ? e.value
                    : JSON.stringify(e.value, null, 2)}
                </pre>
              </div>
            ))}
          </div>
        )}

        <DialogFooter>
          <Button type="button" variant="outline" onClick={onClose}>
            Close
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
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

function CategoryBlock({
  category,
  rows,
  onEdit,
  onAddItem,
  onDeleteItem,
  onDeleteCategory,
}: {
  category: SystemContextCategory;
  rows: SystemContextItem[];
  onEdit: (it: SystemContextItem) => void;
  onAddItem: (category: SystemContextCategory) => void;
  onDeleteItem: (it: SystemContextItem) => void;
  onDeleteCategory: (category: SystemContextCategory) => void;
}) {
  // The built-in Environment category holds the read-only ambient items; it
  // can't be deleted (the API guards it too).
  const isProtected = rows.some((r) => r.is_computed);
  return (
    <section className="rounded-lg border border-border bg-card">
      <div className="flex items-center justify-between gap-3 border-b border-border px-4 py-2.5">
        <div className="flex items-center gap-2 min-w-0">
          <Layers className="h-4 w-4 shrink-0 text-muted-foreground" />
          <h2 className="truncate text-sm font-semibold text-foreground">
            {category.label_singular}
          </h2>
          <Badge variant="secondary" className="shrink-0">
            {rows.length} {rows.length === 1 ? "item" : "items"}
          </Badge>
          {category.description && (
            <span className="hidden truncate text-xs text-muted-foreground lg:inline">
              {category.description}
            </span>
          )}
        </div>
        <div className="flex shrink-0 items-center gap-1">
          <Button
            type="button"
            size="sm"
            variant="outline"
            className="h-7 px-2"
            onClick={() => onAddItem(category)}
          >
            <Plus className="mr-1 h-3 w-3" /> Add item
          </Button>
          {!isProtected && (
            <Button
              type="button"
              size="icon"
              variant="ghost"
              className="h-7 w-7 text-muted-foreground hover:text-destructive"
              title={`Delete category ${category.label_singular}`}
              onClick={() => onDeleteCategory(category)}
            >
              <Trash2 className="h-3.5 w-3.5" />
            </Button>
          )}
        </div>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-border text-left text-xs uppercase tracking-wide text-muted-foreground">
              <th className="px-4 py-2 font-medium">Key</th>
              <th className="px-4 py-2 font-medium">Name</th>
              <th className="px-4 py-2 font-medium">Feed</th>
              <th className="px-4 py-2 font-medium">Type</th>
              <th className="px-4 py-2 font-medium">Output</th>
              <th className="px-4 py-2 font-medium">Sensitivity</th>
              <th className="px-4 py-2 font-medium text-right">Actions</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((it) => (
              <tr
                key={it.id}
                className="border-b border-border/60 last:border-0 hover:bg-accent/40"
              >
                <td className="px-4 py-2 align-top">
                  <code className="font-mono text-xs text-foreground">
                    {it.key}
                  </code>
                  {it.tags.length > 0 && (
                    <div className="mt-1 flex flex-wrap items-center gap-1">
                      <Tag className="h-3 w-3 text-muted-foreground" />
                      {it.tags.slice(0, 3).map((t) => (
                        <span
                          key={t}
                          className="rounded bg-muted px-1 py-0.5 text-[10px] text-muted-foreground"
                        >
                          {t}
                        </span>
                      ))}
                    </div>
                  )}
                </td>
                <td className="px-4 py-2 align-top">
                  <div className="font-medium text-foreground">
                    {it.display_name}
                  </div>
                  {it.description && (
                    <div className="mt-0.5 max-w-xs truncate text-xs text-muted-foreground">
                      {it.description}
                    </div>
                  )}
                </td>
                <td className="px-4 py-2 align-top">
                  <FeedCell item={it} />
                </td>
                <td className="px-4 py-2 align-top">
                  <span
                    className={`inline-flex rounded px-1.5 py-0.5 text-[11px] font-medium ${valueTypeTone(
                      it.value_type,
                    )}`}
                  >
                    {it.value_type}
                  </span>
                </td>
                <td className="px-4 py-2 align-top">
                  <OutputCell item={it} />
                </td>
                <td className="px-4 py-2 align-top">
                  <span
                    className={`inline-flex rounded-full px-2 py-0.5 text-[11px] font-medium ${
                      SENSITIVITY_STYLES[it.sensitivity] ??
                      "bg-muted text-muted-foreground"
                    }`}
                  >
                    {it.sensitivity}
                  </span>
                </td>
                <td className="px-4 py-2 align-top text-right">
                  <div className="flex items-center justify-end gap-1">
                    {it.is_computed ? (
                      <span
                        className="inline-flex items-center gap-1 rounded px-1.5 py-0.5 text-[11px] text-muted-foreground"
                        title="Computed at runtime — no stored value to edit"
                      >
                        <Lock className="h-3 w-3" /> read-only
                      </span>
                    ) : (
                      <>
                        <Button
                          type="button"
                          size="sm"
                          variant="outline"
                          className="h-7 px-2"
                          onClick={() => onEdit(it)}
                        >
                          <Pencil className="mr-1 h-3 w-3" /> Edit
                        </Button>
                        <Button
                          type="button"
                          size="icon"
                          variant="ghost"
                          className="h-7 w-7 text-muted-foreground hover:text-destructive"
                          title={`Delete ${it.key}`}
                          onClick={() => onDeleteItem(it)}
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </Button>
                      </>
                    )}
                    <CopyButtons
                      human={() => itemSummary(it)}
                      agent={() => ({
                        kind: "record",
                        location: PAGE_LOCATION,
                        description: "A single system context item.",
                        data: it,
                        summary: itemSummary(it),
                        attributes: { id: it.id, key: it.key },
                      })}
                      label={it.key}
                      size="icon"
                    />
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}

// The Feed cell — how the item is populated, with live status.
function FeedCell({ item }: { item: SystemContextItem }) {
  const meta = feedTypeMeta(item.feed_type);
  const Icon = meta.icon;
  const cfg = asFeedConfig(item.feed_config);
  const datasetName =
    typeof cfg.data_store_name === "string" ? cfg.data_store_name : null;
  return (
    <div className="space-y-0.5">
      <span
        className={`inline-flex items-center gap-1 rounded px-1.5 py-0.5 text-[11px] font-medium ${feedTypeTone(
          item.feed_type,
        )}`}
      >
        <Icon className="h-3 w-3" /> {meta.label}
      </span>
      {item.feed_type === "dataset" && datasetName && (
        <div className="max-w-[180px] truncate text-[11px] text-muted-foreground">
          → {datasetName}
        </div>
      )}
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
  return (
    <code className="block max-w-[220px] truncate font-mono text-xs text-foreground">
      {item.current_value}
    </code>
  );
}

// Initial editor value: structured (parsed) for JSON/media custom components,
// raw string otherwise.
function initialEditorValue(item: SystemContextItem): unknown {
  const cur = item.current_value;
  if (cur == null) return "";
  const cc = item.custom_component as VariableCustomComponent | null;
  const structured =
    item.value_type === "object" ||
    item.value_type === "array" ||
    (cc != null && isMediaComponentType(cc.type));
  if (structured) {
    try {
      return JSON.parse(cur);
    } catch {
      return cur;
    }
  }
  return cur;
}

function isMediaComponentType(t: string | undefined): boolean {
  return (
    t === "image" ||
    t === "audio" ||
    t === "video" ||
    t === "youtube" ||
    t === "document"
  );
}

// Edit the DEFINITION + FEED of an item (not just a value). For manual feeds it
// also edits the value; other feeds edit only the definition/feed config.
function EditItemDialog({
  item,
  onClose,
  onSaved,
}: {
  item: SystemContextItem;
  onClose: () => void;
  onSaved: () => void | Promise<void>;
}) {
  const [displayName, setDisplayName] = useState(item.display_name);
  const [description, setDescription] = useState(item.description);
  const [sensitivity, setSensitivity] = useState<Sensitivity>(item.sensitivity);
  const [feedType, setFeedType] = useState<FeedType>(item.feed_type);
  const [feedConfig, setFeedConfig] = useState<FeedConfig>(
    asFeedConfig(item.feed_config),
  );
  const [value, setValue] = useState<unknown>(() => initialEditorValue(item));
  const [saving, setSaving] = useState(false);

  const customComponent =
    (item.custom_component as VariableCustomComponent | null) ?? undefined;

  async function save() {
    setSaving(true);
    try {
      // 1. The definition + feed.
      const patchRes = await fetch("/api/admin/system-context", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          itemId: item.id,
          display_name: displayName,
          description,
          sensitivity,
          feed_type: feedType,
          feed_config: feedConfig,
        }),
      });
      if (!patchRes.ok) {
        const { error } = await patchRes.json().catch(() => ({ error: patchRes.statusText }));
        toast.error(`Save failed: ${error}`);
        return;
      }
      // 2. Manual feeds also carry a value (new versioned row).
      if (feedType === "manual" && item.scope_id) {
        const valueColumns = buildScopeValuePayload(value, item.value_type);
        const vRes = await fetch("/api/admin/system-context", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            action: "set_value",
            itemId: item.id,
            scopeId: item.scope_id,
            valueType: item.value_type,
            valueColumns,
          }),
        });
        if (!vRes.ok) {
          const { error } = await vRes.json().catch(() => ({ error: vRes.statusText }));
          toast.error(`Saved definition, but value failed: ${error}`);
          return;
        }
      }
      toast.success(`Updated ${item.key}.`);
      await onSaved();
    } finally {
      setSaving(false);
    }
  }

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-h-[90dvh] overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            Edit
            <code className="rounded bg-muted px-1.5 py-0.5 font-mono text-sm">
              {item.key}
            </code>
          </DialogTitle>
          <DialogDescription>
            Edit the definition and how it&apos;s populated
            {feedType === "manual" ? ", including its value" : ""}. In{" "}
            <span className="font-medium">{item.scope_type_label}</span>.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3 py-1">
          <Field label="Display name">
            <Input value={displayName} onChange={(e) => setDisplayName(e.target.value)} />
          </Field>
          <Field label="Description" hint="Optional.">
            <Textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              rows={2}
            />
          </Field>
          <Field label="Sensitivity">
            <Select value={sensitivity} onValueChange={(v) => setSensitivity(v as Sensitivity)}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                {SENSITIVITY_OPTIONS.map((o) => (
                  <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </Field>

          <div className="rounded-md border border-border bg-muted/30 p-3">
            <FeedConfigEditor
              feedType={feedType}
              onFeedTypeChange={setFeedType}
              feedConfig={feedConfig}
              onFeedConfigChange={setFeedConfig}
            />
          </div>

          {feedType === "manual" && (
            <Field
              label="Value"
              hint={
                item.scope_id
                  ? "Saving inserts a new current version (history retained)."
                  : "No scope to write to."
              }
            >
              <ItemValueField
                valueType={item.value_type}
                customComponent={customComponent}
                variableName={displayName || item.key}
                value={value}
                onChange={setValue}
              />
            </Field>
          )}
        </div>

        <DialogFooter>
          <Button type="button" variant="outline" onClick={onClose} disabled={saving}>
            Cancel
          </Button>
          <Button type="button" onClick={save} disabled={saving}>
            {saving && <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />}
            Save
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// One value field that honors the item's component when set, else falls back to
// a type-appropriate plain input. Shared by the edit + add dialogs.
function ItemValueField({
  valueType,
  customComponent,
  variableName,
  value,
  onChange,
}: {
  valueType: ValueType;
  customComponent: VariableCustomComponent | undefined;
  variableName: string;
  value: unknown;
  onChange: (v: unknown) => void;
}) {
  if (customComponent) {
    return (
      <VariableInputComponent
        value={value}
        onChange={onChange}
        variableName={variableName}
        customComponent={customComponent}
        hideLabel
      />
    );
  }

  const isJson = valueType === "object" || valueType === "array";
  const isMultiline = isJson || valueType === "string" || valueType === "document";
  const str = typeof value === "string" ? value : value == null ? "" : String(value);

  if (isMultiline) {
    return (
      <Textarea
        value={str}
        onChange={(e) => onChange(e.target.value)}
        rows={isJson ? 8 : 4}
        placeholder={isJson ? (valueType === "array" ? "[]" : "{}") : "Value"}
        className={isJson ? "font-mono text-xs" : ""}
      />
    );
  }
  return (
    <Input
      value={str}
      onChange={(e) => onChange(e.target.value)}
      type={valueType === "number" ? "number" : "text"}
      placeholder={
        valueType === "boolean"
          ? "true or false"
          : valueType === "date"
            ? "YYYY-MM-DD"
            : "Value"
      }
    />
  );
}

// Create a new System category (a scope type + its one value-holding scope).
function NewScopeTypeDialog({
  onClose,
  onSaved,
}: {
  onClose: () => void;
  onSaved: () => void | Promise<void>;
}) {
  const [singular, setSingular] = useState("");
  const [plural, setPlural] = useState("");
  const [description, setDescription] = useState("");
  const [saving, setSaving] = useState(false);

  async function save() {
    if (!singular.trim()) {
      toast.error("A name is required.");
      return;
    }
    setSaving(true);
    try {
      const res = await fetch("/api/admin/system-context", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "create_scope_type",
          label_singular: singular.trim(),
          label_plural: plural.trim() || singular.trim(),
          description: description.trim(),
        }),
      });
      if (!res.ok) {
        const { error } = await res.json().catch(() => ({ error: res.statusText }));
        toast.error(`Create failed: ${error}`);
        return;
      }
      toast.success(`Created category "${singular.trim()}".`);
      await onSaved();
    } finally {
      setSaving(false);
    }
  }

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>New System category</DialogTitle>
          <DialogDescription>
            A platform-wide scope type (e.g. Company, Brand, Platform). Its items
            resolve for every user. Created as a system category in the
            member-less <code className="text-xs">matrx-system</code> org.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-3 py-1">
          <Field label="Name (singular)">
            <Input
              value={singular}
              onChange={(e) => setSingular(e.target.value)}
              placeholder="Company"
              autoFocus
            />
          </Field>
          <Field label="Name (plural)" hint="Defaults to the singular name.">
            <Input
              value={plural}
              onChange={(e) => setPlural(e.target.value)}
              placeholder="Companies"
            />
          </Field>
          <Field label="Description" hint="Optional.">
            <Textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              rows={2}
              placeholder="What kind of platform-wide values live here."
            />
          </Field>
        </div>
        <DialogFooter>
          <Button type="button" variant="outline" onClick={onClose} disabled={saving}>
            Cancel
          </Button>
          <Button type="button" onClick={save} disabled={saving}>
            {saving && <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />}
            Create category
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// Create a new System context item (definition + component + optional value).
function AddItemDialog({
  categories,
  preset,
  onClose,
  onSaved,
}: {
  categories: SystemContextCategory[];
  preset: SystemContextCategory | null;
  onClose: () => void;
  onSaved: () => void | Promise<void>;
}) {
  const [scopeTypeId, setScopeTypeId] = useState(preset?.scope_type_id ?? "");
  const [key, setKey] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [valueType, setValueType] = useState<ValueType>("string");
  const [sensitivity, setSensitivity] = useState<Sensitivity>("internal");
  const [description, setDescription] = useState("");
  const [customComponent, setCustomComponent] = useState<
    VariableCustomComponent | undefined
  >(undefined);
  const [value, setValue] = useState<unknown>("");
  const [feedType, setFeedType] = useState<FeedType>("dataset");
  const [feedConfig, setFeedConfig] = useState<FeedConfig>({});
  const [saving, setSaving] = useState(false);

  const isManual = feedType === "manual";
  const keyValid = key === "" || /^[a-z0-9_]+$/.test(key);

  async function save() {
    if (!scopeTypeId) {
      toast.error("Pick a category.");
      return;
    }
    if (!key.trim()) {
      toast.error("A key is required.");
      return;
    }
    if (!keyValid) {
      toast.error("Key may only use lowercase letters, numbers, underscores.");
      return;
    }
    if (!displayName.trim()) {
      toast.error("A display name is required.");
      return;
    }
    if (feedType === "dataset" && !feedConfig.data_store_id) {
      toast.error("Pick a knowledge resource for the dataset feed.");
      return;
    }

    const hasValue =
      isManual && value != null && !(typeof value === "string" && value.trim() === "");
    setSaving(true);
    try {
      const res = await fetch("/api/admin/system-context", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "create_item",
          scopeTypeId,
          key: key.trim().toLowerCase(),
          display_name: displayName.trim(),
          value_type: isManual ? valueType : "string",
          sensitivity,
          description: description.trim(),
          custom_component: isManual ? (customComponent ?? null) : null,
          feed_type: feedType,
          feed_config: isManual ? {} : feedConfig,
          valueColumns: hasValue
            ? buildScopeValuePayload(value, valueType)
            : undefined,
        }),
      });
      if (!res.ok) {
        const { error } = await res.json().catch(() => ({ error: res.statusText }));
        toast.error(`Create failed: ${error}`);
        return;
      }
      toast.success(`Created item "${key.trim().toLowerCase()}".`);
      await onSaved();
      return;
    } finally {
      setSaving(false);
    }
  }

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-h-[90dvh] overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Add System context resource</DialogTitle>
          <DialogDescription>
            A reusable, platform-wide resource. Define what it is, then choose how
            it stays populated — link a dataset, run an agent, hit an API, scrape
            the web, or (rarely) set a value by hand.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3 py-1">
          <Field label="Category">
            <Select value={scopeTypeId} onValueChange={setScopeTypeId}>
              <SelectTrigger>
                <SelectValue placeholder="Pick a category" />
              </SelectTrigger>
              <SelectContent>
                {categories.map((c) => (
                  <SelectItem key={c.scope_type_id} value={c.scope_type_id}>
                    {c.label_singular}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </Field>

          <div className="grid grid-cols-2 gap-3">
            <Field
              label="Key"
              hint={keyValid ? "lowercase_with_underscores" : undefined}
              error={!keyValid ? "lowercase letters, numbers, _ only" : undefined}
            >
              <Input
                value={key}
                onChange={(e) => setKey(e.target.value)}
                placeholder="company_name"
                className="font-mono text-sm"
              />
            </Field>
            <Field label="Display name">
              <Input
                value={displayName}
                onChange={(e) => setDisplayName(e.target.value)}
                placeholder="Company Name"
              />
            </Field>
          </div>

          <Field label="Sensitivity">
            <Select
              value={sensitivity}
              onValueChange={(v) => setSensitivity(v as Sensitivity)}
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {SENSITIVITY_OPTIONS.map((o) => (
                  <SelectItem key={o.value} value={o.value}>
                    {o.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </Field>

          <Field label="Description" hint="Optional.">
            <Textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              rows={2}
              placeholder="What this resource represents and where it's used."
            />
          </Field>

          {/* The feed — how this resource is populated. */}
          <div className="rounded-md border border-border bg-muted/30 p-3">
            <FeedConfigEditor
              feedType={feedType}
              onFeedTypeChange={setFeedType}
              feedConfig={feedConfig}
              onFeedConfigChange={setFeedConfig}
            />
          </div>

          {/* Manual feeds author a value with a real input component. */}
          {isManual && (
            <>
              <div className="grid grid-cols-2 gap-3">
                <Field label="Value type">
                  <Select
                    value={valueType}
                    onValueChange={(v) => setValueType(v as ValueType)}
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {VALUE_TYPE_OPTIONS.map((o) => (
                        <SelectItem key={o.value} value={o.value}>
                          {o.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </Field>
              </div>

              <div className="rounded-md border border-border bg-muted/30 p-3">
                <div className="mb-2 text-xs font-medium text-muted-foreground">
                  Input component (how the value is authored)
                </div>
                <CustomComponentConfigurator
                  value={customComponent}
                  onChange={setCustomComponent}
                />
              </div>

              <Field label="Initial value" hint="Optional — you can set it later.">
                <ItemValueField
                  valueType={valueType}
                  customComponent={customComponent}
                  variableName={displayName || key || "value"}
                  value={value}
                  onChange={setValue}
                />
              </Field>
            </>
          )}
        </div>

        <DialogFooter>
          <Button type="button" variant="outline" onClick={onClose} disabled={saving}>
            Cancel
          </Button>
          <Button type="button" onClick={save} disabled={saving}>
            {saving && <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />}
            Create item
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function Field({
  label,
  hint,
  error,
  children,
}: {
  label: string;
  hint?: string;
  error?: string;
  children: React.ReactNode;
}) {
  return (
    <label className="block space-y-1">
      <span className="text-xs font-medium text-foreground">{label}</span>
      {children}
      {error ? (
        <span className="block text-[11px] text-destructive">{error}</span>
      ) : hint ? (
        <span className="block text-[11px] text-muted-foreground">{hint}</span>
      ) : null}
    </label>
  );
}
