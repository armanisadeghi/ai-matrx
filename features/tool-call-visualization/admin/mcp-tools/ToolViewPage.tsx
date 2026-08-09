"use client";

import React, { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  ArrowLeft,
  Edit,
  Zap,
  Bug,
  Calendar,
  Hash,
  Tag,
  Code,
  FileCode,
  Layers,
  Info,
  Loader2,
  Copy,
  Check,
  Server,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useToast } from "@/components/ui/use-toast";
import { formatText } from "@/utils/text/text-case-converter";
import { mapIcon } from "@/utils/icons/icon-mapper";
import { ToolTestSamplesViewer } from "@/features/tool-call-visualization/admin/ToolTestSamplesViewer";
import { RegistryTab } from "@/features/tool-registry/tools-admin/components/RegistryTab";
import { Network } from "lucide-react";
import { SourceKindBadge } from "./source-kind-badge";
import { MatrxUuidCell } from "@/components/official/matrx-data-table/MatrxUuidCell";
import { mcpServerHref } from "@/features/tool-registry/doors";
import { CopyButtons } from "@/components/agent-copy/CopyButtons";
import { toolBrief, toolSummary } from "./format";
import type { Database, Json } from "@/types/database.types";
import { SurfaceRuntimeProvider } from "@/features/surfaces/runtime/SurfaceRuntimeContext";
import {
  ADMIN_TOOL_REGISTRY_SURFACE_NAME,
  createAdminToolRegistryScope,
} from "@/features/surfaces/manifests/admin-tool-registry.manifest";

// ─── Types ────────────────────────────────────────────────────────────────────

type ToolRow = Database["tool"]["Tables"]["definition"]["Row"];

interface Props {
  tool: ToolRow;
}

function toolAnnotationsToArray(
  annotations: Json | null,
): unknown[] | undefined {
  if (annotations === null) return undefined;
  if (!Array.isArray(annotations)) return undefined;
  return annotations;
}

// ─── JSON Display ─────────────────────────────────────────────────────────────

function JsonDisplay({ data, label }: { data: unknown; label: string }) {
  const [copied, setCopied] = useState(false);
  const json = JSON.stringify(data, null, 2);

  const handleCopy = async () => {
    await navigator.clipboard.writeText(json);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  if (
    !data ||
    (typeof data === "object" && Object.keys(data as object).length === 0)
  ) {
    return (
      <div className="flex items-center justify-center h-32 text-sm text-muted-foreground border border-dashed border-border rounded-lg">
        No {label} defined
      </div>
    );
  }

  return (
    <div className="relative rounded-lg border border-border bg-muted/20 overflow-hidden">
      <div className="flex items-center justify-between px-4 py-2 border-b border-border bg-muted/40">
        <span className="text-xs font-medium font-mono text-muted-foreground">
          {label}
        </span>
        <Button
          variant="ghost"
          size="sm"
          onClick={handleCopy}
          className="h-6 px-2 gap-1 text-[11px]"
        >
          {copied ? (
            <Check className="h-3 w-3 text-success" />
          ) : (
            <Copy className="h-3 w-3" />
          )}
          {copied ? "Copied" : "Copy"}
        </Button>
      </div>
      <pre className="p-4 text-xs font-mono overflow-auto text-foreground/80 leading-relaxed whitespace-pre-wrap">
        {json}
      </pre>
    </div>
  );
}

// ─── Overview Tab ─────────────────────────────────────────────────────────────

function OverviewTab({ tool }: { tool: ToolRow }) {
  const icon = mapIcon(tool.icon, tool.category ?? undefined, 20);

  return (
    <div className="space-y-6 p-1">
      {/* Description */}
      <div className="space-y-1.5">
        <h3 className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
          Description
        </h3>
        <p className="text-sm leading-relaxed">
          {tool.description || (
            <span className="text-muted-foreground italic">No description</span>
          )}
        </p>
      </div>

      {/* Key metadata grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div className="space-y-3">
          <InfoRow
            icon={<Code className="h-3.5 w-3.5" />}
            label="Source Kind"
          >
            <SourceKindBadge kind={tool.source_kind} />
          </InfoRow>
          {tool.managed_by_server_id && (
            <InfoRow
              icon={<Server className="h-3.5 w-3.5" />}
              label="MCP Server"
            >
              {/* Was `/administration/agents/mcp-servers/<id>` — a route leaf
                  that does not exist, so this link 404'd. `mcpServerHref` is
                  the console's deep link, and MatrxUuidCell adds copy. */}
              <MatrxUuidCell
                value={tool.managed_by_server_id}
                label="MCP server"
                href={mcpServerHref(tool.managed_by_server_id)}
              />
            </InfoRow>
          )}
          <InfoRow icon={<Tag className="h-3.5 w-3.5" />} label="Category">
            {tool.category ? (
              <Badge variant="outline" className="text-xs">
                {formatText(tool.category)}
              </Badge>
            ) : (
              <span className="text-muted-foreground text-xs">None</span>
            )}
          </InfoRow>
          <InfoRow icon={<Hash className="h-3.5 w-3.5" />} label="Version">
            <span className="text-xs font-mono">{String(tool.version)}</span>
          </InfoRow>
          <InfoRow icon={<Info className="h-3.5 w-3.5" />} label="Icon">
            <div className="flex items-center gap-2">
              <span className="text-foreground">{icon}</span>
              {tool.icon && (
                <code className="text-xs font-mono text-muted-foreground">
                  {tool.icon}
                </code>
              )}
              {!tool.icon && (
                <span className="text-xs text-muted-foreground">
                  Auto (from category)
                </span>
              )}
            </div>
          </InfoRow>
        </div>
        <div className="space-y-3">
          <InfoRow icon={<FileCode className="h-3.5 w-3.5" />} label="ID">
            {/* The record's own id — copy, no token: a preview of the page you
                are already standing on is noise, not a door. */}
            <MatrxUuidCell value={tool.id} label="Tool" />
          </InfoRow>
          <InfoRow icon={<Calendar className="h-3.5 w-3.5" />} label="Created">
            <span className="text-xs">
              {tool.created_at
                ? new Date(tool.created_at).toLocaleString()
                : "—"}
            </span>
          </InfoRow>
          <InfoRow icon={<Calendar className="h-3.5 w-3.5" />} label="Updated">
            <span className="text-xs">
              {tool.updated_at
                ? new Date(tool.updated_at).toLocaleString()
                : "—"}
            </span>
          </InfoRow>
        </div>
      </div>

      {/* Tags */}
      {tool.tags && tool.tags.length > 0 && (
        <div className="space-y-1.5">
          <h3 className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
            Tags
          </h3>
          <div className="flex flex-wrap gap-1.5">
            {tool.tags.map((tag) => (
              <Badge key={tag} variant="secondary" className="text-xs">
                {tag}
              </Badge>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

function InfoRow({
  icon,
  label,
  children,
}: {
  icon: React.ReactNode;
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex items-start gap-2">
      <span className="text-muted-foreground mt-0.5 flex-shrink-0">{icon}</span>
      <div className="min-w-0 space-y-0.5">
        <span className="text-[11px] text-muted-foreground block">{label}</span>
        <div>{children}</div>
      </div>
    </div>
  );
}

// ─── Annotations Tab ──────────────────────────────────────────────────────────

function AnnotationsTab({ annotations }: { annotations?: unknown[] }) {
  if (!annotations || annotations.length === 0) {
    return (
      <div className="flex items-center justify-center h-32 text-sm text-muted-foreground border border-dashed border-border rounded-lg">
        No annotations defined
      </div>
    );
  }

  return (
    <div className="space-y-2">
      {annotations.map((ann, i) => (
        <div
          key={i}
          className="rounded-lg border border-border bg-muted/20 p-3 text-xs font-mono"
        >
          <pre className="whitespace-pre-wrap overflow-auto">
            {JSON.stringify(ann, null, 2)}
          </pre>
        </div>
      ))}
    </div>
  );
}

// ─── Main Component ───────────────────────────────────────────────────────────

export function ToolViewPage({ tool }: Props) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const { toast } = useToast();
  const [isActive, setIsActive] = useState(tool.is_active ?? false);
  const [isTogglingActive, setIsTogglingActive] = useState(false);

  const navigateTo = (path: string) => {
    startTransition(() => router.push(path));
  };

  const handleToggleActive = async (value: boolean) => {
    setIsTogglingActive(true);
    const prev = isActive;
    setIsActive(value);
    try {
      const res = await fetch(`/api/admin/tools/${tool.id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ is_active: value }),
      });
      if (!res.ok) throw new Error("Failed");
      toast({ title: value ? "Tool activated" : "Tool deactivated" });
    } catch {
      setIsActive(prev);
      toast({ title: "Error updating tool", variant: "destructive" });
    } finally {
      setIsTogglingActive(false);
    }
  };

  const hasOutputSchema =
    tool.output_schema && Object.keys(tool.output_schema).length > 0;
  const annotationList = toolAnnotationsToArray(tool.annotations);
  const hasAnnotations =
    annotationList !== undefined && annotationList.length > 0;

  // Surface emitter — open-tool half of `matrx-admin/tool-registry`. Built at
  // trigger time. SECURITY: definition metadata only. Executor bindings and
  // per-surface tool defaults load inside RegistryTab and never reach here, so
  // they are deliberately not declared on the manifest. No MCP endpoint URLs,
  // auth strategies, OAuth ids, or vault credentials are read or emitted.
  const getSurfaceScope = () => {
    const params =
      tool.parameters &&
      typeof tool.parameters === "object" &&
      !Array.isArray(tool.parameters)
        ? (tool.parameters as Record<string, unknown>)
        : null;
    const paramProps =
      params && typeof params.properties === "object" && params.properties
        ? (params.properties as Record<string, unknown>)
        : params;
    return createAdminToolRegistryScope({
      registry_section: "tool_detail",
      tool_id: tool.id,
      tool_name: tool.name,
      tool_description: tool.description || undefined,
      tool_category: tool.category || undefined,
      tool_group: tool.tool_group || undefined,
      tool_tags: tool.tags ?? undefined,
      tool_summary: {
        id: tool.id,
        name: tool.name,
        description: tool.description ?? null,
        category: tool.category ?? null,
        tool_group: tool.tool_group ?? null,
        tier: tool.tier ?? null,
        source_kind: tool.source_kind ?? null,
        version: tool.version ?? null,
        semver: tool.semver ?? null,
        is_active: isActive,
        admin_only: tool.admin_only ?? null,
        tags: tool.tags ?? null,
      },
      tool_parameters_schema: tool.parameters ?? undefined,
      tool_parameter_names: paramProps ? Object.keys(paramProps) : undefined,
      tool_output_schema: hasOutputSchema
        ? (tool.output_schema ?? undefined)
        : undefined,
      tool_has_output_schema: Boolean(hasOutputSchema),
      tool_annotations: hasAnnotations ? annotationList : undefined,
      tool_source_kind: tool.source_kind || undefined,
      tool_managed_by_server_id: tool.managed_by_server_id || undefined,
      tool_tier: tool.tier || undefined,
      tool_version: tool.version ?? undefined,
      tool_semver: tool.semver || undefined,
      tool_is_active: isActive,
      tool_admin_only: tool.admin_only ?? undefined,
      tool_gating: tool.gating ?? undefined,
      tool_exemptions: {
        dedupe_exempt: tool.dedupe_exempt ?? null,
        validation_exempt: tool.validation_exempt ?? null,
        max_client_wait_seconds: tool.max_client_wait_seconds ?? null,
      },
      tool_visibility: tool.visibility || undefined,
      tool_updated_at: tool.updated_at || undefined,
      selection: window.getSelection()?.toString() || undefined,
    });
  };

  return (
    <SurfaceRuntimeProvider
      surfaceName={ADMIN_TOOL_REGISTRY_SURFACE_NAME}
      getScope={getSurfaceScope}
      isEditable={false}
    >
    <div className="h-[calc(100dvh-var(--header-height))] flex flex-col overflow-hidden">
      {/* Header */}
      <div className="flex-shrink-0 border-b border-border">
        <div className="flex items-center gap-3 px-6 py-3 flex-wrap">
          <Button
            variant="ghost"
            size="sm"
            onClick={() => navigateTo("/administration/agents/mcp-tools")}
            disabled={isPending}
            className="gap-1.5 h-8"
          >
            <ArrowLeft className="h-4 w-4" />
            Tools
          </Button>

          <div className="flex items-center gap-2 min-w-0">
            <span className="font-mono font-semibold truncate">
              {tool.name}
            </span>
            <Badge
              variant={isActive ? "default" : "secondary"}
              className="text-[10px]"
            >
              {isActive ? "Active" : "Inactive"}
            </Badge>
            {tool.category && (
              <Badge variant="outline" className="text-[10px]">
                {formatText(tool.category)}
              </Badge>
            )}
          </div>

          <div className="flex items-center gap-2 ml-auto flex-wrap">
            <CopyButtons
              size="icon"
              label={`Tool ${tool.name}`}
              human={() => toolSummary(tool)}
              json={() => tool}
              agent={() => ({
                kind: "mcp-tool",
                location: `AI Matrx Admin — Tool Registry · Tool detail (/administration/agents/mcp-tools/${tool.id})`,
                description:
                  "The full tool definition record currently open in the admin detail page.",
                data: tool,
                summary: toolSummary(tool),
                attributes: { id: tool.id, name: tool.name, active: isActive },
              })}
              aiVariants={[
                {
                  id: "summary",
                  label: "Summary",
                  hint: "Metadata only — no parameter/output schemas",
                  build: () => ({
                    kind: "mcp-tool",
                    location: `AI Matrx Admin — Tool Registry · Tool detail (/administration/agents/mcp-tools/${tool.id})`,
                    description:
                      "Compact digest of the tool definition open in the admin detail page.",
                    data: toolBrief(tool),
                    summary: toolSummary(tool),
                    attributes: { id: tool.id, name: tool.name },
                  }),
                },
              ]}
            />
            <div className="flex items-center gap-1.5">
              {isTogglingActive && (
                <Loader2 className="h-3.5 w-3.5 animate-spin text-muted-foreground" />
              )}
              <Switch
                checked={isActive}
                onCheckedChange={handleToggleActive}
                disabled={isTogglingActive}
              />
            </div>
            <Button
              variant="outline"
              size="sm"
              onClick={() =>
                navigateTo(`/administration/agents/mcp-tools/${tool.id}/incidents`)
              }
              disabled={isPending}
              className="h-8 gap-1.5 text-xs"
            >
              <Bug className="h-3.5 w-3.5" />
              Incidents
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={() =>
                navigateTo(`/administration/agents/mcp-tools/${tool.id}/ui`)
              }
              disabled={isPending}
              className="h-8 gap-1.5 text-xs"
            >
              <Zap className="h-3.5 w-3.5" />
              UI Component
            </Button>
            <Button
              size="sm"
              onClick={() =>
                navigateTo(`/administration/agents/mcp-tools/${tool.id}/edit`)
              }
              disabled={isPending}
              className="h-8 gap-1.5 text-xs"
            >
              <Edit className="h-3.5 w-3.5" />
              Edit
            </Button>
          </div>
        </div>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-hidden flex flex-col">
        <Tabs
          defaultValue="overview"
          className="flex-1 flex flex-col overflow-hidden"
        >
          <div className="flex-shrink-0 px-6 pt-2 border-b border-border">
            <TabsList className="h-9">
              <TabsTrigger value="overview" className="text-xs gap-1.5">
                <Info className="h-3.5 w-3.5" />
                Overview
              </TabsTrigger>
              <TabsTrigger value="registry" className="text-xs gap-1.5">
                <Network className="h-3.5 w-3.5" />
                Registry
              </TabsTrigger>
              <TabsTrigger value="parameters" className="text-xs gap-1.5">
                <Code className="h-3.5 w-3.5" />
                Parameters
              </TabsTrigger>
              <TabsTrigger value="output-schema" className="text-xs gap-1.5">
                <Layers className="h-3.5 w-3.5" />
                Output Schema
                {!hasOutputSchema && (
                  <span className="text-[10px] text-muted-foreground">
                    (none)
                  </span>
                )}
              </TabsTrigger>
              <TabsTrigger value="annotations" className="text-xs gap-1.5">
                <FileCode className="h-3.5 w-3.5" />
                Annotations
                {hasAnnotations && (
                  <Badge
                    variant="secondary"
                    className="text-[10px] h-4 px-1 ml-0.5"
                  >
                    {annotationList.length}
                  </Badge>
                )}
              </TabsTrigger>
              <TabsTrigger value="samples" className="text-xs gap-1.5">
                <FileCode className="h-3.5 w-3.5" />
                Test Samples
              </TabsTrigger>
            </TabsList>
          </div>

          <div className="flex-1 overflow-y-auto">
            <TabsContent value="overview" className="p-6 m-0 h-full">
              <OverviewTab tool={tool} />
            </TabsContent>

            <TabsContent value="registry" className="p-6 m-0 h-full">
              <RegistryTab
                toolId={tool.id}
                toolName={tool.name}
                initialGating={tool.gating}
              />
            </TabsContent>

            <TabsContent value="parameters" className="p-6 m-0 h-full">
              <JsonDisplay
                data={tool.parameters}
                label="parameters (JSON Schema)"
              />
            </TabsContent>

            <TabsContent value="output-schema" className="p-6 m-0 h-full">
              <JsonDisplay
                data={tool.output_schema}
                label="output_schema (JSON Schema)"
              />
            </TabsContent>

            <TabsContent value="annotations" className="p-6 m-0 h-full">
              <AnnotationsTab annotations={annotationList} />
            </TabsContent>

            <TabsContent
              value="samples"
              className="m-0 h-full overflow-hidden flex flex-col"
            >
              <ToolTestSamplesViewer toolName={tool.name} toolId={tool.id} />
            </TabsContent>
          </div>
        </Tabs>
      </div>
    </div>
    </SurfaceRuntimeProvider>
  );
}