"use client";

// features/admin/relationships/components/ChooserBucketsManager.tsx
//
// Direct CRUD for the two bucket vocabularies behind the reference
// "Allowed types" chooser: platform.reference_categories (admin-defined
// buckets) and platform.schemas (pretty names for the schema fallback).
// Writes via admin_upsert_reference_category / admin_upsert_schema; reads
// via the anon list RPCs, so edits show live without a page reload.
// Chooser UIs read these through the GENERATED registry — after editing,
// run `pnpm gen:entity-types` to update what end users see (the banner in
// EntityTypesClient covers registry drift; labels drift silently, hence the
// inline reminder here).

import { useEffect, useMemo, useState } from "react";
import { Check, Pencil, Plus, X } from "lucide-react";
import { toast } from "@/lib/toast";
import { createClient } from "@/utils/supabase/client";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";

interface BucketRow {
  key: string;
  label: string;
  sort_order: number;
  is_active: boolean;
}

interface BucketPanelProps {
  title: string;
  description: string;
  keyHeader: string;
  rows: BucketRow[];
  /** Undefined = keys are fixed (schemas); provided = new rows allowed. */
  onCreate?: (key: string, label: string) => Promise<void>;
  onSave: (row: BucketRow) => Promise<void>;
}

function BucketPanel({
  title,
  description,
  keyHeader,
  rows,
  onCreate,
  onSave,
}: BucketPanelProps) {
  const [editing, setEditing] = useState<BucketRow | null>(null);
  const [newKey, setNewKey] = useState("");
  const [newLabel, setNewLabel] = useState("");
  const [busy, setBusy] = useState(false);

  async function run(fn: () => Promise<void>) {
    setBusy(true);
    try {
      await fn();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="min-w-0 flex-1 rounded-md border border-border">
      <div className="border-b border-border px-3 py-2">
        <span className="text-sm font-semibold">{title}</span>
        <p className="text-xs text-muted-foreground">{description}</p>
      </div>
      <table className="w-full text-xs">
        <thead>
          <tr className="border-b border-border text-left text-[10px] uppercase tracking-wide text-muted-foreground">
            <th className="px-3 py-1.5 font-medium">{keyHeader}</th>
            <th className="px-2 py-1.5 font-medium">Display name</th>
            <th className="w-16 px-2 py-1.5 font-medium">Sort</th>
            <th className="w-14 px-2 py-1.5 font-medium">Active</th>
            <th className="w-16 px-2 py-1.5" />
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => {
            const isEditing = editing?.key === row.key;
            const r = isEditing ? editing : row;
            return (
              <tr key={row.key} className="border-b border-border/60">
                <td className="px-3 py-1 font-mono">{row.key}</td>
                <td className="px-2 py-1">
                  {isEditing ? (
                    <Input
                      value={r.label}
                      onChange={(e) =>
                        setEditing({ ...r, label: e.target.value })
                      }
                      className="h-6 px-1.5 text-xs"
                      style={{ fontSize: "16px" }}
                    />
                  ) : (
                    <span>
                      {row.label}
                      {!row.is_active && (
                        <Badge
                          variant="outline"
                          className="ml-1.5 px-1 py-0 text-[9px] text-muted-foreground"
                        >
                          inactive
                        </Badge>
                      )}
                    </span>
                  )}
                </td>
                <td className="px-2 py-1">
                  {isEditing ? (
                    <Input
                      type="number"
                      value={String(r.sort_order)}
                      onChange={(e) =>
                        setEditing({
                          ...r,
                          sort_order: Number(e.target.value) || 0,
                        })
                      }
                      className="h-6 w-14 px-1.5 text-xs"
                      style={{ fontSize: "16px" }}
                    />
                  ) : (
                    <span className="tabular-nums text-muted-foreground">
                      {row.sort_order}
                    </span>
                  )}
                </td>
                <td className="px-2 py-1">
                  <Switch
                    checked={r.is_active}
                    disabled={!isEditing || busy}
                    onCheckedChange={(v) =>
                      isEditing && setEditing({ ...r, is_active: v })
                    }
                  />
                </td>
                <td className="px-2 py-1 text-right">
                  {isEditing ? (
                    <span className="inline-flex gap-0.5">
                      <Button
                        size="icon"
                        variant="ghost"
                        className="h-6 w-6"
                        title="Save"
                        disabled={busy || !r.label.trim()}
                        onClick={() =>
                          run(async () => {
                            await onSave(r);
                            setEditing(null);
                          })
                        }
                      >
                        <Check className="h-3 w-3" />
                      </Button>
                      <Button
                        size="icon"
                        variant="ghost"
                        className="h-6 w-6"
                        title="Cancel"
                        disabled={busy}
                        onClick={() => setEditing(null)}
                      >
                        <X className="h-3 w-3" />
                      </Button>
                    </span>
                  ) : (
                    <Button
                      size="icon"
                      variant="ghost"
                      className="h-6 w-6"
                      title="Edit"
                      onClick={() => setEditing({ ...row })}
                    >
                      <Pencil className="h-3 w-3" />
                    </Button>
                  )}
                </td>
              </tr>
            );
          })}
          {onCreate && (
            <tr>
              <td className="px-3 py-1.5">
                <Input
                  value={newKey}
                  onChange={(e) =>
                    setNewKey(
                      e.target.value.toLowerCase().replace(/\s+/g, "-"),
                    )
                  }
                  placeholder="slug"
                  className="h-6 px-1.5 font-mono text-xs"
                  style={{ fontSize: "16px" }}
                />
              </td>
              <td className="px-2 py-1.5" colSpan={3}>
                <Input
                  value={newLabel}
                  onChange={(e) => setNewLabel(e.target.value)}
                  placeholder="Display name"
                  className="h-6 px-1.5 text-xs"
                  style={{ fontSize: "16px" }}
                />
              </td>
              <td className="px-2 py-1.5 text-right">
                <Button
                  size="icon"
                  variant="ghost"
                  className="h-6 w-6"
                  title="Add"
                  disabled={busy || !newKey.trim() || !newLabel.trim()}
                  onClick={() =>
                    run(async () => {
                      await onCreate(newKey.trim(), newLabel.trim());
                      setNewKey("");
                      setNewLabel("");
                    })
                  }
                >
                  <Plus className="h-3.5 w-3.5" />
                </Button>
              </td>
            </tr>
          )}
        </tbody>
      </table>
    </div>
  );
}

/**
 * The "Chooser buckets" strip on /administration/database/relationships/entity-types:
 * reference categories are fully creatable/editable; schema display names are
 * editable (keys fixed — a schema exists or it doesn't).
 */
export function ChooserBucketsManager() {
  const supabase = useMemo(() => createClient(), []);
  const [categories, setCategories] = useState<BucketRow[]>([]);
  const [schemas, setSchemas] = useState<BucketRow[]>([]);

  async function reload() {
    const [cat, sch] = await Promise.all([
      supabase.rpc("reference_categories_list"),
      supabase.rpc("entity_schemas_list"),
    ]);
    if (cat.error) toast.error(`Categories failed: ${cat.error.message}`);
    else
      setCategories(
        (cat.data ?? []).map((c) => ({
          key: c.slug,
          label: c.label,
          sort_order: c.sort_order,
          is_active: c.is_active,
        })),
      );
    if (sch.error) toast.error(`Schemas failed: ${sch.error.message}`);
    else
      setSchemas(
        (sch.data ?? []).map((s) => ({
          key: s.schema_name,
          label: s.display_name,
          sort_order: s.sort_order,
          is_active: s.is_active,
        })),
      );
  }

  useEffect(() => {
    void reload();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function saveCategory(row: BucketRow) {
    const { error } = await supabase.rpc("admin_upsert_reference_category", {
      p_slug: row.key,
      p_label: row.label.trim(),
      p_sort_order: row.sort_order,
      p_is_active: row.is_active,
    });
    if (error) throw error;
    toast.success(`Category "${row.key}" saved — run pnpm gen:entity-types`);
    await reload();
  }

  async function saveSchema(row: BucketRow) {
    const { error } = await supabase.rpc("admin_upsert_schema", {
      p_schema_name: row.key,
      p_display_name: row.label.trim(),
      p_sort_order: row.sort_order,
      p_is_active: row.is_active,
    });
    if (error) throw error;
    toast.success(`Schema "${row.key}" saved — run pnpm gen:entity-types`);
    await reload();
  }

  return (
    <div className="flex flex-col gap-2 px-4 pb-6">
      <div>
        <h2 className="text-sm font-semibold">Chooser buckets</h2>
        <p className="text-xs text-muted-foreground">
          The tier-1 buckets in the reference &ldquo;Allowed types&rdquo;
          chooser. A type with a category uses it; otherwise its schema&apos;s
          display name. Chooser UIs read the generated registry — run{" "}
          <span className="font-mono">pnpm gen:entity-types</span> after
          editing so users see the change.
        </p>
      </div>
      <div className="flex flex-col gap-3 lg:flex-row">
        <BucketPanel
          title="Reference categories"
          description="Admin-defined buckets (platform.reference_categories). Assign one to a type in its editor."
          keyHeader="Slug"
          rows={categories}
          onCreate={(key, label) =>
            saveCategory({ key, label, sort_order: 100, is_active: true })
          }
          onSave={saveCategory}
        />
        <BucketPanel
          title="Schema display names"
          description="Fallback bucket names (platform.schemas). Keys are the live DB schemas."
          keyHeader="Schema"
          rows={schemas}
          onSave={saveSchema}
        />
      </div>
    </div>
  );
}
