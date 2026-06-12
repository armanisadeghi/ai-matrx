"use client";

import React, { useEffect, useMemo, useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Drawer,
  DrawerContent,
  DrawerDescription,
  DrawerFooter,
  DrawerHeader,
  DrawerTitle,
} from "@/components/ui/drawer";
import { Input } from "@/components/ui/input";
import { idMatchesQuery } from "@/utils/search-scoring";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  AlertCircle,
  Building,
  FolderKanban,
  ListChecks,
  Loader2,
  RefreshCw,
  Search,
  Shield,
  User,
} from "lucide-react";
import { useIsMobile } from "@/hooks/use-mobile";
import { useAppSelector } from "@/lib/redux/hooks";
import { selectIsSuperAdmin } from "@/lib/redux/slices/userSlice";
import { useAgentShortcutCrud } from "../hooks/useAgentShortcutCrud";
import type { AdminNonGlobalShortcutRow } from "@/features/agents/redux/agent-shortcuts/thunks";

type ScopeFilter = "all" | "user" | "organization" | "project" | "task";

const SCOPE_META: Record<
  Exclude<ScopeFilter, "all">,
  { label: string; Icon: React.ComponentType<{ className?: string }> }
> = {
  user: { label: "User", Icon: User },
  organization: { label: "Org", Icon: Building },
  project: { label: "Project", Icon: FolderKanban },
  task: { label: "Task", Icon: ListChecks },
};

export interface ImportShortcutsBrowserModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSelect: (row: AdminNonGlobalShortcutRow) => void;
}

export function ImportShortcutsBrowserModal({
  isOpen,
  onClose,
  onSelect,
}: ImportShortcutsBrowserModalProps) {
  const isMobile = useIsMobile();
  const isAdmin = useAppSelector(selectIsSuperAdmin);
  const crud = useAgentShortcutCrud({ scope: "global" });

  const [rows, setRows] = useState<AdminNonGlobalShortcutRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [scopeFilter, setScopeFilter] = useState<ScopeFilter>("all");

  const loadRows = async () => {
    setLoading(true);
    setError(null);
    try {
      const result = await crud.listNonGlobalShortcutsForAdmin();
      setRows(result);
    } catch (err) {
      const message =
        err instanceof Error ? err.message : "Failed to load shortcuts";
      setError(message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (!isOpen || !isAdmin) return;
    setSearch("");
    setScopeFilter("all");
    void loadRows();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen, isAdmin]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return rows.filter((r) => {
      if (scopeFilter !== "all" && r.scope_type !== scopeFilter) return false;
      if (!q) return true;
      return (
        r.label?.toLowerCase().includes(q) ||
        r.description?.toLowerCase().includes(q) ||
        r.owner_display?.toLowerCase().includes(q) ||
        r.owner_email?.toLowerCase().includes(q) ||
        idMatchesQuery(r, q)
      );
    });
  }, [rows, search, scopeFilter]);

  const stats = useMemo(() => {
    const acc: Record<string, number> = {
      user: 0,
      organization: 0,
      project: 0,
      task: 0,
    };
    for (const r of rows) {
      if (acc[r.scope_type] !== undefined) acc[r.scope_type] += 1;
    }
    return acc;
  }, [rows]);

  const body = (
    <div className="flex flex-col gap-3 min-h-0 h-full">
      {!isAdmin && (
        <Alert variant="destructive">
          <Shield className="h-4 w-4" />
          <AlertDescription>
            Admin privileges required to browse non-global shortcuts.
          </AlertDescription>
        </Alert>
      )}

      <div className="flex items-center gap-2">
        <div className="relative flex-1">
          <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Search label, description, or owner..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-8"
            disabled={!isAdmin}
          />
        </div>
        <Button
          variant="outline"
          size="sm"
          onClick={() => void loadRows()}
          disabled={loading || !isAdmin}
          title="Refresh"
        >
          <RefreshCw className={`h-4 w-4 ${loading ? "animate-spin" : ""}`} />
        </Button>
      </div>

      <div className="flex flex-wrap items-center gap-1.5">
        <Button
          variant={scopeFilter === "all" ? "default" : "outline"}
          size="sm"
          className="h-7"
          onClick={() => setScopeFilter("all")}
        >
          All
          <Badge variant="secondary" className="ml-1.5 text-xs">
            {rows.length}
          </Badge>
        </Button>
        {(Object.keys(SCOPE_META) as (keyof typeof SCOPE_META)[]).map((key) => {
          const meta = SCOPE_META[key];
          const Icon = meta.Icon;
          return (
            <Button
              key={key}
              variant={scopeFilter === key ? "default" : "outline"}
              size="sm"
              className="h-7"
              onClick={() => setScopeFilter(key)}
            >
              <Icon className="h-3 w-3 mr-1" />
              {meta.label}
              <Badge variant="secondary" className="ml-1.5 text-xs">
                {stats[key] ?? 0}
              </Badge>
            </Button>
          );
        })}
      </div>

      {error && (
        <Alert variant="destructive">
          <AlertCircle className="h-4 w-4" />
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}

      <ScrollArea className="flex-1 min-h-0 border border-border rounded-md bg-background">
        {loading && rows.length === 0 ? (
          <div className="flex items-center justify-center py-12 text-sm text-muted-foreground">
            <Loader2 className="h-4 w-4 mr-2 animate-spin" />
            Loading shortcuts...
          </div>
        ) : filtered.length === 0 ? (
          <div className="py-12 text-center text-sm text-muted-foreground">
            {rows.length === 0
              ? "No non-global shortcuts found"
              : "No shortcuts match your filters"}
          </div>
        ) : (
          <ul className="divide-y divide-border">
            {filtered.map((row) => {
              const scopeKey = row.scope_type as keyof typeof SCOPE_META;
              const meta = SCOPE_META[scopeKey];
              const Icon = meta?.Icon;
              return (
                <li key={row.id}>
                  <button
                    type="button"
                    className="w-full text-left px-3 py-2.5 hover:bg-muted transition-colors flex items-start gap-3"
                    onClick={() => onSelect(row)}
                  >
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-0.5">
                        {Icon && (
                          <Badge
                            variant="outline"
                            className="text-[10px] h-5 gap-1"
                          >
                            <Icon className="h-3 w-3" />
                            {meta.label}
                          </Badge>
                        )}
                        {!row.is_active && (
                          <Badge
                            variant="secondary"
                            className="text-[10px] h-5"
                          >
                            Inactive
                          </Badge>
                        )}
                        <span className="font-medium truncate">
                          {row.label}
                        </span>
                      </div>
                      {row.description && (
                        <p className="text-xs text-muted-foreground line-clamp-1">
                          {row.description}
                        </p>
                      )}
                      <div className="text-[11px] text-muted-foreground mt-0.5 truncate">
                        {row.owner_display ?? row.owner_email ?? row.user_id}
                      </div>
                    </div>
                    <Button size="sm" variant="secondary" tabIndex={-1}>
                      Import
                    </Button>
                  </button>
                </li>
              );
            })}
          </ul>
        )}
      </ScrollArea>
    </div>
  );

  if (isMobile) {
    return (
      <Drawer open={isOpen} onOpenChange={(open) => !open && onClose()}>
        <DrawerContent className="max-h-[92dvh] pb-safe">
          <DrawerHeader>
            <DrawerTitle>Import from Shortcut</DrawerTitle>
            <DrawerDescription>
              Browse any non-global shortcut and import it into the global
              system pool
            </DrawerDescription>
          </DrawerHeader>
          <div className="px-4 pb-3 flex-1 min-h-0 overflow-hidden">{body}</div>
          <DrawerFooter className="flex-row gap-2 justify-end">
            <Button variant="outline" size="sm" onClick={onClose}>
              Close
            </Button>
          </DrawerFooter>
        </DrawerContent>
      </Drawer>
    );
  }

  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-w-2xl h-[70dvh] flex flex-col">
        <DialogHeader>
          <DialogTitle>Import from Shortcut</DialogTitle>
          <DialogDescription>
            Browse any non-global shortcut and import it into the global system
            pool
          </DialogDescription>
        </DialogHeader>
        <div className="flex-1 min-h-0">{body}</div>
        <DialogFooter>
          <Button variant="outline" size="sm" onClick={onClose}>
            Close
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
