"use client";

// Direct CRUD for the two vocabularies behind the reference "Allowed types"
// chooser. The chooser itself reads the generated registry, so writes retain
// the visible reminder to run `pnpm gen:entity-types`.

import { useEffect, useMemo, useState } from "react";
import { X } from "lucide-react";
import { Input } from "@ai-matrx/design-system";
import { MatrxDataTable } from "@ai-matrx/design-system/data-table";
import type {
  CellEditsMap,
  MatrxColumnDef,
} from "@ai-matrx/design-system/data-table/types";
import { Button } from "@/components/ui/button";
import { toast } from "@/lib/toast";
import { createClient } from "@/utils/supabase/client";

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
  loading: boolean;
  /** Undefined means keys are fixed (schemas); provided permits new rows. */
  onCreate?: (key: string, label: string) => Promise<void>;
  onSave: (row: BucketRow) => Promise<void>;
}

function BucketPanel({
  title,
  description,
  keyHeader,
  rows,
  loading,
  onCreate,
  onSave,
}: BucketPanelProps) {
  const [creating, setCreating] = useState(false);
  const [newKey, setNewKey] = useState("");
  const [newLabel, setNewLabel] = useState("");
  const [createBusy, setCreateBusy] = useState(false);

  const columns = useMemo(
    (): MatrxColumnDef<BucketRow>[] => [
      {
        id: "key",
        accessorKey: "key",
        header: keyHeader,
        cell: (row) => <span className="font-mono text-xs">{row.key}</span>,
        width: 150,
      },
      {
        id: "label",
        accessorKey: "label",
        header: "Display name",
        editable: "string",
        cell: (row) => <span className="text-sm">{row.label}</span>,
        width: 190,
      },
      {
        id: "sort_order",
        accessorKey: "sort_order",
        header: "Sort",
        filter: "number",
        editable: "number",
        cell: (row) => (
          <span className="tabular-nums text-muted-foreground">
            {row.sort_order}
          </span>
        ),
        align: "right",
        width: 72,
      },
      {
        id: "is_active",
        accessorKey: "is_active",
        header: "Active",
        filter: "boolean",
        editable: "boolean",
        cell: (row) => (
          <span className="text-xs">{row.is_active ? "Yes" : "No"}</span>
        ),
        align: "center",
        width: 76,
      },
    ],
    [keyHeader],
  );

  async function saveEdits(editsMap: CellEditsMap) {
    for (const key of Object.keys(editsMap)) {
      const row = rows.find((candidate) => candidate.key === key);
      if (!row) continue;
      await onSave({ ...row, ...(editsMap[key] ?? {}) } as BucketRow);
    }
  }

  async function createBucket() {
    if (!onCreate || !newKey.trim() || !newLabel.trim()) return;
    setCreateBusy(true);
    try {
      await onCreate(newKey.trim(), newLabel.trim());
      setNewKey("");
      setNewLabel("");
      setCreating(false);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : String(error));
    } finally {
      setCreateBusy(false);
    }
  }

  return (
    <section className="min-w-0 flex-1 rounded-md border border-border p-3">
      <MatrxDataTable
        urlState={{
          id: `chooser-${keyHeader.toLowerCase()}`,
          selectedRow: false,
        }}
        data={rows}
        columns={columns}
        getRowId={(row) => row.key}
        density="condensed"
        viewTabs={false}
        pageSize={25}
        zebra
        isLoading={loading}
        defaultSort={{ id: "sort_order", direction: "asc" }}
        emptyState={{
          title: `No ${title.toLowerCase()} yet`,
          description,
        }}
        toolbar={{
          title,
          search: true,
          searchPlaceholder: `Search ${title.toLowerCase()}…`,
          add: onCreate
            ? {
                onAdd: () => setCreating(true),
                disabled: createBusy,
                disabledReason: createBusy ? "Creating bucket…" : undefined,
              }
            : undefined,
        }}
        edit={{ enabled: true, onSave: saveEdits }}
      />

      {/* Primary owner decision: retain this unique two-field bucket editor while
          the shared table owns rendering, headers, filters, pagination, and edits. */}
      {creating && onCreate ? (
        <form
          className="mt-2 flex flex-wrap items-center gap-2 border-t border-border pt-2"
          onSubmit={(event) => {
            event.preventDefault();
            void createBucket();
          }}
        >
          <Input
            value={newKey}
            onChange={(event) =>
              setNewKey(event.target.value.toLowerCase().replace(/\s+/g, "-"))
            }
            placeholder="Slug"
            aria-label="Bucket slug"
            className="h-8 min-w-32 flex-1 font-mono text-sm"
            disabled={createBusy}
          />
          <Input
            value={newLabel}
            onChange={(event) => setNewLabel(event.target.value)}
            placeholder="Display name"
            aria-label="Bucket display name"
            className="h-8 min-w-40 flex-[2] text-sm"
            disabled={createBusy}
          />
          <Button
            type="submit"
            size="sm"
            disabled={createBusy || !newKey.trim() || !newLabel.trim()}
          >
            Create bucket
          </Button>
          <Button
            type="button"
            size="icon"
            variant="ghost"
            className="h-8 w-8"
            aria-label="Cancel bucket creation"
            disabled={createBusy}
            onClick={() => {
              setCreating(false);
              setNewKey("");
              setNewLabel("");
            }}
          >
            <X className="h-4 w-4" />
          </Button>
        </form>
      ) : null}
    </section>
  );
}

/** Reference categories are creatable; schema keys are fixed by live schemas. */
export function ChooserBucketsManager() {
  const supabase = useMemo(() => createClient(), []);
  const [categories, setCategories] = useState<BucketRow[]>([]);
  const [schemas, setSchemas] = useState<BucketRow[]>([]);
  const [loading, setLoading] = useState(true);

  async function reload() {
    setLoading(true);
    try {
      const [cat, sch] = await Promise.all([
        supabase.rpc("reference_categories_list"),
        supabase.rpc("entity_schemas_list"),
      ]);
      if (cat.error) toast.error(`Categories failed: ${cat.error.message}`);
      else {
        setCategories(
          (cat.data ?? []).map((category) => ({
            key: category.slug,
            label: category.label,
            sort_order: category.sort_order,
            is_active: category.is_active,
          })),
        );
      }
      if (sch.error) toast.error(`Schemas failed: ${sch.error.message}`);
      else {
        setSchemas(
          (sch.data ?? []).map((schema) => ({
            key: schema.schema_name,
            label: schema.display_name,
            sort_order: schema.sort_order,
            is_active: schema.is_active,
          })),
        );
      }
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void Promise.resolve().then(reload);
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
          <span className="font-mono">pnpm gen:entity-types</span> after editing
          so users see the change.
        </p>
      </div>
      <div className="flex flex-col gap-3 lg:flex-row">
        <BucketPanel
          title="Reference categories"
          description="Admin-defined buckets (platform.reference_categories). Assign one to a type in its editor."
          keyHeader="Slug"
          rows={categories}
          loading={loading}
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
          loading={loading}
          onSave={saveSchema}
        />
      </div>
    </div>
  );
}
