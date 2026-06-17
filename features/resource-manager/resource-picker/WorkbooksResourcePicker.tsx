"use client";

import React, { useEffect, useState } from "react";
import { ChevronLeft, Search, Loader2, Notebook } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { listAccessibleWorkbooks } from "@/features/data-tables/workbook-service";
import { isServiceFailure, type Workbook } from "@/features/data-tables/types";
import { filterAndSortBySearch } from "@/utils/search-scoring";

interface WorkbooksResourcePickerProps {
  onBack: () => void;
  onSelect: (workbook: Workbook) => void;
}

export function WorkbooksResourcePicker({
  onBack,
  onSelect,
}: WorkbooksResourcePickerProps) {
  const [workbooks, setWorkbooks] = useState<Workbook[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState("");

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      const result = await listAccessibleWorkbooks();
      if (cancelled) return;
      if (isServiceFailure(result)) {
        setError(result.error);
        setWorkbooks([]);
      } else {
        setError(null);
        setWorkbooks(result.data);
      }
      setLoading(false);
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const filteredWorkbooks = searchQuery.trim()
    ? filterAndSortBySearch(workbooks, searchQuery, [
        { get: (w) => w.workbook_name, weight: "title" },
        { get: (w) => w.description, weight: "body" },
      ])
    : workbooks;

  return (
    <div className="flex flex-col max-h-[min(460px,70dvh)]">
      {/* Header */}
      <div className="flex items-center gap-2 px-3 py-2 border-b border-border">
        <Button
          variant="ghost"
          size="sm"
          className="h-6 w-6 p-0 flex-shrink-0"
          onClick={onBack}
        >
          <ChevronLeft className="w-4 h-4" />
        </Button>
        <span className="text-sm font-medium text-foreground flex-1 truncate">
          Workbooks
        </span>
      </div>

      {/* Search */}
      <div className="px-2 py-2 border-b border-border">
        <div className="relative">
          <Search className="absolute left-2 top-1/2 transform -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground" />
          <Input
            type="text"
            placeholder="Search..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="h-7 text-xs pl-7 pr-2 bg-background border-border"
          />
        </div>
      </div>

      {/* Content */}
      <div className="flex-1 min-h-0 overflow-y-auto scrollbar-thin">
        {loading ? (
          <div className="flex items-center justify-center h-full py-8">
            <Loader2 className="w-5 h-5 animate-spin text-muted-foreground" />
          </div>
        ) : error ? (
          <div className="text-xs text-destructive text-center py-8 px-3">
            {error}
          </div>
        ) : filteredWorkbooks.length === 0 ? (
          <div className="text-xs text-muted-foreground text-center py-8">
            {searchQuery ? "No workbooks found" : "No workbooks yet"}
          </div>
        ) : (
          <div className="p-1 space-y-0.5">
            {filteredWorkbooks.map((workbook) => (
              <button
                key={workbook.id}
                onClick={() => onSelect(workbook)}
                className="w-full flex items-center gap-2 px-2 py-1.5 rounded hover:bg-accent transition-colors group"
              >
                <Notebook className="w-4 h-4 flex-shrink-0 text-primary" />
                <span className="flex-1 text-left text-xs font-medium text-foreground truncate">
                  {workbook.workbook_name}
                </span>
                <span className="text-[10px] text-muted-foreground flex-shrink-0">
                  {new Date(workbook.updated_at).toLocaleDateString("en-US", {
                    month: "short",
                    day: "numeric",
                  })}
                </span>
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
