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
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import {
  PencilTapButton,
  TrashTapButton,
} from "@ai-matrx/tap-target/buttons";
import { Lock, SlidersHorizontal } from "lucide-react";
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

function TruncatedText({
  value,
  className,
}: {
  value: string;
  className: string;
}) {
  return (
    <TooltipProvider delayDuration={200}>
      <Tooltip>
        <TooltipTrigger asChild>
          <span className={className}>{value}</span>
        </TooltipTrigger>
        <TooltipContent>{value}</TooltipContent>
      </Tooltip>
    </TooltipProvider>
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
      <PencilTapButton
        variant="transparent"
        ariaLabel={`Edit ${item.key}`}
        tooltip="Edit setting"
        onClick={() => onEdit(item)}
      />
      <TrashTapButton
        variant="solid"
        bgColor="bg-destructive/10"
        iconColor="text-destructive"
        hoverBgColor="hover:bg-destructive/20"
        activeBgColor="active:bg-destructive/25"
        ariaLabel={
          isSystem
            ? "System settings cannot be deleted"
            : `Delete ${item.key}`
        }
        tooltip={
          isSystem ? "System settings cannot be deleted" : "Delete setting"
        }
        disabled={isSystem}
        onClick={() => setPendingDelete(true)}
      />
      <AlertDialog open={pendingDelete} onOpenChange={setPendingDelete}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete &quot;{item.key}&quot;?</AlertDialogTitle>
            <AlertDialogDescription>
              This will remove the setting &quot;{item.key}&quot; from the
              active settings vocabulary.
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
      sortable: true,
      width: "17rem",
      cell: (item) => (
        <TruncatedText
          value={item.key}
          className="block w-full truncate font-mono text-xs font-medium sm:!whitespace-nowrap sm:!break-normal sm:![overflow-wrap:normal]"
        />
      ),
    },
    {
      accessorKey: "value_type",
      header: "Value Type",
      sortable: true,
      width: "9rem",
      cell: (item) => (
        <Badge variant="outline" className="font-mono text-xs">
          {item.value_type}
        </Badge>
      ),
    },
    {
      id: "range",
      header: "Min – Max",
      width: "8rem",
      cell: (item) => (
        <CompactRange min={item.canonical_min} max={item.canonical_max} />
      ),
    },
    {
      accessorKey: "is_system",
      header: "Origin",
      sortable: true,
      width: "7rem",
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
      cell: (item) => (
        <TruncatedText
          value={item.description || "—"}
          className="block w-full truncate text-xs text-muted-foreground sm:!whitespace-nowrap sm:!break-normal sm:![overflow-wrap:normal]"
        />
      ),
    },
  ];
  return (
    <div className="flex h-full min-h-0 flex-col px-3 pt-2">
      {error && settings.length > 0 ? (
        <div
          role="alert"
          className="flex items-center gap-2 border-b border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700 dark:border-red-800 dark:bg-red-900/20 dark:text-red-300"
        >
          <span className="min-w-0 flex-1">{error}</span>
          <Button type="button" variant="outline" size="sm" onClick={onRetry}>
            Retry refresh
          </Button>
        </div>
      ) : null}
      <MatrxDataTable<AiSetting>
        data={settings}
        isLoading={isLoading && settings.length === 0}
        isFetching={isLoading && settings.length > 0}
        columns={columns}
        getRowId={(item) => item.id}
        pageSize={25}
        pageSizeOptions={[10, 25, 50, 100]}
        defaultSort={null}
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
                    Retry
                  </Button>
                ),
              }
            : {
                title: "No settings found",
                icon: <SlidersHorizontal className="h-8 w-8" />,
              }
        }
        tableId="ai/settings"
        toolbar={{
          title: "Settings Vocabulary",
          searchPlaceholder: "Search settings…",
          refresh: { onRefresh: onRetry },
          add: { onAdd: onCreate },
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
