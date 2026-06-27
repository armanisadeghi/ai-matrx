"use client";

import React, { useState, useTransition, useEffect } from "react";
import { useRouter } from "next/navigation";
import { ArrowLeft, Save, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useToast } from "@/components/ui/use-toast";
import IconInputWithValidation from "@/components/official/icons/IconInputWithValidation.dynamic";
import { useIsMobile } from "@/hooks/use-mobile";
import { listServers, type McpServerRow } from "@/features/tool-registry/mcp-admin/services/mcpAdmin.service";
import {
  TOOL_SOURCE_KIND_VALUES,
  sourceKindLabel,
} from "./source-kind-badge";
import type { Database } from "@/types/database.types";

// ─── Types ────────────────────────────────────────────────────────────────────

type ToolRow = Database["tool"]["Tables"]["definition"]["Row"];

interface Props {
  tool: ToolRow;
}

// ─── Main Component ───────────────────────────────────────────────────────────

export function ToolEditPage({ tool }: Props) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const { toast } = useToast();
  const isMobile = useIsMobile();

  const [editedTool, setEditedTool] = useState<ToolRow>({ ...tool });
  const [activeTab, setActiveTab] = useState("basic");
  const [isSaving, setIsSaving] = useState(false);
  const [jsonErrors, setJsonErrors] = useState<Record<string, string>>({});
  const [mcpServers, setMcpServers] = useState<McpServerRow[]>([]);

  useEffect(() => {
    listServers()
      .then(setMcpServers)
      .catch((err) => {
        console.error("Failed to load MCP servers", err);
      });
  }, []);

  const navigateTo = (path: string) => {
    startTransition(() => router.push(path));
  };

  const setField = (field: string, value: unknown) =>
    setEditedTool((prev) => ({ ...prev, [field]: value }));

  const setJsonField = (field: string, value: string) => {
    try {
      setEditedTool((prev) => ({ ...prev, [field]: JSON.parse(value) }));
      setJsonErrors((prev) => {
        const n = { ...prev };
        delete n[field];
        return n;
      });
    } catch (e) {
      setJsonErrors((prev) => ({
        ...prev,
        [field]: e instanceof Error ? e.message : "Invalid JSON",
      }));
    }
  };

  const handleSave = async () => {
    if (!editedTool.name || !editedTool.description) {
      toast({
        title: "Missing required fields",
        description: "Name and Description are required.",
        variant: "destructive",
      });
      return;
    }
    if (editedTool.source_kind === "mcp_discovered" && !editedTool.managed_by_server_id) {
      toast({
        title: "MCP server required",
        description: "Tools with source_kind=mcp_discovered must be linked to an MCP server.",
        variant: "destructive",
      });
      return;
    }
    if (Object.keys(jsonErrors).length > 0) {
      toast({ title: "Fix JSON errors before saving", variant: "destructive" });
      return;
    }
    setIsSaving(true);
    try {
      const { id, created_at, updated_at, ...updateData } = editedTool;
      // If source_kind is no longer mcp_discovered, null out the server FK.
      if (updateData.source_kind !== "mcp_discovered") {
        updateData.managed_by_server_id = null;
      }
      const response = await fetch(`/api/admin/tools/${tool.id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(updateData),
      });
      if (!response.ok) {
        const err = await response.json();
        throw new Error(err.error || "Failed to save");
      }
      toast({ title: "Saved", description: "Tool updated successfully" });
      navigateTo(`/administration/mcp-tools/${tool.id}`);
    } catch (err) {
      toast({
        title: "Save failed",
        description: err instanceof Error ? err.message : "Unknown error",
        variant: "destructive",
      });
    } finally {
      setIsSaving(false);
    }
  };

  // ── Field Sections ─────────────────────────────────────────────────────────

  const basicFields = (
    <div className="space-y-5">
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div className="space-y-1.5">
          <Label>
            Tool Name <span className="text-destructive">*</span>
          </Label>
          <Input
            value={editedTool.name}
            onChange={(e) => setField("name", e.target.value)}
            placeholder="e.g., core_web_search"
            className="font-mono"
            style={{ fontSize: "16px" }}
          />
        </div>
        <div className="space-y-1.5">
          <Label>Category</Label>
          <Input
            value={editedTool.category || ""}
            onChange={(e) => setField("category", e.target.value)}
            placeholder="e.g., core, web, data"
            style={{ fontSize: "16px" }}
          />
        </div>
      </div>

      <div className="space-y-1.5">
        <Label>
          Description <span className="text-destructive">*</span>
        </Label>
        <Textarea
          value={editedTool.description}
          onChange={(e) => setField("description", e.target.value)}
          rows={4}
          style={{ fontSize: "16px" }}
          className="resize-none"
        />
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div className="space-y-1.5">
          <Label>
            Source Kind <span className="text-destructive">*</span>
          </Label>
          <Select
            value={editedTool.source_kind ?? "admin_authored"}
            onValueChange={(v) => setField("source_kind", v)}
          >
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {TOOL_SOURCE_KIND_VALUES.map((k) => (
                <SelectItem key={k} value={k}>
                  {sourceKindLabel(k)}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        {editedTool.source_kind === "mcp_discovered" ? (
          <div className="space-y-1.5">
            <Label>
              MCP Server <span className="text-destructive">*</span>
            </Label>
            <Select
              value={editedTool.managed_by_server_id ?? ""}
              onValueChange={(v) => setField("managed_by_server_id", v || null)}
            >
              <SelectTrigger>
                <SelectValue placeholder="Select an MCP server…" />
              </SelectTrigger>
              <SelectContent>
                {mcpServers.map((s) => (
                  <SelectItem key={s.id} value={s.id}>
                    {s.name} ({s.slug})
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        ) : null}
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div className="space-y-1.5">
          <Label>Icon</Label>
          <IconInputWithValidation
            value={editedTool.icon || ""}
            onChange={(v) => setField("icon", v)}
            placeholder="e.g., Search"
          />
        </div>
        <div className="space-y-1.5">
          <Label>Version</Label>
          <Input
            value={String(editedTool.version)}
            onChange={(e) => {
              const n = Number(e.target.value);
              setEditedTool((prev) => ({
                ...prev,
                version: Number.isFinite(n) ? n : prev.version,
              }));
            }}
            placeholder="1"
            style={{ fontSize: "16px" }}
          />
        </div>
        <div className="flex items-center gap-3 pt-6">
          <Switch
            checked={editedTool.is_active ?? true}
            onCheckedChange={(v) => setField("is_active", v)}
          />
          <Label>Active</Label>
        </div>
      </div>

      <div className="space-y-1.5">
        <Label>Tags (comma-separated)</Label>
        <Input
          value={editedTool.tags?.join(", ") || ""}
          onChange={(e) =>
            setField(
              "tags",
              e.target.value
                .split(",")
                .map((t) => t.trim())
                .filter(Boolean),
            )
          }
          placeholder="tag1, tag2, tag3"
          style={{ fontSize: "16px" }}
        />
      </div>
    </div>
  );

  const parametersField = (
    <div className="space-y-2 flex flex-col flex-1">
      <div className="flex items-center justify-between">
        <Label>Parameters Schema (JSON)</Label>
        {jsonErrors.parameters && (
          <span className="text-xs text-destructive">
            JSON Error: {jsonErrors.parameters}
          </span>
        )}
      </div>
      <Textarea
        value={JSON.stringify(editedTool.parameters, null, 2)}
        onChange={(e) => setJsonField("parameters", e.target.value)}
        className={`font-mono text-sm flex-1 min-h-[60dvh] resize-none ${jsonErrors.parameters ? "border-destructive" : ""}`}
        style={{ fontSize: "13px" }}
      />
    </div>
  );

  const outputSchemaField = (
    <div className="space-y-2 flex flex-col flex-1">
      <div className="flex items-center justify-between">
        <Label>Output Schema (JSON)</Label>
        {jsonErrors.output_schema && (
          <span className="text-xs text-destructive">
            JSON Error: {jsonErrors.output_schema}
          </span>
        )}
      </div>
      <Textarea
        value={JSON.stringify(editedTool.output_schema ?? {}, null, 2)}
        onChange={(e) => setJsonField("output_schema", e.target.value)}
        className={`font-mono text-sm flex-1 min-h-[60dvh] resize-none ${jsonErrors.output_schema ? "border-destructive" : ""}`}
        style={{ fontSize: "13px" }}
      />
    </div>
  );

  const annotationsField = (
    <div className="space-y-2 flex flex-col flex-1">
      <div className="flex items-center justify-between">
        <Label>Annotations (JSON Array)</Label>
        {jsonErrors.annotations && (
          <span className="text-xs text-destructive">
            JSON Error: {jsonErrors.annotations}
          </span>
        )}
      </div>
      <Textarea
        value={JSON.stringify(editedTool.annotations ?? [], null, 2)}
        onChange={(e) => setJsonField("annotations", e.target.value)}
        className={`font-mono text-sm flex-1 min-h-[40dvh] resize-none ${jsonErrors.annotations ? "border-destructive" : ""}`}
        style={{ fontSize: "13px" }}
      />

      <div className="grid grid-cols-2 gap-4 text-xs text-muted-foreground pt-4 border-t border-border mt-2">
        <div>
          <span className="block font-medium text-foreground mb-1">
            Tool ID
          </span>
          <span className="font-mono break-all">{tool.id}</span>
        </div>
        <div>
          <span className="block font-medium text-foreground mb-1">
            Created
          </span>
          {tool.created_at ? new Date(tool.created_at).toLocaleString() : "N/A"}
        </div>
      </div>
    </div>
  );

  const saveBar = (
    <div className="flex-shrink-0 flex justify-end gap-2 px-6 py-4 border-t border-border bg-background">
      <Button
        variant="outline"
        onClick={() => navigateTo(`/administration/mcp-tools/${tool.id}`)}
        disabled={isSaving || isPending}
      >
        Cancel
      </Button>
      <Button
        onClick={handleSave}
        disabled={isSaving || isPending}
        className="gap-1.5"
      >
        {isSaving ? (
          <Loader2 className="h-4 w-4 animate-spin" />
        ) : (
          <Save className="h-4 w-4" />
        )}
        {isSaving ? "Saving…" : "Save Tool"}
      </Button>
    </div>
  );

  return (
    <div className="h-[calc(100dvh-var(--header-height))] flex flex-col overflow-hidden">
      {/* Header */}
      <div className="flex-shrink-0 flex items-center gap-3 px-6 py-3 border-b border-border">
        <Button
          variant="ghost"
          size="sm"
          onClick={() => navigateTo(`/administration/mcp-tools/${tool.id}`)}
          disabled={isPending}
          className="gap-1.5 h-8"
        >
          <ArrowLeft className="h-4 w-4" />
          {tool.name}
        </Button>
        <span className="text-sm font-medium text-muted-foreground">/</span>
        <span className="text-sm font-medium">Edit</span>
      </div>

      {/* Body */}
      <div className="flex-1 overflow-hidden flex flex-col">
        {isMobile ? (
          <>
            <div className="flex-1 overflow-y-auto px-6 py-4 space-y-8 pb-safe">
              <section className="space-y-4">
                <h2 className="text-sm font-semibold border-b border-border pb-2">
                  Basic Info
                </h2>
                {basicFields}
              </section>
              <section className="space-y-4">
                <h2 className="text-sm font-semibold border-b border-border pb-2">
                  Parameters
                </h2>
                {parametersField}
              </section>
              <section className="space-y-4">
                <h2 className="text-sm font-semibold border-b border-border pb-2">
                  Output Schema
                </h2>
                {outputSchemaField}
              </section>
              <section className="space-y-4">
                <h2 className="text-sm font-semibold border-b border-border pb-2">
                  Annotations &amp; Advanced
                </h2>
                {annotationsField}
              </section>
            </div>
            {saveBar}
          </>
        ) : (
          <>
            <Tabs
              value={activeTab}
              onValueChange={setActiveTab}
              className="flex-1 flex flex-col overflow-hidden"
            >
              <div className="flex-shrink-0 px-6 pt-2 border-b border-border">
                <TabsList>
                  <TabsTrigger value="basic">Basic Info</TabsTrigger>
                  <TabsTrigger value="parameters">
                    Parameters
                    {jsonErrors.parameters && (
                      <span className="ml-1 text-destructive">!</span>
                    )}
                  </TabsTrigger>
                  <TabsTrigger value="output">
                    Output Schema
                    {jsonErrors.output_schema && (
                      <span className="ml-1 text-destructive">!</span>
                    )}
                  </TabsTrigger>
                  <TabsTrigger value="advanced">
                    Advanced
                    {jsonErrors.annotations && (
                      <span className="ml-1 text-destructive">!</span>
                    )}
                  </TabsTrigger>
                </TabsList>
              </div>

              <div className="flex-1 overflow-y-auto">
                <TabsContent value="basic" className="p-6 m-0">
                  {basicFields}
                </TabsContent>
                <TabsContent
                  value="parameters"
                  className="p-6 m-0 flex flex-col h-full"
                >
                  {parametersField}
                </TabsContent>
                <TabsContent
                  value="output"
                  className="p-6 m-0 flex flex-col h-full"
                >
                  {outputSchemaField}
                </TabsContent>
                <TabsContent
                  value="advanced"
                  className="p-6 m-0 flex flex-col h-full"
                >
                  {annotationsField}
                </TabsContent>
              </div>
            </Tabs>
            {saveBar}
          </>
        )}
      </div>
    </div>
  );
}
