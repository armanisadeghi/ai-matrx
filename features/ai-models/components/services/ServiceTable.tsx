"use client";

import React, { useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
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
import { Pencil, Trash2, Plus, Plug, Lock } from "lucide-react";
import type { AiService } from "../../types";

// ─── Row actions ────────────────────────────────────────────────────────────

interface RowActionsProps {
  item: AiService;
  onEdit: (item: AiService) => void;
  onDelete: (item: AiService) => void;
}

function RowActions({ item, onEdit, onDelete }: RowActionsProps) {
  const [pendingDelete, setPendingDelete] = useState(false);

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
          className="h-6 w-6 text-destructive hover:text-destructive hover:bg-destructive/10 disabled:opacity-30 disabled:pointer-events-none disabled:hover:bg-transparent"
          title={item.is_system ? "System services cannot be deleted" : "Delete"}
          disabled={item.is_system}
          onClick={(e) => {
            e.stopPropagation();
            setPendingDelete(true);
          }}
        >
          <Trash2 className="h-3.5 w-3.5" />
        </Button>
      </div>

      <AlertDialog open={pendingDelete} onOpenChange={setPendingDelete}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              Delete &quot;{item.display_name}&quot;?
            </AlertDialogTitle>
            <AlertDialogDescription>
              This will remove the service &quot;{item.display_name}&quot; (
              {item.internal_name}). Any offerings routed through this service
              will lose their reference. This cannot be undone.
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
              Delete Service
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}

// ─── Main component ─────────────────────────────────────────────────────────

export interface ServiceTableProps {
  services: AiService[];
  isLoading: boolean;
  selectedId: string | null;
  onSelect: (service: AiService) => void;
  onEdit: (service: AiService) => void;
  onDelete: (service: AiService) => void;
  onCreate: () => void;
}

export default function ServiceTable({
  services,
  isLoading,
  selectedId,
  onSelect,
  onEdit,
  onDelete,
  onCreate,
}: ServiceTableProps) {
  return (
    <div className="flex flex-col h-full min-h-0">
      {/* Header row */}
      <div className="flex items-center justify-between shrink-0 px-3 py-2 border-b bg-card">
        <div className="flex items-center gap-2">
          <h2 className="text-sm font-semibold">AI Services</h2>
          <Badge variant="outline" className="text-xs">
            {services.length}
          </Badge>
        </div>
        <Button size="sm" className="h-7 px-2 text-xs gap-1.5" onClick={onCreate}>
          <Plus className="h-3.5 w-3.5" />
          New Service
        </Button>
      </div>

      {/* Table */}
      <div className="flex-1 overflow-auto min-h-0">
        <table className="w-full caption-bottom text-xs border-collapse">
          <thead className="sticky top-0 z-10 bg-card border-b border-border">
            <tr className="h-8">
              <th className="w-[200px] min-w-[160px] px-2 py-1.5 text-left text-xs font-semibold text-muted-foreground">
                Display Name
              </th>
              <th className="w-[180px] min-w-[140px] px-2 py-1.5 text-left text-xs font-semibold text-muted-foreground">
                Internal Name
              </th>
              <th className="w-[140px] min-w-[110px] px-2 py-1.5 text-left text-xs font-semibold text-muted-foreground">
                Wire Format
              </th>
              <th className="w-[80px] min-w-[70px] px-2 py-1.5 text-right text-xs font-semibold text-muted-foreground">
                Priority
              </th>
              <th className="w-[80px] min-w-[70px] px-2 py-1.5 text-left text-xs font-semibold text-muted-foreground">
                Active
              </th>
              <th className="w-[90px] min-w-[80px] px-2 py-1.5 text-left text-xs font-semibold text-muted-foreground">
                System
              </th>
              <th className="w-[90px] min-w-[80px] px-2 py-1.5 text-right text-xs font-semibold text-muted-foreground pr-3">
                Actions
              </th>
            </tr>
          </thead>
          <tbody className="[&_tr:last-child]:border-0">
            {isLoading ? (
              Array.from({ length: 6 }).map((_, i) => (
                <tr key={i} className="h-9 border-b border-border">
                  {Array.from({ length: 6 }).map((__, j) => (
                    <td key={j} className="px-2 py-1.5">
                      <Skeleton className="h-4 w-full" />
                    </td>
                  ))}
                  <td className="px-2 py-1.5">
                    <Skeleton className="h-4 w-16" />
                  </td>
                </tr>
              ))
            ) : services.length === 0 ? (
              <tr>
                <td colSpan={7} className="h-32 text-center p-2">
                  <div className="flex flex-col items-center gap-2 text-muted-foreground">
                    <Plug className="h-10 w-10 opacity-30" />
                    <p className="text-sm">No services found</p>
                  </div>
                </td>
              </tr>
            ) : (
              services.map((item, idx) => (
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
                    <span
                      className="text-xs font-medium truncate block max-w-[190px]"
                      title={item.display_name}
                    >
                      {item.display_name}
                    </span>
                  </td>
                  <td className="py-1 px-2 align-middle">
                    <span
                      className="text-xs font-mono text-muted-foreground truncate block max-w-[170px]"
                      title={item.internal_name}
                    >
                      {item.internal_name}
                    </span>
                  </td>
                  <td className="py-1 px-2 align-middle">
                    <Badge variant="outline" className="text-xs font-mono">
                      {item.wire_format}
                    </Badge>
                  </td>
                  <td className="py-1 px-2 align-middle text-right">
                    <span className="text-xs tabular-nums text-muted-foreground">
                      {item.priority}
                    </span>
                  </td>
                  <td className="py-1 px-2 align-middle">
                    {item.is_active ? (
                      <Badge
                        variant="outline"
                        className="text-xs bg-green-50 dark:bg-green-900/20 text-green-700 dark:text-green-300"
                      >
                        Active
                      </Badge>
                    ) : (
                      <Badge
                        variant="outline"
                        className="text-xs bg-muted text-muted-foreground"
                      >
                        Inactive
                      </Badge>
                    )}
                  </td>
                  <td className="py-1 px-2 align-middle">
                    {item.is_system ? (
                      <Badge
                        variant="outline"
                        className="text-xs gap-1 bg-muted text-muted-foreground border-border"
                      >
                        <Lock className="h-3 w-3" />
                        System
                      </Badge>
                    ) : (
                      <span className="text-muted-foreground text-xs">—</span>
                    )}
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
    </div>
  );
}
