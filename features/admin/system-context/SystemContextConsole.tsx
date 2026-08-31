"use client";

// Super-admin control plane for platform-wide System Context. Items live in
// `context.system_context_item` and belong to one of three fixed classes:
// ambient, curated, or dataset. A row is a definition + feed + current value.

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  Boxes,
  Clock,
  Database,
  Eye,
  Globe,
  Loader2,
  Lock,
  Pencil,
  Plus,
  RefreshCw,
  Trash2,
} from "lucide-react";
import { toast } from "@/lib/toast";

import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { confirm } from "@/components/dialogs/confirm/ConfirmDialogHost";
import { NonEditableContextMenu } from "@/features/context-menu-v3/NonEditableContextMenu";
import { CONTEXT_MENU_ENTITY_KEY } from "@/features/context-menu-v3/types";
import { MatrxDataTable } from "@/components/official/matrx-data-table/MatrxDataTable";
import type { MatrxColumnDef } from "@/components/official/matrx-data-table/types";
import { EntityRef } from "@/components/official/entity-ref/EntityRef";
import type {
  SystemContextItem,
  SystemContextPayload,
  SystemItemClass,
} from "@/app/api/admin/system-context/route";
import {
  feedTypeMeta,
  feedTypeTone,
  feedSourceLink,
  OpenSourceLink,
  asFeedConfig,
} from "./FeedConfigEditor";
import { AddItemDialog, EditItemDialog } from "./ItemDialogs";
import { PreviewDialog } from "./PreviewDialog";
import {
  CLASS_META,
  CLASS_ORDER,
  PAGE_LOCATION,
  SENSITIVITY_STYLES,
  itemSummary,
  valueTypeTone,
} from "./shared";

function feedTarget(
  item: SystemContextItem,
): { token: string; id: string; name: string | null } | null {
  const config = asFeedConfig(item.feed_config);
  const readString = (key: string): string | null => {
    const value = config[key];
    return typeof value === "string" && value.length > 0 ? value : null;
  };
  if (item.feed_type === "dataset") {
    const id = readString("data_store_id");
    return id
      ? { token: "data_store", id, name: readString("data_store_name") }
      : null;
  }
  if (item.feed_type === "agent") {
    const id = readString("agent_id");
    return id ? { token: "agent", id, name: readString("agent_name") } : null;
  }
  return null;
}

function FeedCell({ item }: { item: SystemContextItem }) {
  const meta = feedTypeMeta(item.feed_type);
  const Icon = meta.icon;
  const target = feedTarget(item);
  const sourceLink = target
    ? null
    : feedSourceLink(item.feed_type, asFeedConfig(item.feed_config));
  return (
    <div className="group/entity-ref space-y-0.5">
      <span
        className={`inline-flex items-center gap-1 rounded px-1.5 py-0.5 text-[11px] font-medium ${feedTypeTone(item.feed_type)}`}
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
      {item.feed_error && (
        <div className="max-w-[180px] truncate text-[10px] text-destructive">
          {item.feed_error}
        </div>
      )}
    </div>
  );
}

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

function outputText(item: SystemContextItem): string {
  if (item.is_computed) return "(computed)";
  if (item.feed_type === "dataset") return "(queried live)";
  if (item.current_value === null)
    return item.feed_type === "manual" ? "(not set)" : "(awaiting feed)";
  return item.current_value;
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
  const [classFilter, setClassFilter] = useState<"all" | SystemItemClass>(
    "all",
  );
  const [editing, setEditing] = useState<SystemContextItem | null>(null);
  const [clickedRow, setClickedRow] = useState<SystemContextItem | null>(null);
  const [addItemOpen, setAddItemOpen] = useState(false);
  const [previewOpen, setPreviewOpen] = useState(false);

  const fetchData = useCallback(async () => {
    setFetching(true);
    try {
      const response = await fetch("/api/admin/system-context");
      if (!response.ok) {
        const { error } = await response
          .json()
          .catch(() => ({ error: response.statusText }));
        toast.error(`Failed to load system context: ${error}`);
        return;
      }
      setData((await response.json()) as SystemContextPayload);
    } finally {
      setLoading(false);
      setFetching(false);
    }
  }, []);

  useEffect(() => {
    void fetchData();
  }, [fetchData]);

  const handleDeleteItem = useCallback(
    async (item: SystemContextItem) => {
      const accepted = await confirm({
        title: `Delete "${item.key}"?`,
        description:
          "This removes the system context item and its current value. The item remains recoverable through version history.",
        confirmLabel: "Delete item",
        variant: "destructive",
      });
      if (!accepted) return;
      const response = await fetch(
        `/api/admin/system-context?type=item&id=${item.id}`,
        { method: "DELETE" },
      );
      if (!response.ok) {
        const { error } = await response
          .json()
          .catch(() => ({ error: response.statusText }));
        toast.error(`Delete failed: ${error}`);
        return;
      }
      toast.success(`Deleted ${item.key}.`);
      await fetchData();
    },
    [fetchData],
  );

  const items = useMemo(() => data?.items ?? [], [data]);
  const classCounts = useMemo(
    () =>
      Object.fromEntries(
        CLASS_ORDER.map((itemClass) => [
          itemClass,
          items.filter((item) => item.item_class === itemClass).length,
        ]),
      ) as Record<SystemItemClass, number>,
    [items],
  );
  const rows = useMemo(
    () =>
      classFilter === "all"
        ? items
        : items.filter((item) => item.item_class === classFilter),
    [classFilter, items],
  );
  const stored = items.filter((item) => item.value !== null).length;

  const columns = useMemo(
    (): MatrxColumnDef<SystemContextItem>[] => [
      {
        id: "key",
        accessorKey: "key",
        header: "Key",
        width: 210,
        cell: (row) => (
          <code className="font-mono text-xs text-foreground">{row.key}</code>
        ),
      },
      {
        id: "name",
        accessorKey: "display_name",
        header: "Name",
        width: 240,
        cell: (row) => (
          <div>
            <div className="font-medium text-foreground">
              {row.display_name}
            </div>
            {row.description && (
              <div className="mt-0.5 max-w-xs truncate text-xs text-muted-foreground">
                {row.description}
              </div>
            )}
          </div>
        ),
      },
      {
        id: "class",
        accessorFn: (row) => CLASS_META[row.item_class].label,
        header: "Class",
        filter: "select",
        width: 120,
        cell: (row) => {
          const meta = CLASS_META[row.item_class];
          const Icon = meta.icon;
          return (
            <button
              type="button"
              onClick={(event) => {
                event.stopPropagation();
                setClassFilter(row.item_class);
              }}
              className={`inline-flex items-center gap-1 rounded px-1.5 py-0.5 text-[11px] font-medium ${meta.tone}`}
              title={`Show only ${meta.plural.toLowerCase()} items`}
            >
              <Icon className="h-3 w-3" /> {meta.label}
            </button>
          );
        },
      },
      {
        id: "feed",
        header: "Feed",
        accessorFn: (row) => feedTypeMeta(row.feed_type).label,
        filter: "select",
        width: 170,
        cell: (row) => <FeedCell item={row} />,
      },
      {
        id: "value_type",
        accessorKey: "value_type",
        header: "Type",
        filter: "select",
        width: 110,
        cell: (row) => (
          <span
            className={`inline-flex rounded px-1.5 py-0.5 text-[11px] font-medium ${valueTypeTone(row.value_type)}`}
          >
            {row.value_type}
          </span>
        ),
      },
      {
        id: "output",
        header: "Output",
        accessorFn: outputText,
        width: 230,
        cell: (row) => <OutputCell item={row} />,
      },
      {
        id: "sensitivity",
        accessorKey: "sensitivity",
        header: "Sensitivity",
        filter: "select",
        width: 120,
        cell: (row) => (
          <span
            className={`inline-flex rounded-full px-2 py-0.5 text-[11px] font-medium ${SENSITIVITY_STYLES[row.sensitivity] ?? "bg-muted text-muted-foreground"}`}
          >
            {row.sensitivity}
          </span>
        ),
      },
      {
        id: "id",
        accessorKey: "id",
        header: "ID",
        cellKind: "uuid",
        width: 110,
      },
    ],
    [],
  );

  return (
    <div className="flex h-[calc(100dvh-2.5rem)] flex-col overflow-hidden bg-textured">
      <div className="flex min-h-0 flex-1 flex-col gap-4 p-6">
        <header className="flex flex-wrap items-start justify-between gap-4 pr-14">
          <div className="min-w-0">
            <h1 className="flex items-center gap-2 text-2xl font-semibold text-foreground">
              <Globe className="h-6 w-6 text-sky-500" /> System Context
            </h1>
            <p className="mt-1 max-w-3xl text-sm text-muted-foreground">
              Platform-wide truths available to every agent: ambient runtime
              facts, curated values, and queryable industry datasets.
            </p>
          </div>
          <div className="flex shrink-0 items-center gap-2">
            <Button
              type="button"
              size="sm"
              variant="outline"
              onClick={() => setPreviewOpen(true)}
            >
              <Eye className="mr-1.5 h-4 w-4" /> Preview agent context
            </Button>
            <Button
              type="button"
              size="sm"
              onClick={() => setAddItemOpen(true)}
            >
              <Plus className="mr-1.5 h-4 w-4" /> Add item
            </Button>
          </div>
        </header>

        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          <StatCard
            icon={<Database className="h-4 w-4" />}
            label="Total items"
            value={items.length}
            tone="text-foreground"
          />
          <StatCard
            icon={<Clock className="h-4 w-4" />}
            label="Ambient"
            value={classCounts.ambient}
            tone="text-amber-600 dark:text-amber-400"
          />
          <StatCard
            icon={<Globe className="h-4 w-4" />}
            label="Curated"
            value={classCounts.curated}
            tone="text-sky-600 dark:text-sky-400"
          />
          <StatCard
            icon={<Boxes className="h-4 w-4" />}
            label="Stored values"
            value={stored}
            tone="text-emerald-600 dark:text-emerald-400"
          />
        </div>

        <NonEditableContextMenu
          sourceFeature="admin"
          contentSource={{ type: "raw" }}
          contextData={{ content: "" }}
          resolveContextOnOpen={(target) => {
            const rowId = target
              ?.closest("[data-row-id]")
              ?.getAttribute("data-row-id");
            const row = rowId ? (rows.find((r) => r.id === rowId) ?? null) : null;
            setClickedRow(row);
            if (!row) return null;
            return {
              [CONTEXT_MENU_ENTITY_KEY]: {
                type: "system_context_item",
                id: row.id,
                title: row.key,
              },
              content: itemSummary(row),
            };
          }}
          extraSections={[
            {
              id: "system-context-item-actions",
              label: "System context item",
              items: [
                {
                  kind: "item",
                  id: "sc-edit",
                  label: "Edit item",
                  disabled: !clickedRow || clickedRow.is_computed,
                  description:
                    clickedRow?.is_computed ? "Computed at runtime" : undefined,
                  onSelect: () => {
                    if (clickedRow) setEditing(clickedRow);
                  },
                },
                {
                  kind: "item",
                  id: "sc-delete",
                  label: "Delete item",
                  destructive: true,
                  disabled: !clickedRow || clickedRow.is_computed,
                  onSelect: () => {
                    if (clickedRow) void handleDeleteItem(clickedRow);
                  },
                },
              ],
            },
          ]}
        >
        <div className="min-h-0 flex-1">
          <MatrxDataTable
            urlState={{ id: "system-context" }}
            data={rows}
            columns={columns}
            getRowId={(row) => row.id}
            isLoading={loading}
            isFetching={fetching}
            pageSize={50}
            emptyState={
              items.length === 0
                ? {
                    title: "No system context items",
                    description: "Add a curated value or dataset to begin.",
                  }
                : { title: "No items match your filters" }
            }
            toolbar={{
              search: true,
              searchPlaceholder: "Search key, name, or description…",
              facets: [
                {
                  type: "button-group",
                  id: "class",
                  label: "Class",
                  value: classFilter,
                  defaultValue: "all",
                  options: [
                    { value: "all", label: `All · ${items.length}` },
                    ...CLASS_ORDER.map((itemClass) => ({
                      value: itemClass,
                      label: `${CLASS_META[itemClass].label} · ${classCounts[itemClass]}`,
                    })),
                  ],
                  onChange: (value) =>
                    setClassFilter(value as "all" | SystemItemClass),
                },
              ],
              actions: (
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
              rowAttributes: (row) => ({ id: row.id, key: row.key }),
            }}
            rowActions={(row) =>
              row.is_computed ? (
                <span
                  className="inline-flex items-center gap-1 rounded px-1.5 py-0.5 text-[11px] text-muted-foreground"
                  title="Computed at runtime"
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
                    onClick={(event) => {
                      event.stopPropagation();
                      setEditing(row);
                    }}
                  >
                    <Pencil className="mr-1 h-3 w-3" /> Edit
                  </Button>
                  <Button
                    type="button"
                    size="icon"
                    variant="ghost"
                    className="h-7 w-7 text-muted-foreground hover:text-destructive"
                    title={`Delete ${row.key}`}
                    onClick={(event) => {
                      event.stopPropagation();
                      void handleDeleteItem(row);
                    }}
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </Button>
                </div>
              )
            }
            detail={{
              title: (row) => (
                <code className="font-mono text-sm">{row.key}</code>
              ),
              description: (row) => row.display_name,
              headerActions: (row) =>
                row.is_computed ? undefined : (
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    className="h-7 px-2"
                    onClick={() => setEditing(row)}
                  >
                    <Pencil className="mr-1 h-3 w-3" /> Edit
                  </Button>
                ),
            }}
            window={{ title: (row) => row.key }}
          />
        </div>
        </NonEditableContextMenu>
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
      {addItemOpen && (
        <AddItemDialog
          presetClass={classFilter === "all" ? null : classFilter}
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
