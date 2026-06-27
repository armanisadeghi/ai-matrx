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
  ExternalLink,
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
import type { Database, Json } from "@/types/database.types";

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
  const icon = mapIcon(tool.icon, tool.category, 20);

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
              <a
                href={`/administration/mcp-servers/${tool.managed_by_server_id}`}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1 text-xs text-amber-600 dark:text-amber-400 hover:underline font-mono"
              >
                {tool.managed_by_server_id}
                <ExternalLink className="h-3 w-3" />
              </a>
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
            <code className="text-xs font-mono text-muted-foreground break-all">
              {tool.id}
            </code>
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

  return (
    <div className="h-[calc(100dvh-var(--header-height))] flex flex-col overflow-hidden">
      {/* Header */}
      <div className="flex-shrink-0 border-b border-border">
        <div className="flex items-center gap-3 px-6 py-3 flex-wrap">
          <Button
            variant="ghost"
            size="sm"
            onClick={() => navigateTo("/administration/mcp-tools")}
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
                navigateTo(`/administration/mcp-tools/${tool.id}/incidents`)
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
                navigateTo(`/administration/mcp-tools/${tool.id}/ui`)
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
                navigateTo(`/administration/mcp-tools/${tool.id}/edit`)
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
  );
}
