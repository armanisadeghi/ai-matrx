"use client";

import React, { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import {
  AlertCircle,
  ArrowUp,
  ExternalLink,
  Plus,
  RefreshCw,
  Sparkles,
  Trash2,
  X,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { toast } from "sonner";
import { confirm } from "@/components/dialogs/confirm/ConfirmDialogHost";
import {
  listBindingsForSurface,
  removeBinding,
  updateBinding,
  type ExecutorBindingRow,
  type ExecutorSurfaceWithStats,
} from "@/features/tool-registry/executor-surfaces/services/executor-surfaces.service";
import { AddToolBindingDialog } from "@/features/tool-registry/executor-surfaces/components/AddToolBindingDialog";

interface Props {
  surface: ExecutorSurfaceWithStats;
  /** Called when bindings change so the parent can refresh counts in the master list. */
  onMutated: () => void;
  onClose?: () => void;
}

export function ExecutorSurfaceDetailPanel({
  surface,
  onMutated,
  onClose,
}: Props) {
  const [bindings, setBindings] = useState<ExecutorBindingRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [addOpen, setAddOpen] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const rows = await listBindingsForSurface(surface.name);
      setBindings(rows);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load bindings");
    } finally {
      setLoading(false);
    }
  }, [surface.name]);

  useEffect(() => {
    void load();
  }, [load]);

  const autoLoad = bindings.filter((b) => b.auto_load);
  const other = bindings.filter((b) => !b.auto_load);

  const handleToggleAutoLoad = async (
    row: ExecutorBindingRow,
    next: boolean,
  ) => {
    setBindings((cur) =>
      cur.map((b) => (b.id === row.id ? { ...b, auto_load: next } : b)),
    );
    try {
      await updateBinding(row.id, { auto_load: next });
      toast.success(
        `${row.tool_name ?? row.tool_id} ${next ? "will auto-load" : "no longer auto-loads"} on ${surface.name}`,
      );
      onMutated();
    } catch (e) {
      setBindings((cur) =>
        cur.map((b) => (b.id === row.id ? { ...b, auto_load: !next } : b)),
      );
      toast.error(e instanceof Error ? e.message : "Update failed");
    }
  };

  const handleToggleActive = async (row: ExecutorBindingRow, next: boolean) => {
    setBindings((cur) =>
      cur.map((b) => (b.id === row.id ? { ...b, is_active: next } : b)),
    );
    try {
      await updateBinding(row.id, { is_active: next });
      onMutated();
    } catch (e) {
      setBindings((cur) =>
        cur.map((b) => (b.id === row.id ? { ...b, is_active: !next } : b)),
      );
      toast.error(e instanceof Error ? e.message : "Update failed");
    }
  };

  const handleUpdatePriority = async (
    row: ExecutorBindingRow,
    value: number,
  ) => {
    if (!Number.isFinite(value) || value < 0) return;
    if (value === row.priority) return;
    const prev = row.priority;
    setBindings((cur) =>
      cur.map((b) => (b.id === row.id ? { ...b, priority: value } : b)),
    );
    try {
      await updateBinding(row.id, { priority: value });
    } catch (e) {
      setBindings((cur) =>
        cur.map((b) => (b.id === row.id ? { ...b, priority: prev } : b)),
      );
      toast.error(e instanceof Error ? e.message : "Update failed");
    }
  };

  const handleRemove = async (row: ExecutorBindingRow) => {
    const ok = await confirm({
      title: `Remove binding?`,
      description: (
        <>
          Unbind{" "}
          <span className="font-mono">{row.tool_name ?? row.tool_id}</span> from{" "}
          <span className="font-mono">{surface.name}</span>. The tool stays in
          the catalog. You can re-add it later.
        </>
      ),
      confirmLabel: "Remove",
      variant: "destructive",
    });
    if (!ok) return;
    try {
      await removeBinding(row.id);
      setBindings((cur) => cur.filter((b) => b.id !== row.id));
      toast.success(`Removed ${row.tool_name ?? row.tool_id}`);
      onMutated();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Remove failed");
    }
  };

  return (
    <div className="h-full flex flex-col bg-card">
      {/* Header */}
      <div className="shrink-0 px-3 py-2 border-b border-border">
        <div className="flex items-start gap-2">
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-1.5 flex-wrap">
              <h2 className="font-mono text-sm font-medium truncate">
                {surface.name}
              </h2>
              {surface.is_client_side ? (
                <Badge variant="outline" className="text-[10px] h-4 px-1">
                  client-side
                </Badge>
              ) : (
                <Badge variant="outline" className="text-[10px] h-4 px-1">
                  server-side
                </Badge>
              )}
              {surface.client_name && (
                <Badge variant="outline" className="text-[10px] h-4 px-1">
                  {surface.client_name}
                </Badge>
              )}
              {!surface.is_active && (
                <Badge variant="secondary" className="text-[10px] h-4 px-1">
                  inactive
                </Badge>
              )}
            </div>
            {surface.description && (
              <p className="mt-0.5 text-[11px] text-muted-foreground line-clamp-2">
                {surface.description}
              </p>
            )}
          </div>
          {onClose && (
            <Button
              variant="ghost"
              size="sm"
              onClick={onClose}
              className="h-6 w-6 p-0 shrink-0"
            >
              <X className="h-3.5 w-3.5" />
            </Button>
          )}
        </div>
        <div className="mt-1.5 flex items-center gap-1.5 text-[10px] text-muted-foreground">
          <Badge
            variant="outline"
            className="text-[10px] h-4 px-1 tabular-nums"
          >
            {bindings.length} bound
          </Badge>
          <Badge
            variant="default"
            className="text-[10px] h-4 px-1 tabular-nums"
          >
            {autoLoad.length} auto-load
          </Badge>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => void load()}
            className="h-5 px-1 ml-auto text-[10px] gap-1"
            disabled={loading}
          >
            <RefreshCw className={`h-3 w-3 ${loading ? "animate-spin" : ""}`} />
            Refresh
          </Button>
          <Button
            variant="default"
            size="sm"
            onClick={() => setAddOpen(true)}
            className="h-5 px-1.5 text-[10px] gap-1"
          >
            <Plus className="h-3 w-3" />
            Add tool
          </Button>
        </div>
      </div>

      {error && (
        <div className="shrink-0 mx-3 mt-2 rounded-md border border-destructive/40 bg-destructive/5 px-2 py-1.5 text-xs text-destructive flex items-center gap-2">
          <AlertCircle className="h-3.5 w-3.5 shrink-0" />
          <span className="truncate">{error}</span>
        </div>
      )}

      {/* Body */}
      <div className="flex-1 min-h-0 overflow-auto">
        {/* Section A — Auto-load on launch */}
        <SectionHeader
          icon={<Sparkles className="h-3.5 w-3.5 text-primary" />}
          title="Auto-load on launch"
          subtitle="Tools loaded automatically into every agent run on this surface"
          count={autoLoad.length}
        />
        {autoLoad.length === 0 ? (
          <EmptyState>
            {loading
              ? "Loading…"
              : "No tools auto-load on this surface yet. Bind a tool below or toggle one from 'Other bound tools' to auto-load."}
          </EmptyState>
        ) : (
          <BindingList
            rows={autoLoad}
            onToggleAutoLoad={handleToggleAutoLoad}
            onToggleActive={handleToggleActive}
            onUpdatePriority={handleUpdatePriority}
            onRemove={handleRemove}
          />
        )}

        {/* Section B — Other bound tools */}
        <SectionHeader
          icon={<ArrowUp className="h-3.5 w-3.5 text-muted-foreground" />}
          title="Other bound tools"
          subtitle="Available on this surface but only loaded on demand"
          count={other.length}
        />
        {other.length === 0 ? (
          <EmptyState>
            {loading
              ? "Loading…"
              : "Every tool bound to this surface is currently set to auto-load."}
          </EmptyState>
        ) : (
          <BindingList
            rows={other}
            onToggleAutoLoad={handleToggleAutoLoad}
            onToggleActive={handleToggleActive}
            onUpdatePriority={handleUpdatePriority}
            onRemove={handleRemove}
          />
        )}
      </div>

      {addOpen && (
        <AddToolBindingDialog
          surface={surface.name}
          onClose={() => setAddOpen(false)}
          onAdded={() => {
            setAddOpen(false);
            void load();
            onMutated();
          }}
        />
      )}
    </div>
  );
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function SectionHeader({
  icon,
  title,
  subtitle,
  count,
}: {
  icon: React.ReactNode;
  title: string;
  subtitle: string;
  count: number;
}) {
  return (
    <div className="sticky top-0 z-10 bg-muted/60 backdrop-blur px-3 py-1.5 border-b border-border flex items-center gap-2">
      {icon}
      <div className="flex-1 min-w-0">
        <div className="text-xs font-medium">{title}</div>
        <div className="text-[10px] text-muted-foreground truncate">
          {subtitle}
        </div>
      </div>
      <Badge variant="outline" className="text-[10px] tabular-nums h-4 px-1.5">
        {count}
      </Badge>
    </div>
  );
}

function EmptyState({ children }: { children: React.ReactNode }) {
  return (
    <div className="px-3 py-4 text-[11px] text-muted-foreground border-b border-border">
      {children}
    </div>
  );
}

interface BindingListProps {
  rows: ExecutorBindingRow[];
  onToggleAutoLoad: (row: ExecutorBindingRow, next: boolean) => void;
  onToggleActive: (row: ExecutorBindingRow, next: boolean) => void;
  onUpdatePriority: (row: ExecutorBindingRow, value: number) => void;
  onRemove: (row: ExecutorBindingRow) => void;
}

function BindingList({
  rows,
  onToggleAutoLoad,
  onToggleActive,
  onUpdatePriority,
  onRemove,
}: BindingListProps) {
  return (
    <div className="divide-y divide-border">
      {rows.map((row) => (
        <BindingRow
          key={row.id}
          row={row}
          onToggleAutoLoad={onToggleAutoLoad}
          onToggleActive={onToggleActive}
          onUpdatePriority={onUpdatePriority}
          onRemove={onRemove}
        />
      ))}
    </div>
  );
}

function BindingRow({
  row,
  onToggleAutoLoad,
  onToggleActive,
  onUpdatePriority,
  onRemove,
}: {
  row: ExecutorBindingRow;
  onToggleAutoLoad: (row: ExecutorBindingRow, next: boolean) => void;
  onToggleActive: (row: ExecutorBindingRow, next: boolean) => void;
  onUpdatePriority: (row: ExecutorBindingRow, value: number) => void;
  onRemove: (row: ExecutorBindingRow) => void;
}) {
  const [priorityDraft, setPriorityDraft] = useState(String(row.priority));
  useEffect(() => {
    setPriorityDraft(String(row.priority));
  }, [row.priority]);

  const toolHref = `/administration/mcp-tools/${row.tool_id}`;

  return (
    <div
      className={`px-3 py-2 flex items-center gap-2 hover:bg-accent/30 ${row.is_active ? "" : "opacity-60"}`}
    >
      <div className="flex-1 min-w-0">
        <Link
          href={toolHref}
          target="_blank"
          rel="noopener noreferrer"
          className="text-xs font-medium truncate text-foreground hover:text-primary hover:underline inline-flex items-center gap-1 max-w-full"
          title={row.tool_name ?? row.tool_id}
        >
          <span className="truncate">{row.tool_name ?? "(unnamed tool)"}</span>
          <ExternalLink className="h-3 w-3 shrink-0 opacity-60" />
        </Link>
        <div className="font-mono text-[10px] text-muted-foreground truncate">
          {row.tool_category ? `${row.tool_category} · ` : ""}
          {row.tool_id}
        </div>
        {row.tool_description && (
          <div className="text-[10px] text-muted-foreground truncate mt-0.5">
            {row.tool_description}
          </div>
        )}
      </div>

      {/* Tool flags */}
      <div className="flex flex-col items-end gap-0.5 shrink-0">
        {row.tool_is_active === false && (
          <Badge
            variant="outline"
            className="text-[9px] h-4 px-1 text-muted-foreground"
            title="The underlying tl_def tool is inactive"
          >
            tool inactive
          </Badge>
        )}
        {row.delegated && (
          <Badge variant="outline" className="text-[9px] h-4 px-1">
            delegated
          </Badge>
        )}
      </div>

      {/* Priority */}
      <div className="flex flex-col items-center gap-0 shrink-0">
        <Input
          type="number"
          value={priorityDraft}
          onChange={(e) => setPriorityDraft(e.target.value)}
          onBlur={() => {
            const n = Number(priorityDraft);
            if (Number.isFinite(n)) onUpdatePriority(row, n);
            else setPriorityDraft(String(row.priority));
          }}
          onKeyDown={(e) => {
            if (e.key === "Enter") (e.target as HTMLInputElement).blur();
          }}
          className="h-6 w-14 text-[11px] tabular-nums text-center font-mono px-1"
          style={{ fontSize: "16px" }}
          title="Priority — lower runs first"
        />
        <span className="text-[9px] text-muted-foreground">priority</span>
      </div>

      {/* Active */}
      <div className="flex flex-col items-center gap-0 shrink-0">
        <Switch
          checked={row.is_active}
          onCheckedChange={(v) => onToggleActive(row, v)}
          className="scale-75"
        />
        <span className="text-[9px] text-muted-foreground">active</span>
      </div>

      {/* Auto-load */}
      <div className="flex flex-col items-center gap-0 shrink-0">
        <Switch
          checked={row.auto_load}
          onCheckedChange={(v) => onToggleAutoLoad(row, v)}
          className="scale-75"
        />
        <span className="text-[9px] text-muted-foreground">auto-load</span>
      </div>

      {/* Remove */}
      <Button
        variant="ghost"
        size="sm"
        onClick={() => onRemove(row)}
        className="h-6 w-6 p-0 shrink-0 text-muted-foreground hover:text-destructive"
        title="Remove binding"
      >
        <Trash2 className="h-3.5 w-3.5" />
      </Button>
    </div>
  );
}
