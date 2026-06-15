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
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Search, Menu } from "lucide-react";

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
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [searchQuery, setSearchQuery] = useState("");

  // Load tables on mount
  useEffect(() => {
    loadTables();
    // eslint-disable-next-line react-hooks/exhaustive-deps
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
    // eslint-disable-next-line react-hooks/exhaustive-deps
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
  const filteredTables = sortedTables.filter((t) =>
    t.table_name.toLowerCase().includes(searchQuery.toLowerCase()),
  );

  return (
    <div
      className={cn("flex w-full h-full flex-row overflow-hidden", className)}
    >
      {/* Collapsible Sidebar */}
      <div
        className={`flex-shrink-0 transition-all duration-300 ease-in-out border-r border-zinc-200 dark:border-zinc-800 bg-zinc-50/50 dark:bg-zinc-900/50 flex flex-col ${
          sidebarOpen ? "w-64" : "w-0 overflow-hidden border-r-0"
        }`}
      >
        {sidebarOpen && (
          <>
            <div className="p-3 border-b border-zinc-200 dark:border-zinc-800 shrink-0">
              <div className="relative">
                <Search className="absolute left-2 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input
                  placeholder="Search tables..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="pl-8 h-8 text-xs"
                />
              </div>
            </div>
            <ScrollArea className="flex-1 w-full relative">
              <div className="p-2 space-y-0.5 min-h-[50px]">
                {filteredTables.map((table) => (
                  <button
                    key={table.id}
                    onClick={() => handleTableChange(table.id)}
                    className={cn(
                      "w-full text-left px-3 py-2 rounded-md text-sm transition-colors",
                      selectedTableId === table.id
                        ? "bg-primary text-primary-foreground font-medium flex justify-between items-center shadow-sm"
                        : "hover:bg-muted text-muted-foreground hover:text-foreground flex justify-between items-center",
                    )}
                  >
                    <span className="truncate flex-1 pr-2">
                      {table.table_name}
                    </span>
                    <span
                      className={cn(
                        "text-[10px] shrink-0 font-medium",
                        selectedTableId === table.id
                          ? "text-primary-foreground/80"
                          : "text-muted-foreground/60",
                      )}
                    >
                      {table.row_count}
                    </span>
                  </button>
                ))}
              </div>
            </ScrollArea>
          </>
        )}
      </div>

      {/* Main Content */}
      <div className="flex-1 flex flex-col min-w-0 min-h-0 bg-background relative">
        {/* Compact Header */}
        <div className="flex items-center p-2 border-b border-zinc-200 dark:border-zinc-800 bg-background z-10 shrink-0 shadow-sm">
          <Button
            variant="ghost"
            size="icon"
            onClick={() => setSidebarOpen(!sidebarOpen)}
            className="h-8 w-8 mr-2 shrink-0"
            title={sidebarOpen ? "Hide table list" : "Show table list"}
          >
            <Menu className="h-4 w-4" />
          </Button>
          {/* Table name is rendered by UserTableViewer below — don't repeat it
              here. This row is just the sidebar toggle + actions. */}
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

        {/* Table Viewer - Takes full remaining space */}
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
    </div>
  );
}
