"use client";

// System Context — Super Admin only.
//
// The (admin) layout already requires Super Admin and the
// /api/admin/system-context route re-checks server-side. This page is the
// management surface for platform-wide "System Context Items": typed, reusable
// values that resolve for EVERY user with no scope selection (their scope types
// carry is_system=true in the member-less "Matrx System" org).
//
// Three product classes (only Class 1 exists today, page grows into 2 & 3):
//   1. Ambient / computed — current_date, current_user_id, … (server computes
//      per request; read-only here, shown as "Computed").
//   2. Curated globals — stored values refreshed by jobs. None yet.
//   3. Industry datasets — scraped/structured platform data. None yet.

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  Boxes,
  Clock,
  Database,
  Globe,
  Layers,
  Loader2,
  Lock,
  Pencil,
  Search,
  Tag,
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
import { CopyButtons } from "@/components/agent-copy/CopyButtons";
import type {
  SystemContextCategory,
  SystemContextItem,
  SystemContextPayload,
} from "@/app/api/admin/system-context/route";

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
              />
            ))}
          </div>
        )}
      </div>

      {editing && (
        <EditValueDialog
          item={editing}
          onClose={() => setEditing(null)}
          onSaved={async () => {
            setEditing(null);
            await fetchData();
          }}
        />
      )}
    </div>
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
}: {
  category: SystemContextCategory;
  rows: SystemContextItem[];
  onEdit: (it: SystemContextItem) => void;
}) {
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
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-border text-left text-xs uppercase tracking-wide text-muted-foreground">
              <th className="px-4 py-2 font-medium">Key</th>
              <th className="px-4 py-2 font-medium">Name</th>
              <th className="px-4 py-2 font-medium">Type</th>
              <th className="px-4 py-2 font-medium">Component</th>
              <th className="px-4 py-2 font-medium">Value</th>
              <th className="px-4 py-2 font-medium">Sensitivity</th>
              <th className="px-4 py-2 font-medium">Status</th>
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
                  <span
                    className={`inline-flex rounded px-1.5 py-0.5 text-[11px] font-medium ${valueTypeTone(
                      it.value_type,
                    )}`}
                  >
                    {it.value_type}
                  </span>
                </td>
                <td className="px-4 py-2 align-top text-xs text-muted-foreground">
                  {it.component_type ? (
                    <span className="rounded bg-muted px-1.5 py-0.5 text-[11px] text-foreground">
                      {it.component_type}
                    </span>
                  ) : (
                    "—"
                  )}
                </td>
                <td className="px-4 py-2 align-top">
                  {it.is_computed ? (
                    <span className="inline-flex items-center gap-1 rounded-full bg-amber-100 px-2 py-0.5 text-[11px] font-medium text-amber-800 dark:bg-amber-900/40 dark:text-amber-200">
                      <Clock className="h-3 w-3" /> Computed
                    </span>
                  ) : it.current_value === null ? (
                    <span className="text-xs italic text-muted-foreground">
                      not set
                    </span>
                  ) : (
                    <code className="block max-w-[220px] truncate font-mono text-xs text-foreground">
                      {it.current_value}
                    </code>
                  )}
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
                <td className="px-4 py-2 align-top text-xs text-muted-foreground">
                  {it.status}
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
                      <Button
                        type="button"
                        size="sm"
                        variant="outline"
                        className="h-7 px-2"
                        onClick={() => onEdit(it)}
                        disabled={!it.scope_id}
                      >
                        <Pencil className="mr-1 h-3 w-3" /> Edit
                      </Button>
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

function EditValueDialog({
  item,
  onClose,
  onSaved,
}: {
  item: SystemContextItem;
  onClose: () => void;
  onSaved: () => void | Promise<void>;
}) {
  const [value, setValue] = useState<string>(item.current_value ?? "");
  const [saving, setSaving] = useState(false);

  const isJson = item.value_type === "object" || item.value_type === "array";
  const isMultiline =
    isJson || item.value_type === "string" || item.value_type === "document";

  async function save() {
    if (!item.scope_id) {
      toast.error("This item has no scope to write to.");
      return;
    }
    setSaving(true);
    try {
      const res = await fetch("/api/admin/system-context", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          itemId: item.id,
          scopeId: item.scope_id,
          valueType: item.value_type,
          value,
        }),
      });
      if (!res.ok) {
        const { error } = await res
          .json()
          .catch(() => ({ error: res.statusText }));
        toast.error(`Save failed: ${error}`);
        return;
      }
      toast.success(`Updated value for ${item.key}.`);
      await onSaved();
    } finally {
      setSaving(false);
    }
  }

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            Edit value
            <code className="rounded bg-muted px-1.5 py-0.5 font-mono text-sm">
              {item.key}
            </code>
          </DialogTitle>
          <DialogDescription>
            {item.display_name} ·{" "}
            <span className="font-medium">{item.value_type}</span> in{" "}
            <span className="font-medium">{item.scope_type_label}</span>. Saving
            inserts a new current version (the previous value is retained in
            history).
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-2 py-2">
          {isMultiline ? (
            <Textarea
              value={value}
              onChange={(e) => setValue(e.target.value)}
              rows={isJson ? 8 : 4}
              placeholder={
                isJson
                  ? item.value_type === "array"
                    ? "[]"
                    : "{}"
                  : "Value"
              }
              className={isJson ? "font-mono text-xs" : ""}
            />
          ) : (
            <Input
              value={value}
              onChange={(e) => setValue(e.target.value)}
              type={item.value_type === "number" ? "number" : "text"}
              placeholder={
                item.value_type === "boolean"
                  ? "true or false"
                  : item.value_type === "date"
                    ? "YYYY-MM-DD"
                    : "Value"
              }
            />
          )}
          {item.value_type === "boolean" && (
            <p className="text-xs text-muted-foreground">
              Accepts true / false.
            </p>
          )}
        </div>

        <DialogFooter>
          <Button
            type="button"
            variant="outline"
            onClick={onClose}
            disabled={saving}
          >
            Cancel
          </Button>
          <Button type="button" onClick={save} disabled={saving}>
            {saving && <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />}
            Save value
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
