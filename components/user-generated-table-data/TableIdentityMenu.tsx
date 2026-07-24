"use client";

// TableIdentityMenu — ONE control in the route header that does the four jobs
// the /data/[id] header used to do with two duplicated ones:
//
//   1. shows which table you are in (the identity),
//   2. renames it inline,
//   3. switches to another table,
//   4. creates a new one.
//
// It replaces the old pairing of a title span in the header AND a full-width
// `Select` card below it that repeated the same name — the duplication the
// route header rules already forbid ("ONE canonical control per choice").
//
// Modeled on the War Room room switcher: the trigger IS the name, the chevron
// opens the list, and renaming happens in place rather than behind a settings
// modal.

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Check, ChevronDown, Pencil, Plus, Search } from "lucide-react";
import {
  Popover,
  PopoverTrigger,
  PopoverContent,
} from "@/components/ui/popover";
import { cn } from "@/lib/utils";
import { toast } from "@/lib/toast";
import { supabase } from "@/utils/supabase/client";

export interface TableSummary {
  id: string;
  table_name: string;
  row_count: number;
  field_count: number;
}

interface TableIdentityMenuProps {
  tableId: string;
  tableName: string;
  /** Row/field counts for the current table, shown under the name in the list. */
  tables: readonly TableSummary[];
  /** Owner-only. A shared read-only table shows the name but cannot be renamed. */
  canRename?: boolean;
  /** Fires after a successful rename so the page can refresh its own copy. */
  onRenamed?: (nextName: string) => void;
  /** Opens the create-table flow owned by the page. */
  onCreateTable?: () => void;
}

export default function TableIdentityMenu({
  tableId,
  tableName,
  tables,
  canRename = true,
  onRenamed,
  onCreateTable,
}: TableIdentityMenuProps) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(tableName);
  const [saving, setSaving] = useState(false);
  const [query, setQuery] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!editing) setDraft(tableName);
  }, [tableName, editing]);

  useEffect(() => {
    if (editing) {
      inputRef.current?.focus();
      inputRef.current?.select();
    }
  }, [editing]);

  // Reset the transient sub-states each time the menu closes, so reopening
  // never lands mid-rename or mid-search.
  useEffect(() => {
    if (!open) {
      setEditing(false);
      setQuery("");
    }
  }, [open]);

  async function commitRename() {
    const next = draft.trim();
    setEditing(false);
    if (!next || next === tableName) {
      setDraft(tableName);
      return;
    }
    setSaving(true);
    try {
      const { data, error } = await supabase.rpc("update_user_table_metadata", {
        p_table_id: tableId,
        p_table_name: next,
      });
      if (error) throw error;
      if (
        typeof data !== "object" ||
        data === null ||
        typeof (data as { success?: unknown }).success !== "boolean"
      ) {
        throw new Error("Invalid rename response");
      }
      if (!(data as { success: boolean }).success) {
        throw new Error(
          (data as { error?: string }).error ?? "Failed to rename table",
        );
      }
      onRenamed?.(next);
      toast.success("Table renamed");
    } catch (err) {
      console.error("[table-identity] rename failed", err);
      setDraft(tableName);
      toast.error(
        err instanceof Error ? err.message : "Failed to rename table",
      );
    } finally {
      setSaving(false);
    }
  }

  const filtered = query.trim()
    ? tables.filter((t) =>
        t.table_name.toLowerCase().includes(query.trim().toLowerCase()),
      )
    : tables;

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button
          type="button"
          className={cn(
            "ml-1 flex min-w-0 items-center gap-1 rounded-md px-1.5 py-1 text-sm font-medium text-foreground transition-colors",
            "hover:bg-accent/60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40",
          )}
          title="Table — rename, switch, or create"
        >
          <span className="truncate max-w-[48vw] sm:max-w-[280px]">
            {tableName || "Untitled table"}
          </span>
          <ChevronDown className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
        </button>
      </PopoverTrigger>

      <PopoverContent align="start" className="w-80 p-0">
        {/* Identity + rename */}
        <div className="border-b border-border px-2.5 py-2">
          <div className="mb-1 text-[0.625rem] font-semibold uppercase tracking-wide text-muted-foreground">
            This table
          </div>
          {editing ? (
            <input
              ref={inputRef}
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              onBlur={() => void commitRename()}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  void commitRename();
                } else if (e.key === "Escape") {
                  e.preventDefault();
                  setDraft(tableName);
                  setEditing(false);
                }
              }}
              disabled={saving}
              placeholder="Table name"
              // text-base (16px) avoids iOS input zoom (repo mobile rule).
              className="w-full rounded-md border border-primary/50 bg-card px-2 py-1.5 text-base sm:text-sm text-foreground outline-none focus-visible:ring-2 focus-visible:ring-primary/40"
            />
          ) : (
            <button
              type="button"
              onClick={() => canRename && setEditing(true)}
              disabled={!canRename}
              title={canRename ? "Click to rename" : "You cannot rename a shared table"}
              className={cn(
                "flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-sm text-foreground",
                canRename
                  ? "hover:bg-accent/60"
                  : "cursor-default opacity-70",
              )}
            >
              <span className="min-w-0 flex-1 truncate">
                {saving ? "Saving…" : tableName || "Untitled table"}
              </span>
              {canRename && (
                <Pencil className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
              )}
            </button>
          )}
        </div>

        {/* Switch */}
        <div className="px-2.5 pt-2">
          <div className="relative">
            <Search className="pointer-events-none absolute left-2 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Switch to table…"
              className="w-full rounded-md border border-border bg-card py-1.5 pl-7 pr-2 text-base sm:text-sm text-foreground outline-none focus-visible:ring-2 focus-visible:ring-primary/40"
            />
          </div>
        </div>

        <div className="max-h-[18rem] overflow-y-auto px-1.5 py-1.5">
          {filtered.length === 0 ? (
            <div className="px-2 py-4 text-center text-xs text-muted-foreground">
              {tables.length === 0 ? "No other tables yet" : "No matches"}
            </div>
          ) : (
            filtered.map((t) => {
              const active = t.id === tableId;
              return (
                <button
                  key={t.id}
                  type="button"
                  onClick={() => {
                    setOpen(false);
                    if (!active) router.push(`/data/${t.id}`);
                  }}
                  className={cn(
                    "flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left transition-colors",
                    active ? "bg-accent/70" : "hover:bg-accent/50",
                  )}
                >
                  <div className="min-w-0 flex-1">
                    <div className="truncate text-xs font-medium text-foreground">
                      {t.table_name}
                    </div>
                    <div className="text-[0.625rem] text-muted-foreground">
                      {t.row_count} rows · {t.field_count} fields
                    </div>
                  </div>
                  {active && (
                    <Check className="h-3.5 w-3.5 shrink-0 text-primary" />
                  )}
                </button>
              );
            })
          )}
        </div>

        {onCreateTable && (
          <div className="border-t border-border p-1.5">
            <button
              type="button"
              onClick={() => {
                setOpen(false);
                onCreateTable();
              }}
              className="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-xs font-medium text-foreground hover:bg-accent/60"
            >
              <Plus className="h-3.5 w-3.5 text-muted-foreground" />
              New table
            </button>
          </div>
        )}
      </PopoverContent>
    </Popover>
  );
}
