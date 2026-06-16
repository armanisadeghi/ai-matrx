// features/quick-actions/components/QuickDataSheet.tsx
"use client";

import React, { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { ExternalLink } from "lucide-react";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import UserTableViewer from "@/components/user-generated-table-data/UserTableViewer";
import { supabase } from "@/utils/supabase/client";
import { cn } from "@/lib/utils";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

interface QuickDataSheetProps {
  onClose?: () => void;
  className?: string;
  /**
   * Optional table id to pre-select on mount. When provided (e.g. from the
   * window registry's `selectedTable` data slot or after saving a new table),
   * this table is selected instead of auto-selecting the first one.
   */
  initialTableId?: string | null;
}

interface UserTable {
  id: string;
  table_name: string;
  description: string;
  row_count: number;
  field_count: number;
  updated_at?: string;
}

/**
 * QuickDataSheet - Access user-generated tables
 * Provides quick access to data tables without losing context
 */
export function QuickDataSheet({
  onClose,
  className,
  initialTableId,
}: QuickDataSheetProps) {
  const [tables, setTables] = useState<UserTable[]>([]);
  const [selectedTableId, setSelectedTableId] = useState<string | null>(
    initialTableId ?? null,
  );
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Load tables on mount
  useEffect(() => {
    loadTables();
  }, []);

  // Honor `initialTableId` updates after mount (e.g. window restored from URL
  // hydration with a different table, or another save dispatched while the
  // window was already open).
  useEffect(() => {
    if (initialTableId && initialTableId !== selectedTableId) {
      setSelectedTableId(initialTableId);
    }
    // Intentionally only re-run when `initialTableId` changes — local
    // selection should otherwise be user-controlled.
  }, [initialTableId]);

  const loadTables = async () => {
    try {
      setLoading(true);
      setError(null);

      const { data, error: rpcError } = await supabase.rpc("get_user_tables");

      if (rpcError) throw rpcError;
      const tablesPayload = data as unknown as {
        success: boolean;
        error?: string;
        tables?: UserTable[];
      };
      if (!tablesPayload.success)
        throw new Error(tablesPayload.error || "Failed to load tables");

      const tablesList = tablesPayload.tables || [];
      setTables(tablesList);

      // Prefer the explicit `initialTableId` if it matches a loaded table;
      // otherwise auto-select the first one when nothing is selected yet.
      const matchesInitial =
        initialTableId && tablesList.some((t) => t.id === initialTableId);
      if (matchesInitial) {
        setSelectedTableId(initialTableId!);
      } else if (tablesList.length > 0 && !selectedTableId) {
        // Default to the most recently updated table, mirroring the list order.
        const mostRecent = [...tablesList].sort(
          (a, b) =>
            (b.updated_at ? new Date(b.updated_at).getTime() : 0) -
            (a.updated_at ? new Date(a.updated_at).getTime() : 0),
        )[0];
        setSelectedTableId(mostRecent.id);
      }
    } catch (err) {
      console.error("Error loading tables:", err);
      setError(err instanceof Error ? err.message : "Failed to load tables");
    } finally {
      setLoading(false);
    }
  };

  const handleTableChange = (tableId: string) => {
    setSelectedTableId(tableId);
  };

  if (loading) {
    return (
      <div className={cn("flex items-center justify-center h-full", className)}>
        <div className="text-sm text-zinc-500 dark:text-zinc-400">
          Loading tables...
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div
        className={cn(
          "flex flex-col items-center justify-center h-full gap-3",
          className,
        )}
      >
        <div className="text-sm text-red-500">{error}</div>
        <Button variant="outline" size="sm" onClick={loadTables}>
          Try Again
        </Button>
      </div>
    );
  }

  if (tables.length === 0) {
    return (
      <div
        className={cn(
          "flex flex-col items-center justify-center h-full gap-3",
          className,
        )}
      >
        <div className="text-sm text-zinc-500 dark:text-zinc-400">
          No tables found
        </div>
        <Button
          variant="outline"
          size="sm"
          onClick={() => window.open("/data", "_blank")}
        >
          Create a Table
        </Button>
      </div>
    );
  }

  // Most recently updated first — quick access surfaces what you touched last,
  // not an alphabetical directory.
  const sortedTables = [...tables].sort((a, b) => {
    const at = a.updated_at ? new Date(a.updated_at).getTime() : 0;
    const bt = b.updated_at ? new Date(b.updated_at).getTime() : 0;
    return bt - at;
  });

  // A table picker in the header — NOT a sidebar. Quick Data is a table viewer;
  // the table itself needs every pixel of horizontal width, so the list of
  // tables lives in a dropdown rather than a column eating half the panel.
  return (
    <div
      className={cn("flex w-full h-full flex-col overflow-hidden", className)}
    >
      {/* Compact Header — table picker (dropdown) + open-in-tab. */}
      <div className="flex items-center gap-2 p-2 border-b border-zinc-200 dark:border-zinc-800 bg-background z-10 shrink-0 shadow-sm">
        <Select value={selectedTableId ?? ""} onValueChange={handleTableChange}>
          <SelectTrigger className="h-8 w-[260px] max-w-[60%] text-sm">
            <SelectValue placeholder="Select a table" />
          </SelectTrigger>
          <SelectContent>
            {sortedTables.map((table) => (
              <SelectItem key={table.id} value={table.id} className="text-sm">
                <span className="flex w-full items-center justify-between gap-3">
                  <span className="truncate">{table.table_name}</span>
                  <span className="text-[10px] text-muted-foreground shrink-0">
                    {table.row_count} rows
                  </span>
                </span>
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        <div className="flex-1" />

        <TooltipProvider>
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                variant="ghost"
                size="icon"
                className="h-8 w-8 text-muted-foreground hover:text-foreground"
                onClick={() => window.open("/data", "_blank")}
              >
                <ExternalLink className="h-4 w-4" />
              </Button>
            </TooltipTrigger>
            <TooltipContent>Open in New Tab</TooltipContent>
          </Tooltip>
        </TooltipProvider>
      </div>

      {/* Table Viewer — full panel width. */}
      <div className="flex-1 overflow-auto relative p-2">
        {selectedTableId && (
          <UserTableViewer
            key={selectedTableId}
            tableId={selectedTableId}
            showTableSelector={false}
          />
        )}
      </div>
    </div>
  );
}
