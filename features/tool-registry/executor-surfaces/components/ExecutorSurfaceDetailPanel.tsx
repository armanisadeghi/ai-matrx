"use client";

import React, { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import {
  AlertCircle,
  ExternalLink,
  Network,
  Plus,
  RefreshCw,
  Server,
  Trash2,
  X,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { toast } from "sonner";
import { confirm } from "@/components/dialogs/confirm/ConfirmDialogHost";
import {
  listBindingsForExecutor,
  removeBinding,
  updateBinding,
  type ExecutorBindingRow,
  type ExecutorWithStats,
} from "@/features/tool-registry/executor-surfaces/services/executor-surfaces.service";
import { AddToolBindingDialog } from "@/features/tool-registry/executor-surfaces/components/AddToolBindingDialog";
import { SourceKindBadge } from "@/features/tool-call-visualization/admin/mcp-tools/source-kind-badge";

interface Props {
  /**
   * The executor being viewed. Post-2026 refactor: this is a `tool_executor`
   * row plus aggregate counts — no longer the conflated executor-surface.
   */
  executor: ExecutorWithStats;
  /** Called when bindings change so the parent can refresh counts in the master list. */
  onMutated: () => void;
  onClose?: () => void;
}

export function ExecutorSurfaceDetailPanel({
  executor,
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
      const rows = await listBindingsForExecutor(executor.name);
      setBindings(rows);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load bindings");
    } finally {
      setLoading(false);
    }
  }, [executor.name]);

  useEffect(() => {
    void load();
  }, [load]);

  const handleToggleActive = async (
    row: ExecutorBindingRow,
    next: boolean,
  ) => {
    setBindings((cur) =>
      cur.map((b) =>
        b.tool_id === row.tool_id ? { ...b, is_active: next } : b,
      ),
    );
    try {
      await updateBinding({
        toolId: row.tool_id,
        executorName: row.executor_name,
        isActive: next,
      });
      toast.success(
        `${row.tool_name ?? row.tool_id} ${next ? "active on" : "deactivated on"} ${executor.name}`,
      );
      onMutated();
    } catch (e) {
      setBindings((cur) =>
        cur.map((b) =>
          b.tool_id === row.tool_id ? { ...b, is_active: !next } : b,
        ),
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
          <span className="font-mono">{executor.name}</span>. The tool stays in
          the catalog. You can re-add it later.
        </>
      ),
      confirmLabel: "Remove",
      variant: "destructive",
    });
    if (!ok) return;
    try {
      await removeBinding({
        toolId: row.tool_id,
        executorName: row.executor_name,
      });
      setBindings((cur) => cur.filter((b) => b.tool_id !== row.tool_id));
      toast.success(`Removed ${row.tool_name ?? row.tool_id}`);
      onMutated();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Remove failed");
    }
  };

  const activeBindings = bindings.filter((b) => b.is_active);
  const inactiveBindings = bindings.filter((b) => !b.is_active);

  return (
    <div className="h-full w-full min-w-0 flex flex-col bg-card overflow-hidden">
      {/* Header */}
      <div className="shrink-0 px-3 py-2 border-b border-border">
        <div className="flex items-start gap-2">
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-1.5 flex-wrap">
              <h2 className="font-mono text-sm font-medium truncate">
                {executor.name}
              </h2>
              {executor.isMcp ? (
                <Badge
                  variant="outline"
                  className="text-[10px] h-4 px-1 gap-0.5"
                >
                  <Network className="h-2.5 w-2.5" />
                  MCP
                </Badge>
              ) : (
                <Badge variant="outline" className="text-[10px] h-4 px-1 gap-0.5">
                  <Server className="h-2.5 w-2.5" />
                  executor
                </Badge>
              )}
              {executor.parent_executor_name && (
                <Badge
                  variant="outline"
                  className="text-[10px] h-4 px-1"
                  title="Parent executor"
                >
                  parent: {executor.parent_executor_name}
                </Badge>
              )}
              {!executor.is_active && (
                <Badge variant="secondary" className="text-[10px] h-4 px-1">
                  inactive
                </Badge>
              )}
            </div>
            {executor.description && (
              <p className="mt-0.5 text-[11px] text-muted-foreground line-clamp-2">
                {executor.description}
              </p>
            )}
            {executor.mcp_server_id && (
              <Link
                href={`/administration/mcp-servers/${executor.mcp_server_id}`}
                target="_blank"
                rel="noopener noreferrer"
                className="mt-0.5 inline-flex items-center gap-1 text-[10px] text-amber-600 dark:text-amber-400 hover:underline font-mono"
              >
                <ExternalLink className="h-3 w-3" />
                MCP server: {executor.mcp_server_id}
              </Link>
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
            {activeBindings.length} active
          </Badge>
          {inactiveBindings.length > 0 && (
            <Badge
              variant="secondary"
              className="text-[10px] h-4 px-1 tabular-nums"
            >
              {inactiveBindings.length} inactive
            </Badge>
          )}
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
      <div className="flex-1 min-h-0 min-w-0 overflow-y-auto overflow-x-hidden">
        <SectionHeader
          icon={<Server className="h-3.5 w-3.5 text-primary" />}
          title="Bound tools"
          subtitle="Tools this executor can handle. Toggle active to enable/disable."
          count={bindings.length}
        />
        {bindings.length === 0 ? (
          <EmptyState>
            {loading
              ? "Loading…"
              : "No tools bound to this executor yet. Click 'Add tool' above to bind one."}
          </EmptyState>
        ) : (
          <BindingList
            rows={bindings}
            onToggleActive={handleToggleActive}
            onRemove={handleRemove}
          />
        )}
      </div>

      {addOpen && (
        <AddToolBindingDialog
          executorName={executor.name}
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
  onToggleActive: (row: ExecutorBindingRow, next: boolean) => void;
  onRemove: (row: ExecutorBindingRow) => void;
}

function BindingList({ rows, onToggleActive, onRemove }: BindingListProps) {
  return (
    <div className="divide-y divide-border">
      {rows.map((row) => (
        <BindingRow
          key={`${row.executor_name}:${row.tool_id}`}
          row={row}
          onToggleActive={onToggleActive}
          onRemove={onRemove}
        />
      ))}
    </div>
  );
}

function BindingRow({
  row,
  onToggleActive,
  onRemove,
}: {
  row: ExecutorBindingRow;
  onToggleActive: (row: ExecutorBindingRow, next: boolean) => void;
  onRemove: (row: ExecutorBindingRow) => void;
}) {
  const toolHref = `/administration/mcp-tools/${row.tool_id}`;
  return (
    <div
      className={`px-3 py-2 min-w-0 ${row.is_active ? "" : "opacity-60"} hover:bg-accent/30`}
    >
      <div className="flex items-start gap-2 min-w-0">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-1.5 flex-wrap min-w-0">
            <Link
              href={toolHref}
              target="_blank"
              rel="noopener noreferrer"
              className="text-xs font-medium text-foreground hover:text-primary hover:underline inline-flex items-center gap-1 max-w-full"
              title={row.tool_name ?? row.tool_id}
            >
              <span className="truncate">
                {row.tool_name ?? "(unnamed tool)"}
              </span>
              <ExternalLink className="h-3 w-3 shrink-0 opacity-60" />
            </Link>
            <SourceKindBadge kind={row.tool_source_kind} />
            {row.tool_is_active === false && (
              <Badge
                variant="outline"
                className="text-[9px] h-4 px-1 text-muted-foreground"
                title="The underlying tool_def row is inactive"
              >
                tool inactive
              </Badge>
            )}
          </div>
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

        <div className="flex items-center gap-2 shrink-0">
          <label className="flex items-center gap-1.5 text-[10px] text-muted-foreground cursor-pointer select-none">
            <Switch
              checked={row.is_active}
              onCheckedChange={(v) => onToggleActive(row, v)}
              className="scale-75"
            />
            <span>Active</span>
          </label>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => onRemove(row)}
            className="h-6 w-6 p-0 text-muted-foreground hover:text-destructive"
            title="Remove binding"
          >
            <Trash2 className="h-3.5 w-3.5" />
          </Button>
        </div>
      </div>
    </div>
  );
}
