"use client";

import React, { useCallback, useEffect, useMemo, useState } from "react";
import { AlertCircle, Loader2, RefreshCw, Server, Search } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Drawer,
  DrawerContent,
  DrawerHeader,
  DrawerTitle,
} from "@/components/ui/drawer";
import { useIsMobile } from "@/hooks/use-mobile";
import { ExecutorSurfacesTable } from "@/features/tool-registry/executor-surfaces/components/ExecutorSurfacesTable";
import { ExecutorSurfaceDetailPanel } from "@/features/tool-registry/executor-surfaces/components/ExecutorSurfaceDetailPanel";
import {
  listExecutorsWithStats,
  type ExecutorWithStats,
} from "@/features/tool-registry/executor-surfaces/services/executor-surfaces.service";

type KindFilter = "all" | "mcp" | "non-mcp";

export function ExecutorSurfacesContainer() {
  const isMobile = useIsMobile();
  const [executors, setExecutors] = useState<ExecutorWithStats[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [query, setQuery] = useState("");
  const [kind, setKind] = useState<KindFilter>("all");
  const [selectedName, setSelectedName] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const rows = await listExecutorsWithStats();
      setExecutors(rows);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load executors");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return executors.filter((s) => {
      if (kind === "mcp" && !s.isMcp) return false;
      if (kind === "non-mcp" && s.isMcp) return false;
      if (q) {
        if (
          !s.name.toLowerCase().includes(q) &&
          !(s.parent_executor_name ?? "").toLowerCase().includes(q) &&
          !(s.description ?? "").toLowerCase().includes(q)
        ) {
          return false;
        }
      }
      return true;
    });
  }, [executors, query, kind]);

  const selected = useMemo(
    () => executors.find((s) => s.name === selectedName) ?? null,
    [executors, selectedName],
  );

  const totals = useMemo(() => {
    let bound = 0;
    let active = 0;
    for (const s of executors) {
      bound += s.boundCount;
      active += s.boundCount - s.inactiveBindingCount;
    }
    return { bound, active };
  }, [executors]);

  return (
    <div className="h-[calc(100dvh-var(--header-height))] flex flex-col bg-background">
      {/* Header */}
      <div className="shrink-0 px-3 py-1.5 border-b border-border flex items-center gap-2 flex-wrap">
        <Server className="h-4 w-4 text-muted-foreground" />
        <h1 className="text-sm font-medium">Tool Registry · Executors</h1>
        <div className="flex items-center gap-1.5 text-[11px] text-muted-foreground">
          <Badge variant="outline" className="text-[10px]">
            {executors.length} executors
          </Badge>
          <Badge variant="outline" className="text-[10px]">
            {totals.bound} bindings
          </Badge>
          <Badge variant="default" className="text-[10px]">
            {totals.active} active
          </Badge>
        </div>
        {loading && (
          <Loader2 className="h-3.5 w-3.5 animate-spin text-muted-foreground" />
        )}
        <div className="ml-auto flex items-center gap-1.5">
          <Button
            size="sm"
            variant="ghost"
            onClick={() => void load()}
            className="h-7 gap-1.5 text-xs"
            disabled={loading}
          >
            <RefreshCw className="h-3.5 w-3.5" />
            Refresh
          </Button>
        </div>
      </div>

      {/* Filter bar */}
      <div className="shrink-0 px-3 py-1.5 border-b border-border flex items-center gap-2 flex-wrap bg-card">
        <div className="relative flex-1 min-w-[200px] max-w-md">
          <Search className="absolute left-2 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
          <Input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search executor name, parent, description…"
            className="h-7 pl-7 text-xs"
            style={{ fontSize: "16px" }}
          />
        </div>
        <div className="flex items-center gap-0.5 rounded-md border border-border p-0.5 bg-background">
          {(["all", "mcp", "non-mcp"] as const).map((opt) => (
            <button
              key={opt}
              type="button"
              onClick={() => setKind(opt)}
              className={`px-2 py-0.5 text-[11px] rounded-sm transition-colors ${
                kind === opt
                  ? "bg-primary text-primary-foreground"
                  : "text-muted-foreground hover:text-foreground"
              }`}
            >
              {opt === "all" ? "All" : opt === "mcp" ? "MCP" : "Non-MCP"}
            </button>
          ))}
        </div>
        <span className="text-[11px] text-muted-foreground tabular-nums">
          {filtered.length} shown
        </span>
      </div>

      {error && (
        <div className="mx-3 mt-2 rounded-md border border-destructive/40 bg-destructive/5 px-2 py-1.5 text-xs text-destructive flex items-center gap-2">
          <AlertCircle className="h-3.5 w-3.5" />
          {error}
        </div>
      )}

      {/* Body */}
      <div className="flex-1 min-h-0 flex">
        <div className="w-full md:w-[360px] shrink-0 flex flex-col border-r border-border bg-card">
          <ExecutorSurfacesTable
            rows={filtered}
            isLoading={loading}
            selectedName={selectedName}
            onSelect={(r) => setSelectedName(r.name)}
          />
        </div>

        {/* Desktop detail panel */}
        {!isMobile && (
          <div className="flex-1 min-w-0 hidden md:flex">
            {selected ? (
              <ExecutorSurfaceDetailPanel
                executor={selected}
                onMutated={() => void load()}
                onClose={() => setSelectedName(null)}
              />
            ) : (
              <div className="flex-1 flex items-center justify-center text-xs text-muted-foreground p-6 text-center max-w-md mx-auto">
                <div>
                  <p>Pick an executor on the left to manage its tool bindings.</p>
                  <p className="mt-2 opacity-60 text-[11px]">
                    Each executor (matrx-ai-core, aidream, matrx-local,
                    chrome-extension, matrx-user, or <code>mcp.&lt;slug&gt;</code>)
                    declares which tools it can handle. A binding is just a
                    (tool, executor) pair with an `is_active` flag.
                  </p>
                </div>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Mobile drawer */}
      {isMobile && (
        <Drawer
          open={!!selected}
          onOpenChange={(o) => {
            if (!o) setSelectedName(null);
          }}
        >
          <DrawerContent className="max-h-[92dvh]">
            {selected && (
              <>
                <DrawerHeader className="sr-only">
                  <DrawerTitle>{selected.name}</DrawerTitle>
                </DrawerHeader>
                <div className="flex-1 min-h-0 overflow-hidden">
                  <ExecutorSurfaceDetailPanel
                    executor={selected}
                    onMutated={() => void load()}
                    onClose={() => setSelectedName(null)}
                  />
                </div>
              </>
            )}
          </DrawerContent>
        </Drawer>
      )}
    </div>
  );
}
