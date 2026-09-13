"use client";

import {
  MatrxDataTable,
  type MatrxColumnDef,
} from "@ai-matrx/design-system/data-table";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { AlertTriangle, OctagonX, Square, Trash2 } from "lucide-react";
import {
  sandboxDisplayName,
  sandboxInstanceSummary,
  formatSandboxTimestamp,
} from "@/lib/sandbox/format";
import { useTimeRemaining } from "@/hooks/sandbox/use-time-remaining";
import {
  ACTIVE_EFFECTIVE_STATUSES,
  getEffectiveStatus,
  STATUS_BADGE_VARIANT,
  STATUS_LABELS,
} from "@/lib/sandbox/status";
import type { SandboxInstance } from "@/types/sandbox";

export interface SandboxInstancesTableProps {
  instances: SandboxInstance[];
  loading: boolean;
  isFetching?: boolean;
  error: string | null;
  onRetry: () => void;
  onOpen: (row: SandboxInstance) => void;
  onStop: (row: SandboxInstance) => void;
  onDelete: (row: SandboxInstance) => void;
  stoppingIds: Set<string>;
  showingHistory?: boolean;
  selection?: {
    selectedIds: Set<string>;
    onSelectionChange: (selectedIds: Set<string>) => void;
  };
}

function resourceSummary(instance: SandboxInstance): string {
  const resources = instance.config?.resources;
  if (!resources) return "Not recorded";

  const values = [
    resources.cpu === undefined ? null : `${resources.cpu} CPU`,
    resources.memory_mb === undefined
      ? null
      : `${resources.memory_mb.toLocaleString()} MB memory`,
    resources.disk_mb === undefined
      ? null
      : `${resources.disk_mb.toLocaleString()} MB disk`,
  ].filter((value): value is string => value !== null);

  return values.length > 0 ? values.join(" · ") : "Not recorded";
}

function storageSummary(instance: SandboxInstance): string {
  const values = [
    instance.persistence_volume
      ? `Volume: ${instance.persistence_volume}`
      : null,
    instance.hot_path ? `Hot: ${instance.hot_path}` : null,
    instance.cold_path ? `Cold: ${instance.cold_path}` : null,
  ].filter((value): value is string => value !== null);
  return values.length > 0 ? values.join("\n") : "Not recorded";
}

function VersionLabel({ version }: { version: string | null | undefined }) {
  if (!version) return null;
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <span
          tabIndex={0}
          className="font-mono"
          aria-label={`Image version ${version}`}
        >
          {version.length > 16 ? `${version.slice(0, 8)}…` : version}
        </span>
      </TooltipTrigger>
      <TooltipContent className="max-w-sm break-all">{version}</TooltipContent>
    </Tooltip>
  );
}

function StorageCell({ instance }: { instance: SandboxInstance }) {
  return (
    <div className="whitespace-normal text-xs space-y-1">
      {instance.hot_path && (
        <div className="break-all font-mono">{instance.hot_path}</div>
      )}
      {instance.cold_path && (
        <div className="break-all font-mono text-muted-foreground">
          {instance.cold_path}
        </div>
      )}
      {instance.persistence_volume && (
        <Tooltip>
          <TooltipTrigger asChild>
            <span
              tabIndex={0}
              className="text-muted-foreground underline decoration-dotted underline-offset-2"
              aria-label={`Storage volume ${instance.persistence_volume}`}
            >
              Persistent volume
            </span>
          </TooltipTrigger>
          <TooltipContent className="max-w-sm break-all">
            {instance.persistence_volume}
          </TooltipContent>
        </Tooltip>
      )}
      {!instance.hot_path &&
        !instance.cold_path &&
        !instance.persistence_volume &&
        "Not recorded"}
    </div>
  );
}

function ExpiryCell({ instance }: { instance: SandboxInstance }) {
  const remaining = useTimeRemaining(instance.expires_at, "minute");
  const isActive = ACTIVE_EFFECTIVE_STATUSES.includes(
    getEffectiveStatus(instance),
  );

  return (
    <div className="min-w-0 sm:min-w-0 whitespace-normal text-xs">
      <div>{formatSandboxTimestamp(instance.expires_at)}</div>
      {isActive ? (
        <div className="text-muted-foreground">{remaining.text}</div>
      ) : null}
    </div>
  );
}

function SandboxRowActions({
  row,
  stopping,
  onStop,
  onDelete,
}: {
  row: SandboxInstance;
  stopping: boolean;
  onStop: (row: SandboxInstance) => void;
  onDelete: (row: SandboxInstance) => void;
}) {
  const canStop = ACTIVE_EFFECTIVE_STATUSES.includes(getEffectiveStatus(row));

  return (
    <div className="inline-flex items-center gap-1">
      {canStop ? (
        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              type="button"
              variant="ghost"
              size="icon"
              className="h-11 w-11 sm:h-7 sm:w-7"
              disabled={stopping}
              aria-label={stopping ? "Stopping sandbox" : "Stop sandbox"}
              onClick={() => onStop(row)}
            >
              <Square className="h-3.5 w-3.5" />
            </Button>
          </TooltipTrigger>
          <TooltipContent>
            {stopping ? "Stopping sandbox" : "Stop sandbox"}
          </TooltipContent>
        </Tooltip>
      ) : null}
      <Tooltip>
        <TooltipTrigger asChild>
          <Button
            type="button"
            variant="ghost"
            size="icon"
            className="h-11 w-11 text-destructive hover:bg-destructive/10 hover:text-destructive sm:h-7 sm:w-7"
            disabled={stopping}
            aria-label="Delete sandbox"
            onClick={() => onDelete(row)}
          >
            <Trash2 className="h-3.5 w-3.5" />
          </Button>
        </TooltipTrigger>
        <TooltipContent>
          {stopping ? "Wait for stop to finish" : "Delete sandbox"}
        </TooltipContent>
      </Tooltip>
    </div>
  );
}

export function SandboxInstancesTable({
  instances,
  loading,
  isFetching = false,
  error,
  onRetry,
  onOpen,
  onStop,
  onDelete,
  stoppingIds,
  showingHistory = false,
  selection,
}: SandboxInstancesTableProps) {
  const columns: MatrxColumnDef<SandboxInstance>[] = [
    {
      id: "identity",
      header: "Sandbox",
      label: "Sandbox",
      width: 180,
      accessorFn: (row) => `${sandboxDisplayName(row)} ${row.sandbox_id}`,
      cell: (row) => (
        <div className="min-w-0 whitespace-normal">
          <div className="font-medium">{sandboxDisplayName(row)}</div>
          <button
            type="button"
            onClick={(event) => {
              event.stopPropagation();
              onOpen(row);
            }}
            className="mt-0.5 block w-full break-all text-left font-mono text-xs text-muted-foreground hover:text-foreground"
            aria-label={`Open sandbox ${row.sandbox_id}`}
          >
            {row.sandbox_id}
          </button>
        </div>
      ),
    },
    {
      id: "status",
      header: "Status",
      label: "Status",
      width: 84,
      compact: true,
      accessorFn: getEffectiveStatus,
      filter: "select",
      filterOptions: Object.entries(STATUS_LABELS).map(([value, label]) => ({
        value,
        label,
      })),
      cell: (row) => {
        const status = getEffectiveStatus(row);
        return (
          <div className="min-w-0 space-y-1">
            <Badge variant={STATUS_BADGE_VARIANT[status]}>
              {STATUS_LABELS[status]}
            </Badge>
            {row.stop_reason ? (
              <div className="whitespace-normal text-xs text-muted-foreground">
                {row.stop_reason.replaceAll("_", " ")}
              </div>
            ) : null}
          </div>
        );
      },
    },
    {
      id: "template",
      header: "Template / tier",
      label: "Template / tier",
      width: 142,
      accessorFn: (row) =>
        `${row.template ?? row.config?.template ?? ""} ${row.template_version ?? row.config?.template_version ?? ""} ${row.tier ?? row.config?.tier ?? ""}`,
      cell: (row) => {
        const template = row.template ?? row.config?.template ?? "Not recorded";
        const version = row.template_version ?? row.config?.template_version;
        const tier = row.tier ?? row.config?.tier;
        return (
          <div className="min-w-0 whitespace-normal text-sm">
            <div>{template}</div>
            <div className="text-xs text-muted-foreground">
              <span className="block">{tier ?? "Tier not recorded"}</span>
              <VersionLabel version={version} />
            </div>
          </div>
        );
      },
    },
    {
      id: "resources",
      header: "Resources",
      label: "Resources",
      width: 120,
      accessorFn: resourceSummary,
      cell: (row) => (
        <span className="block min-w-0 whitespace-normal text-xs text-muted-foreground">
          {resourceSummary(row)}
        </span>
      ),
    },
    {
      accessorKey: "last_heartbeat_at",
      header: "Activity",
      label: "Activity",
      width: 164,
      cell: (row) => (
        <div className="whitespace-normal text-xs space-y-1">
          <div>
            <span className="text-muted-foreground">Heartbeat </span>
            {formatSandboxTimestamp(row.last_heartbeat_at)}
          </div>
          <div>
            <span className="text-muted-foreground">Created </span>
            {formatSandboxTimestamp(row.created_at)}
          </div>
        </div>
      ),
    },
    {
      accessorKey: "expires_at",
      header: "Expires",
      label: "Expires",
      width: 134,
      cell: (row) => <ExpiryCell instance={row} />,
    },
    ...(showingHistory
      ? [
          {
            accessorKey: "stopped_at" as const,
            header: "Stopped",
            label: "Stopped",
            cell: (row: SandboxInstance) => (
              <span className="block min-w-0 whitespace-normal text-xs">
                {formatSandboxTimestamp(row.stopped_at)}
              </span>
            ),
          },
        ]
      : []),
    {
      accessorKey: "created_at",
      header: "Created",
      label: "Created",
      hidden: true,
      cell: (row) => (
        <span className="block min-w-0 whitespace-normal text-xs">
          {formatSandboxTimestamp(row.created_at)}
        </span>
      ),
    },
    {
      id: "storage",
      header: "Storage",
      label: "Storage",
      width: 165,
      accessorFn: storageSummary,
      cell: (row) => <StorageCell instance={row} />,
    },
  ];

  return (
    <div className="flex h-full min-h-0 flex-col gap-2">
      {error ? (
        <Alert variant="destructive" className="shrink-0">
          <AlertTriangle className="h-4 w-4" />
          <AlertTitle>Sandbox operation failed</AlertTitle>
          <AlertDescription className="flex flex-wrap items-center gap-2">
            <span>{error}</span>
            <Button type="button" variant="outline" size="sm" onClick={onRetry}>
              Retry
            </Button>
          </AlertDescription>
        </Alert>
      ) : null}
      <MatrxDataTable<SandboxInstance>
        data={instances}
        columns={columns}
        getRowId={(row) => row.id}
        isLoading={loading}
        isFetching={isFetching}
        reorderableColumns
        defaultSort={{ id: "created_at", direction: "desc" }}
        pageSize={25}
        pageSizeOptions={[10, 25, 50, 100]}
        detail={{ enabled: false }}
        onRowOpen={onOpen}
        searchText={(row) =>
          [
            sandboxDisplayName(row),
            row.sandbox_id,
            row.id,
            getEffectiveStatus(row),
            row.stop_reason,
            row.template ?? row.config?.template,
            row.template_version ?? row.config?.template_version,
            row.tier ?? row.config?.tier,
            resourceSummary(row),
            formatSandboxTimestamp(row.last_heartbeat_at),
            formatSandboxTimestamp(row.expires_at),
            formatSandboxTimestamp(row.stopped_at),
            formatSandboxTimestamp(row.created_at),
            storageSummary(row),
          ]
            .filter(Boolean)
            .join(" ")
        }
        toolbar={{
          search: true,
          searchPlaceholder: "Search sandboxes…",
        }}
        copy={{
          label: "Sandbox instance",
          listLabel: "Sandbox instances",
          location: "Code workspace",
          rowKind: "sandbox_instance",
          listKind: "sandbox_instances",
          humanRow: sandboxInstanceSummary,
          agentRow: (row) => row,
        }}
        selection={
          selection
            ? {
                selectedIds: [...selection.selectedIds],
                onSelectedIdsChange: (selectedIds) =>
                  selection.onSelectionChange(new Set(selectedIds)),
                noun: "sandbox",
              }
            : undefined
        }
        rowActions={(row) => (
          <SandboxRowActions
            row={row}
            stopping={stoppingIds.has(row.id)}
            onStop={onStop}
            onDelete={onDelete}
          />
        )}
        mobileCards={(row, _index, controls) => {
          const status = getEffectiveStatus(row);
          const template =
            row.template ?? row.config?.template ?? "Not recorded";
          const version = row.template_version ?? row.config?.template_version;
          const tier = row.tier ?? row.config?.tier ?? "Not recorded";
          return (
            <article className="space-y-2 rounded-md border border-border p-3">
              <button
                type="button"
                onClick={() => onOpen(row)}
                className="flex min-h-11 w-full items-start justify-between gap-3 text-left"
              >
                <span className="min-w-0">
                  <span className="block text-sm font-medium">
                    {sandboxDisplayName(row)}
                  </span>
                  <span className="mt-0.5 block break-all font-mono text-xs text-muted-foreground">
                    {row.sandbox_id}
                  </span>
                </span>
                <Badge
                  variant={STATUS_BADGE_VARIANT[status]}
                  className="shrink-0"
                >
                  {STATUS_LABELS[status]}
                </Badge>
              </button>
              {row.stop_reason ? (
                <p className="text-xs text-muted-foreground">
                  {row.stop_reason.replaceAll("_", " ")}
                </p>
              ) : null}
              <dl className="grid grid-cols-2 gap-x-3 gap-y-2 text-xs">
                <div>
                  <dt className="text-muted-foreground">Template / tier</dt>
                  <dd className="whitespace-normal">
                    <div>
                      {template} · {tier}
                    </div>
                    <VersionLabel version={version} />
                  </dd>
                </div>
                <div>
                  <dt className="text-muted-foreground">Resources</dt>
                  <dd className="whitespace-normal">{resourceSummary(row)}</dd>
                </div>
                <div>
                  <dt className="text-muted-foreground">Last heartbeat</dt>
                  <dd>{formatSandboxTimestamp(row.last_heartbeat_at)}</dd>
                </div>
                <div>
                  <dt className="text-muted-foreground">Expires</dt>
                  <dd>
                    <ExpiryCell instance={row} />
                  </dd>
                </div>
                {showingHistory && (
                  <div>
                    <dt className="text-muted-foreground">Stopped</dt>
                    <dd>{formatSandboxTimestamp(row.stopped_at)}</dd>
                  </div>
                )}
                <div>
                  <dt className="text-muted-foreground">Created</dt>
                  <dd>{formatSandboxTimestamp(row.created_at)}</dd>
                </div>
                <div className="col-span-2">
                  <dt className="text-muted-foreground">Storage</dt>
                  <dd>
                    <StorageCell instance={row} />
                  </dd>
                </div>
              </dl>
              <div className="flex items-center justify-between gap-2">
                {controls.selectable ? (
                  <label className="flex min-h-11 items-center gap-2 text-xs text-muted-foreground">
                    <Checkbox
                      checked={controls.selected}
                      onCheckedChange={(checked) =>
                        controls.onSelectedChange(checked === true)
                      }
                    />
                    Select sandbox
                  </label>
                ) : (
                  <span />
                )}
                {controls.actions}
              </div>
            </article>
          );
        }}
        emptyState={{
          title: showingHistory ? "No ended sandboxes" : "No sandbox instances",
          description: showingHistory
            ? "Stopped, expired, and failed sandboxes appear here."
            : "Create a sandbox to give a workspace an isolated runtime.",
          icon: <OctagonX className="h-8 w-8" />,
        }}
      />
    </div>
  );
}
