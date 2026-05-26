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
  listExecutorSurfacesWithStats,
  type ExecutorSurfaceWithStats,
} from "@/features/tool-registry/executor-surfaces/services/executor-surfaces.service";

type SideFilter = "all" | "client" | "server";

export function ExecutorSurfacesContainer() {
  const isMobile = useIsMobile();
  const [surfaces, setSurfaces] = useState<ExecutorSurfaceWithStats[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [query, setQuery] = useState("");
  const [side, setSide] = useState<SideFilter>("all");
  const [selectedName, setSelectedName] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const rows = await listExecutorSurfacesWithStats();
      setSurfaces(rows);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load surfaces");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return surfaces.filter((s) => {
      if (side === "client" && !s.is_client_side) return false;
      if (side === "server" && s.is_client_side) return false;
      if (q) {
        if (
          !s.name.toLowerCase().includes(q) &&
          !(s.client_name ?? "").toLowerCase().includes(q) &&
          !(s.description ?? "").toLowerCase().includes(q)
        ) {
          return false;
        }
      }
      return true;
    });
  }, [surfaces, query, side]);

  const selected = useMemo(
    () => surfaces.find((s) => s.name === selectedName) ?? null,
    [surfaces, selectedName],
  );

  const totals = useMemo(() => {
    let bound = 0;
    let auto = 0;
    for (const s of surfaces) {
      bound += s.boundCount;
      auto += s.autoLoadCount;
    }
    return { bound, auto };
  }, [surfaces]);

  return (
    <div className="h-[calc(100dvh-var(--header-height))] flex flex-col bg-background">
      {/* Header */}
      <div className="shrink-0 px-3 py-1.5 border-b border-border flex items-center gap-2 flex-wrap">
        <Server className="h-4 w-4 text-muted-foreground" />
        <h1 className="text-sm font-medium">
          Tool Registry · Executor Surfaces
        </h1>
        <div className="flex items-center gap-1.5 text-[11px] text-muted-foreground">
          <Badge variant="outline" className="text-[10px]">
            {surfaces.length} surfaces
          </Badge>
          <Badge variant="outline" className="text-[10px]">
            {totals.bound} bindings
          </Badge>
          <Badge variant="default" className="text-[10px]">
            {totals.auto} auto-load
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
            placeholder="Search surface name, client, description…"
            className="h-7 pl-7 text-xs"
            style={{ fontSize: "16px" }}
          />
        </div>
        <div className="flex items-center gap-0.5 rounded-md border border-border p-0.5 bg-background">
          {(["all", "client", "server"] as const).map((opt) => (
            <button
              key={opt}
              type="button"
              onClick={() => setSide(opt)}
              className={`px-2 py-0.5 text-[11px] rounded-sm transition-colors ${
                side === opt
                  ? "bg-primary text-primary-foreground"
                  : "text-muted-foreground hover:text-foreground"
              }`}
            >
              {opt === "all" ? "All" : opt === "client" ? "Client" : "Server"}
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
                surface={selected}
                onMutated={() => void load()}
                onClose={() => setSelectedName(null)}
              />
            ) : (
              <div className="flex-1 flex items-center justify-center text-xs text-muted-foreground p-6 text-center">
                Pick an executor surface on the left to manage its tool
                bindings.
                <br />
                <span className="opacity-60">
                  The query{" "}
                  <code className="font-mono">
                    select tool.name from tl_def join tl_executor on … where
                    surface=<i>&lt;name&gt;</i> and auto_load is true
                  </code>{" "}
                  drives the &quot;Auto-load on launch&quot; section.
                </span>
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
                    surface={selected}
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
