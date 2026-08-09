"use client";

import React, { useMemo, useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import GenericTablePagination from "@/components/generic-table/GenericTablePagination";
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
import { Pencil, Trash2, Lock, Plus, Search, SlidersHorizontal } from "lucide-react";
import type { AiSetting } from "../../types";
import { cn } from "@/lib/utils";
import {
  MOBILE_TABLE_FROZEN,
} from "@/components/official/mobile-table/mobileTable";

function CompactRange({
  min,
  max,
}: {
  min: number | null;
  max: number | null;
}) {
  if (min === null && max === null) {
    return <span className="text-muted-foreground text-xs">—</span>;
  }
  return (
    <span className="text-xs font-mono tabular-nums">
      {min ?? "—"}
      <span className="text-muted-foreground mx-0.5">–</span>
      {max ?? "—"}
    </span>
  );
}

interface RowActionsProps {
  item: AiSetting;
  onEdit: (item: AiSetting) => void;
  onDelete: (item: AiSetting) => void;
}

function RowActions({ item, onEdit, onDelete }: RowActionsProps) {
  const [pendingDelete, setPendingDelete] = useState(false);
  const isSystem = item.is_system ?? false;

  return (
    <>
      <div className="flex items-center gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity">
        <Button
          variant="ghost"
          size="icon"
          className="h-6 w-6"
          title="Edit"
          onClick={(e) => {
            e.stopPropagation();
            onEdit(item);
          }}
        >
          <Pencil className="h-3.5 w-3.5" />
        </Button>
        <Button
          variant="ghost"
          size="icon"
          className="h-6 w-6 text-destructive hover:text-destructive hover:bg-destructive/10 disabled:opacity-30 disabled:cursor-not-allowed"
          title={isSystem ? "System settings can't be deleted" : "Delete"}
          disabled={isSystem}
          onClick={(e) => {
            e.stopPropagation();
            if (!isSystem) setPendingDelete(true);
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
              This will permanently delete the setting &quot;{item.key}&quot;
              from the canonical settings vocabulary. This cannot be undone.
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
  selectedId: string | null;
  onSelect: (setting: AiSetting) => void;
  onEdit: (setting: AiSetting) => void;
  onDelete: (setting: AiSetting) => void;
  onCreate: () => void;
}

export default function SettingTable({
  settings,
  isLoading,
  selectedId,
  onSelect,
  onEdit,
  onDelete,
  onCreate,
}: SettingTableProps) {
  const [q, setQ] = useState("");
  const [page, setPage] = useState(1);
  const [perPage, setPerPage] = useState(25);

  const filtered = useMemo(() => {
    if (!q.trim()) return settings;
    const lq = q.toLowerCase();
    return settings.filter(
      (s) =>
        s.key.toLowerCase().includes(lq) ||
        (s.value_type ?? "").toLowerCase().includes(lq) ||
        (s.description ?? "").toLowerCase().includes(lq),
    );
  }, [settings, q]);

  const paginated = useMemo(() => {
    const start = (page - 1) * perPage;
    return filtered.slice(start, start + perPage);
  }, [filtered, page, perPage]);

  const handleUpdateQ = (value: string) => {
    setQ(value);
    setPage(1);
  };

  return (
    <div className="flex flex-col h-full min-h-0">
      {/* Header: search + count + create */}
      <div className="shrink-0 flex items-center gap-2 px-3 py-2 border-b bg-card">
        <div className="relative flex-1 max-w-xs">
          <Search className="absolute left-2 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
          <Input
            value={q}
            onChange={(e) => handleUpdateQ(e.target.value)}
            placeholder="Search by key…"
            className="h-8 pl-7 text-sm"
          />
        </div>
        <span className="text-xs text-muted-foreground shrink-0">
          {filtered.length === settings.length
            ? `${settings.length} settings`
            : `${filtered.length} of ${settings.length} settings`}
        </span>
        <div className="flex-1" />
        <Button
          size="sm"
          className="h-8 px-3 text-xs gap-1.5"
          onClick={onCreate}
        >
          <Plus className="h-3.5 w-3.5" />
          New Setting
        </Button>
      </div>

      {/* Scrollable table */}
      <div className="flex-1 overflow-auto min-h-0">
        <table className={cn("caption-bottom text-xs border-collapse", MOBILE_TABLE_FROZEN)}>
          <thead className="sticky top-0 z-10 bg-card border-b border-border">
            <tr className="h-8">
              <th className="w-[220px] min-w-[160px] px-2 py-1.5 text-left align-middle text-xs font-semibold text-muted-foreground">
                Key
              </th>
              <th className="w-[120px] min-w-[100px] px-2 py-1.5 text-left align-middle text-xs font-semibold text-muted-foreground">
                Value Type
              </th>
              <th className="w-[110px] min-w-[100px] px-2 py-1.5 text-left align-middle text-xs font-semibold text-muted-foreground">
                Min – Max
              </th>
              <th className="w-[90px] min-w-[80px] px-2 py-1.5 text-left align-middle text-xs font-semibold text-muted-foreground">
                Origin
              </th>
              <th className="px-2 py-1.5 text-left align-middle text-xs font-semibold text-muted-foreground">
                Description
              </th>
              <th className="w-[80px] min-w-[80px] px-2 py-1.5 text-right align-middle text-xs font-semibold text-muted-foreground">
                Actions
              </th>
            </tr>
          </thead>
          <tbody className="[&_tr:last-child]:border-0">
            {isLoading ? (
              Array.from({ length: 8 }).map((_, i) => (
                <tr key={i} className="h-9 border-b border-border">
                  {Array.from({ length: 6 }).map((__, j) => (
                    <td key={j} className="px-2 py-1.5">
                      <Skeleton className="h-4 w-full" />
                    </td>
                  ))}
                </tr>
              ))
            ) : paginated.length === 0 ? (
              <tr>
                <td colSpan={6} className="h-32 text-center p-2">
                  <div className="flex flex-col items-center gap-2 text-muted-foreground">
                    <SlidersHorizontal className="h-10 w-10 opacity-30" />
                    <p className="text-sm">No settings found</p>
                    {q && (
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => handleUpdateQ("")}
                      >
                        Clear search
                      </Button>
                    )}
                  </div>
                </td>
              </tr>
            ) : (
              paginated.map((item, idx) => (
                <tr
                  key={item.id}
                  className={`group h-9 border-b border-border cursor-pointer transition-colors ${
                    selectedId === item.id
                      ? "bg-primary/10 hover:bg-primary/15"
                      : idx % 2 === 0
                        ? "hover:bg-muted/50"
                        : "bg-muted/20 hover:bg-muted/50"
                  }`}
                  onClick={() => onSelect(item)}
                >
                  <td className="py-1 px-2 align-middle">
                    <span className="text-xs font-mono font-medium truncate block max-w-[210px]">
                      {item.key}
                    </span>
                  </td>
                  <td className="py-1 px-2 align-middle">
                    <Badge variant="outline" className="text-xs font-mono">
                      {item.value_type}
                    </Badge>
                  </td>
                  <td className="py-1 px-2 align-middle">
                    <CompactRange
                      min={item.canonical_min}
                      max={item.canonical_max}
                    />
                  </td>
                  <td className="py-1 px-2 align-middle">
                    {item.is_system ? (
                      <Badge
                        variant="outline"
                        className="text-xs gap-1 bg-blue-50 dark:bg-blue-900/20 text-blue-700 dark:text-blue-300 border-blue-200 dark:border-blue-800"
                      >
                        <Lock className="h-2.5 w-2.5" />
                        System
                      </Badge>
                    ) : (
                      <Badge variant="outline" className="text-xs">
                        Custom
                      </Badge>
                    )}
                  </td>
                  <td className="py-1 px-2 align-middle">
                    <span
                      className="text-xs text-muted-foreground truncate block max-w-[420px]"
                      title={item.description ?? ""}
                    >
                      {item.description || "—"}
                    </span>
                  </td>
                  <td className="py-1 px-2 align-middle text-right">
                    <RowActions item={item} onEdit={onEdit} onDelete={onDelete} />
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {/* Pinned pagination footer */}
      <div className="flex-shrink-0 border-t bg-card p-0">
        <GenericTablePagination
          totalItems={filtered.length}
          itemsPerPage={perPage}
          currentPage={page}
          onPageChange={setPage}
          onItemsPerPageChange={(n) => {
            setPerPage(n);
            setPage(1);
          }}
          compact
          layoutType="flex"
          containerClassName="border-t-0 pt-0"
        />
      </div>
    </div>
  );
}
