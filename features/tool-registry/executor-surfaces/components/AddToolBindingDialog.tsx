"use client";

import React, { useEffect, useMemo, useState } from "react";
import { ExternalLink, Loader2, Plus, Search } from "lucide-react";
import Link from "next/link";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { toast } from "sonner";
import {
  addBinding,
  listUnboundToolsForExecutor,
  type UnboundToolRow,
} from "@/features/tool-registry/executor-surfaces/services/executor-surfaces.service";
import { SourceKindBadge } from "@/features/tool-call-visualization/admin/mcp-tools/source-kind-badge";

interface Props {
  /** The owning `tool_executor.name`. */
  executorName: string;
  onClose: () => void;
  /** Called after at least one tool was successfully bound. */
  onAdded: () => void;
}

export function AddToolBindingDialog({
  executorName,
  onClose,
  onAdded,
}: Props) {
  const [tools, setTools] = useState<UnboundToolRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [showInactive, setShowInactive] = useState(false);
  const [adding, setAdding] = useState<string | null>(null);
  /** Track tool_ids successfully added so the parent refresh isn't needed yet. */
  const [addedIds, setAddedIds] = useState<Set<string>>(new Set());
  const [anyAdded, setAnyAdded] = useState(false);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    listUnboundToolsForExecutor(executorName)
      .then((rows) => {
        if (!cancelled) setTools(rows);
      })
      .catch((e) => {
        if (!cancelled) {
          setError(e instanceof Error ? e.message : "Failed to load tools");
        }
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [executorName]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return tools.filter((t) => {
      if (!showInactive && t.is_active === false) return false;
      if (!q) return true;
      if (t.name.toLowerCase().includes(q)) return true;
      if ((t.category ?? "").toLowerCase().includes(q)) return true;
      if (t.description.toLowerCase().includes(q)) return true;
      if (t.id.toLowerCase().includes(q)) return true;
      return false;
    });
  }, [tools, query, showInactive]);

  // Group by category for easier scanning
  const grouped = useMemo(() => {
    const map = new Map<string, UnboundToolRow[]>();
    for (const t of filtered) {
      const key = t.category ?? "(uncategorized)";
      const arr = map.get(key) ?? [];
      arr.push(t);
      map.set(key, arr);
    }
    return Array.from(map.entries()).sort(([a], [b]) => a.localeCompare(b));
  }, [filtered]);

  const handleAdd = async (tool: UnboundToolRow) => {
    if (adding) return;
    setAdding(tool.id);
    try {
      await addBinding({ executorName, toolId: tool.id, isActive: true });
      toast.success(`${tool.name} bound to ${executorName}`);
      setTools((cur) => cur.filter((t) => t.id !== tool.id));
      setAddedIds((cur) => {
        const next = new Set(cur);
        next.add(tool.id);
        return next;
      });
      setAnyAdded(true);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Bind failed");
    } finally {
      setAdding(null);
    }
  };

  const finish = () => {
    if (anyAdded) onAdded();
    else onClose();
  };

  return (
    <Dialog open onOpenChange={(o) => !o && finish()}>
      <DialogContent className="sm:max-w-2xl max-h-[80dvh] flex flex-col">
        <DialogHeader>
          <DialogTitle className="text-sm">
            Bind a tool to <span className="font-mono">{executorName}</span>
          </DialogTitle>
        </DialogHeader>

        <div className="shrink-0 flex items-center gap-2 pb-2 border-b border-border">
          <div className="relative flex-1">
            <Search className="absolute left-2 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
            <Input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search name, category, description, id…"
              className="h-8 pl-7 text-xs"
              style={{ fontSize: "16px" }}
              autoFocus
            />
          </div>
          <label className="flex items-center gap-1.5 text-[11px] text-muted-foreground select-none cursor-pointer">
            <input
              type="checkbox"
              checked={showInactive}
              onChange={(e) => setShowInactive(e.target.checked)}
              className="h-3 w-3"
            />
            Include inactive
          </label>
          <span className="text-[11px] text-muted-foreground tabular-nums">
            {filtered.length} / {tools.length}
          </span>
        </div>

        <div className="flex-1 min-h-0 min-w-0 overflow-y-auto overflow-x-hidden -mx-6 px-6">
          {loading && (
            <div className="py-8 text-center text-xs text-muted-foreground flex items-center justify-center gap-2">
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
              Loading tools…
            </div>
          )}
          {error && (
            <div className="py-4 text-center text-xs text-destructive">
              {error}
            </div>
          )}
          {!loading && !error && filtered.length === 0 && (
            <div className="py-8 text-center text-xs text-muted-foreground">
              {tools.length === 0
                ? "Every active tool is already bound to this executor."
                : "No tools match your search."}
            </div>
          )}
          {!loading && !error && grouped.length > 0 && (
            <div className="divide-y divide-border">
              {grouped.map(([category, items]) => (
                <div key={category}>
                  <div className="sticky top-0 z-10 bg-muted/60 backdrop-blur px-2 py-1 text-[10px] font-medium uppercase tracking-wide text-muted-foreground flex items-center gap-1.5">
                    <span>{category}</span>
                    <span className="ml-auto tabular-nums">{items.length}</span>
                  </div>
                  <div className="divide-y divide-border">
                    {items.map((tool) => {
                      const isAddingThis = adding === tool.id;
                      const wasAdded = addedIds.has(tool.id);
                      return (
                        <div
                          key={tool.id}
                          className={`px-2 py-2 min-w-0 ${tool.is_active === false ? "opacity-60" : ""} hover:bg-accent/30`}
                        >
                          <div className="flex items-start gap-2 min-w-0 flex-wrap sm:flex-nowrap">
                            <div className="flex-1 min-w-0 basis-full sm:basis-auto">
                              <div className="flex items-center gap-1.5 min-w-0 flex-wrap">
                                <Link
                                  href={`/administration/mcp-tools/${tool.id}`}
                                  target="_blank"
                                  rel="noopener noreferrer"
                                  className="text-xs font-medium text-foreground hover:text-primary hover:underline inline-flex items-center gap-1 min-w-0 max-w-full"
                                  title={tool.name}
                                >
                                  <span className="truncate">{tool.name}</span>
                                  <ExternalLink className="h-3 w-3 shrink-0 opacity-60" />
                                </Link>
                                <SourceKindBadge kind={tool.source_kind} />
                                {tool.is_active === false && (
                                  <Badge
                                    variant="outline"
                                    className="text-[9px] h-4 px-1 text-muted-foreground shrink-0"
                                  >
                                    inactive
                                  </Badge>
                                )}
                                {wasAdded && (
                                  <Badge
                                    variant="default"
                                    className="text-[9px] h-4 px-1 shrink-0"
                                  >
                                    added
                                  </Badge>
                                )}
                              </div>
                              {tool.description && (
                                <div className="text-[10px] text-muted-foreground truncate">
                                  {tool.description}
                                </div>
                              )}
                              <div className="font-mono text-[9px] text-muted-foreground/70 truncate">
                                {tool.id}
                              </div>
                            </div>
                            <div className="flex items-center gap-1 shrink-0 ml-auto sm:ml-0">
                              <Button
                                variant="default"
                                size="sm"
                                onClick={() => void handleAdd(tool)}
                                disabled={!!adding}
                                className="h-7 px-2 text-[11px] gap-1"
                                title="Bind this tool to the executor"
                              >
                                {isAddingThis ? (
                                  <Loader2 className="h-3 w-3 animate-spin" />
                                ) : (
                                  <Plus className="h-3 w-3" />
                                )}
                                Bind
                              </Button>
                            </div>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="shrink-0 pt-2 border-t border-border flex items-center justify-between gap-2">
          <span className="text-[11px] text-muted-foreground tabular-nums">
            {anyAdded
              ? `${addedIds.size} tool${addedIds.size === 1 ? "" : "s"} bound`
              : "No changes yet"}
          </span>
          <Button
            variant="ghost"
            size="sm"
            onClick={finish}
            disabled={!!adding}
          >
            Done
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
