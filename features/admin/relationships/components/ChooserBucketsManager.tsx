"use client";

// Direct CRUD for the two vocabularies behind the reference "Allowed types"
// chooser. The chooser itself reads the generated registry, so writes retain
// the visible reminder to run `pnpm gen:entity-types`.

import { useEffect, useMemo, useState } from "react";
import { X } from "lucide-react";
import { Input } from "@ai-matrx/design-system/controls";
import { readAllRows } from "@ai-matrx/data/db";
import { MatrxDataTable } from "@ai-matrx/design-system/data-table";
import type {
  CellEditsMap,
  MatrxColumnDef,
} from "@ai-matrx/design-system/data-table/types";
import { Button } from "@/components/ui/button";
import { toast } from "@/lib/toast";
import { createClient } from "@/utils/supabase/client";
import { readOf, type ReadOutcome } from "@ai-matrx/design-system";

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
  /** The bucket read's outcome (RC-B12 r13). */
  read: ReadOutcome;
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
  read,
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
        cell: (row) => <code className="font-mono text-xs">{row.key}</code>,
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
        read={read}
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
        detail={{ enabled: false }}
        edit={{
          enabled: true,
          validate: ({ columnId, value }) =>
            columnId === "label" && (typeof value !== "string" || !value.trim())
              ? "Display name is required."
              : undefined,
          onSave: saveEdits,
        }}
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
          <Input mono
            value={newKey}
            onChange={(event) =>
              setNewKey(event.target.value.toLowerCase().replace(/\s+/g, "-"))
            }
            placeholder="Slug"
            aria-label="Bucket slug"
            className="min-w-32 flex-1"
            disabled={createBusy}
          />
          <Input
            value={newLabel}
            onChange={(event) => setNewLabel(event.target.value)}
            placeholder="Display name"
            aria-label="Bucket display name"
            className="min-w-40 flex-[2]"
            disabled={createBusy}
          />
          <Button
            variant="primary"
            type="submit"
            disabled={createBusy || !newKey.trim() || !newLabel.trim()}
          >
            Create bucket
          </Button>
          <Button
            icon={<X />}
            type="button"
            variant="quiet"
            aria-label="Cancel bucket creation"
            disabled={createBusy}
            onClick={() => {
              setCreating(false);
              setNewKey("");
              setNewLabel("");
            }}
          />
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
  // Each bucket's read fails on its own; a failed read is never an empty bucket (RC-B12 r13).
  const [categoriesError, setCategoriesError] = useState<unknown>(null);
  const [schemasError, setSchemasError] = useState<unknown>(null);

  async function reload() {
    setLoading(true);
    try {
      const [categoriesResult, schemasResult] = await Promise.allSettled([
        readAllRows(
          ({ from, to }) =>
            supabase
              .rpc("reference_categories_list", undefined, { count: "exact" })
              .order("slug", { ascending: true })
              .range(from, to),
          { label: "reference_categories_list()" },
        ),
        readAllRows(
          ({ from, to }) =>
            supabase
              .rpc("entity_schemas_list", undefined, { count: "exact" })
              .order("schema_name", { ascending: true })
              .range(from, to),
          { label: "entity_schemas_list()" },
        ),
      ]);
      setCategoriesError(categoriesResult.status === "rejected" ? (categoriesResult.reason ?? true) : null);
      setSchemasError(schemasResult.status === "rejected" ? (schemasResult.reason ?? true) : null);
      if (categoriesResult.status === "fulfilled") {
        setCategories(
          categoriesResult.value.map((category) => ({
            key: category.slug,
            label: category.label,
            sort_order: category.sort_order,
            is_active: category.is_active,
          })),
        );
      }
      if (schemasResult.status === "fulfilled") {
        setSchemas(
          schemasResult.value.map((schema) => ({
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
        {/* Tier-1 buckets of the reference "Allowed types" chooser: a type's
            category if set, else its schema display name. Chooser UIs read the
            generated registry: run pnpm gen:entity-types after editing buckets. */}
        <h2 className="text-sm font-semibold">Chooser buckets</h2>
      </div>
      <div className="flex flex-col gap-3 lg:flex-row">
        {/* Rows live in platform.reference_categories. */}
        <BucketPanel
          title="Reference categories"
          description="Admin-defined; assign one in a type's editor"
          keyHeader="Slug"
          rows={categories}
          loading={loading}
          read={readOf({ loading, error: categoriesError }, { what: "reference categories", onRetry: () => void reload() })}
          onCreate={(key, label) =>
            saveCategory({ key, label, sort_order: 100, is_active: true })
          }
          onSave={saveCategory}
        />
        {/* Rows live in platform.schemas; keys are live DB schemas. */}
        <BucketPanel
          title="Schema display names"
          description="Fallback when a type has no category"
          keyHeader="Schema"
          rows={schemas}
          loading={loading}
          read={readOf({ loading, error: schemasError }, { what: "schema display names", onRetry: () => void reload() })}
          onSave={saveSchema}
        />
      </div>
    </div>
  );
}
