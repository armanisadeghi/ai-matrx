"use client";

import { useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  MatrxDataTable,
  type MatrxColumnDef,
} from "@ai-matrx/design-system/data-table";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  Lock,
  Pencil,
  Plus,
  RefreshCw,
  SlidersHorizontal,
  Trash2,
} from "lucide-react";
import type { AiSetting } from "../../types";

function CompactRange({
  min,
  max,
}: {
  min: number | null;
  max: number | null;
}) {
  if (min === null && max === null)
    return <span className="text-xs text-muted-foreground">—</span>;
  return (
    <span className="font-mono text-xs tabular-nums">
      {min ?? "—"}
      <span className="mx-0.5 text-muted-foreground">–</span>
      {max ?? "—"}
    </span>
  );
}

function RowActions({
  item,
  onEdit,
  onDelete,
}: {
  item: AiSetting;
  onEdit: (item: AiSetting) => void;
  onDelete: (item: AiSetting) => void;
}) {
  const [pendingDelete, setPendingDelete] = useState(false);
  const isSystem = item.is_system ?? false;
  return (
    <>
      <div className="flex items-center gap-0.5">
        <Button
          variant="ghost"
          size="icon"
          className="h-11 w-11 sm:h-7 sm:w-7"
          title="Edit"
          onClick={(event) => {
            event.stopPropagation();
            onEdit(item);
          }}
        >
          <Pencil className="h-3.5 w-3.5" />
        </Button>
        <Button
          variant="ghost"
          size="icon"
          className="h-11 w-11 text-destructive hover:bg-destructive/10 hover:text-destructive disabled:pointer-events-none disabled:opacity-30 sm:h-7 sm:w-7"
          title={isSystem ? "System settings cannot be deleted" : "Delete"}
          disabled={isSystem}
          onClick={(event) => {
            event.stopPropagation();
            setPendingDelete(true);
          }}
        >
          <Trash2 className="h-3.5 w-3.5" />
        </Button>
      </div>
      <AlertDialog open={pendingDelete} onOpenChange={setPendingDelete}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete &quot;{item.key}&quot;?</AlertDialogTitle>
            <AlertDialogDescription>
              This will remove the setting &quot;{item.key}&quot;
              from the active settings vocabulary.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={() => {
                setPendingDelete(false);
                onDelete(item);
              }}
            >
              Delete Setting
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}

export interface SettingTableProps {
  settings: AiSetting[];
  isLoading: boolean;
  error: string | null;
  selectedId: string | null;
  onSelect: (setting: AiSetting) => void;
  onEdit: (setting: AiSetting) => void;
  onDelete: (setting: AiSetting) => void;
  onCreate: () => void;
  onRetry: () => void;
}

export default function SettingTable({
  settings,
  isLoading,
  error,
  selectedId,
  onSelect,
  onEdit,
  onDelete,
  onCreate,
  onRetry,
}: SettingTableProps) {
  const columns: MatrxColumnDef<AiSetting>[] = [
    {
      accessorKey: "key",
      header: "Key",
      sortable: false,
      filter: false,
      cell: (item) => (
        <span
          className="block max-w-[210px] truncate font-mono text-xs font-medium"
          title={item.key}
        >
          {item.key}
        </span>
      ),
    },
    {
      accessorKey: "value_type",
      header: "Value Type",
      sortable: false,
      filter: false,
      cell: (item) => (
        <Badge variant="outline" className="font-mono text-xs">
          {item.value_type}
        </Badge>
      ),
    },
    {
      id: "range",
      header: "Min – Max",
      sortable: false,
      filter: false,
      cell: (item) => (
        <CompactRange min={item.canonical_min} max={item.canonical_max} />
      ),
    },
    {
      accessorKey: "is_system",
      header: "Origin",
      sortable: false,
      filter: false,
      cell: (item) =>
        item.is_system ? (
          <Badge
            variant="outline"
            className="gap-1 border-blue-200 bg-blue-50 text-xs text-blue-700 dark:border-blue-800 dark:bg-blue-900/20 dark:text-blue-300"
          >
            <Lock className="h-2.5 w-2.5" />
            System
          </Badge>
        ) : (
          <Badge variant="outline" className="text-xs">
            Custom
          </Badge>
        ),
    },
    {
      accessorKey: "description",
      header: "Description",
      sortable: false,
      filter: false,
      cell: (item) => (
        <span
          className="block max-w-[420px] truncate text-xs text-muted-foreground"
          title={item.description ?? ""}
        >
          {item.description || "—"}
        </span>
      ),
    },
  ];
  return (
    <div className="flex h-full min-h-0 flex-col">
      <MatrxDataTable<AiSetting>
        data={settings}
        isLoading={isLoading}
        columns={columns}
        getRowId={(item) => item.id}
        pageSize={25}
        pageSizeOptions={[10, 25, 50, 100]}
        defaultSort={null}
        processLocalRows={(rows, state) => {
          const query = state.search.trim().toLowerCase();
          if (!query) return rows;
          return rows.filter((item) =>
            [item.key, item.value_type, item.description ?? ""].some((value) =>
              value.toLowerCase().includes(query),
            ),
          );
        }}
        onRowOpen={onSelect}
        detail={{ enabled: false }}
        rowClassName={(item) =>
          item.id === selectedId
            ? "bg-primary/10 hover:bg-primary/15"
            : undefined
        }
        emptyState={
          error
            ? {
                title: "Could not load settings",
                description: error,
                icon: <SlidersHorizontal className="h-8 w-8" />,
                action: (
                  <Button size="sm" variant="outline" onClick={onRetry}>
                    <RefreshCw className="mr-1.5 h-3.5 w-3.5" />
                    Retry
                  </Button>
                ),
              }
            : {
                title: "No settings found",
                icon: <SlidersHorizontal className="h-8 w-8" />,
              }
        }
        toolbar={{
          searchPlaceholder: "Search by key…",
          leading: (
            <div className="flex items-center gap-2">
              <h2 className="text-sm font-semibold">Settings Vocabulary</h2>
              <Badge variant="outline" className="text-xs">
                {settings.length}
              </Badge>
            </div>
          ),
          actions: (
            <Button
              size="sm"
              className="h-8 gap-1.5 px-2 text-xs"
              onClick={onCreate}
            >
              <Plus className="h-3.5 w-3.5" />
              New Setting
            </Button>
          ),
        }}
        rowActions={(item) => (
          <RowActions item={item} onEdit={onEdit} onDelete={onDelete} />
        )}
        mobileCards={(item, _index, controls) => (
          <article
            className={
              item.id === selectedId
                ? "space-y-2 rounded-md border border-primary/40 bg-primary/10 p-3"
                : "space-y-2 rounded-md border border-border p-3"
            }
          >
            <div className="flex items-start justify-between gap-2">
              <div className="min-w-0">
                <button
                  type="button"
                  className="block max-w-full truncate text-left font-mono font-medium hover:underline"
                  onClick={() => onSelect(item)}
                >
                  {item.key}
                </button>
                <p className="text-xs text-muted-foreground">
                  {item.value_type}
                </p>
              </div>
              {item.is_system ? (
                <Badge variant="outline" className="shrink-0 gap-1 text-xs">
                  <Lock className="h-3 w-3" />
                  System
                </Badge>
              ) : (
                <Badge variant="outline" className="shrink-0 text-xs">
                  Custom
                </Badge>
              )}
            </div>
            <div className="flex items-center justify-between gap-2 text-xs text-muted-foreground">
              <CompactRange min={item.canonical_min} max={item.canonical_max} />
              <span className="truncate">{item.description || "—"}</span>
            </div>
            <div className="flex justify-end">{controls.actions}</div>
          </article>
        )}
      />
    </div>
  );
}
