"use client";

import React, { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { ArrowLeft, Save, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useToast } from "@/components/ui/use-toast";
import IconInputWithValidation from "@/components/official/icons/IconInputWithValidation.dynamic";
import { useIsMobile } from "@/hooks/use-mobile";

interface NewTool {
  name: string;
  description: string;
  parameters: Record<string, unknown>;
  output_schema: Record<string, unknown>;
  annotations: unknown[];
  function_path: string;
  category: string;
  tags: string[];
  icon: string;
  is_active: boolean;
  version: string;
}

const DEFAULT_TOOL: NewTool = {
  name: "",
  description: "",
  parameters: { type: "object", properties: {}, required: [] },
  output_schema: { type: "object", properties: {} },
  annotations: [],
  function_path: "",
  category: "",
  tags: [],
  icon: "",
  is_active: true,
  version: "1.0.0",
};

export function ToolCreatePage() {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const { toast } = useToast();
  const isMobile = useIsMobile();

  const [tool, setTool] = useState<NewTool>(DEFAULT_TOOL);
  const [activeTab, setActiveTab] = useState("basic");
  const [isSaving, setIsSaving] = useState(false);
  const [jsonErrors, setJsonErrors] = useState<Record<string, string>>({});

  const navigateTo = (path: string) => startTransition(() => router.push(path));

  const setField = (field: string, value: unknown) =>
    setTool((prev) => ({ ...prev, [field]: value }));

  const setJsonField = (field: string, value: string) => {
    try {
      setTool((prev) => ({ ...prev, [field]: JSON.parse(value) }));
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
    if (!tool.name || !tool.description) {
      toast({
        title: "Missing required fields",
        description: "Name and Description are required.",
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
      const response = await fetch("/api/admin/tools", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...tool,
          category: tool.category || null,
          icon: tool.icon || null,
        }),
      });
      if (!response.ok) {
        const err = await response.json();
        throw new Error(err.error || "Failed to create tool");
      }
      const data = await response.json();
      toast({ title: "Created", description: "Tool created successfully" });
      navigateTo(`/administration/mcp-tools/${data.tool.id}`);
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

  const basicFields = (
    <div className="space-y-5">
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div className="space-y-1.5">
          <Label>
            Tool Name <span className="text-destructive">*</span>
          </Label>
          <Input
            value={tool.name}
            onChange={(e) => setField("name", e.target.value)}
            placeholder="e.g., core_web_search"
            className="font-mono"
            style={{ fontSize: "16px" }}
          />
        </div>
        <div className="space-y-1.5">
          <Label>Category</Label>
          <Input
            value={tool.category}
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
          value={tool.description}
          onChange={(e) => setField("description", e.target.value)}
          rows={4}
          style={{ fontSize: "16px" }}
          className="resize-none"
        />
      </div>
      <div className="space-y-1.5">
        <Label>Function Path</Label>
        <Input
          value={tool.function_path}
          onChange={(e) => setField("function_path", e.target.value)}
          className="font-mono"
          style={{ fontSize: "16px" }}
        />
      </div>
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div className="space-y-1.5">
          <Label>Icon</Label>
          <IconInputWithValidation
            value={tool.icon}
            onChange={(v) => setField("icon", v)}
            placeholder="e.g., Search"
          />
        </div>
        <div className="space-y-1.5">
          <Label>Version</Label>
          <Input
            value={tool.version}
            onChange={(e) => setField("version", e.target.value)}
            placeholder="1.0.0"
            style={{ fontSize: "16px" }}
          />
        </div>
        <div className="flex items-center gap-3 pt-6">
          <Switch
            checked={tool.is_active}
            onCheckedChange={(v) => setField("is_active", v)}
          />
          <Label>Active</Label>
        </div>
      </div>
      <div className="space-y-1.5">
        <Label>Tags (comma-separated)</Label>
        <Input
          value={tool.tags.join(", ")}
          onChange={(e) =>
            setField(
              "tags",
              e.target.value
                .split(",")
                .map((t) => t.trim())
                .filter(Boolean),
            )
          }
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
        value={JSON.stringify(tool.parameters, null, 2)}
        onChange={(e) => setJsonField("parameters", e.target.value)}
        className={`font-mono text-sm flex-1 min-h-[60vh] resize-none ${jsonErrors.parameters ? "border-destructive" : ""}`}
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
        value={JSON.stringify(tool.output_schema, null, 2)}
        onChange={(e) => setJsonField("output_schema", e.target.value)}
        className={`font-mono text-sm flex-1 min-h-[60vh] resize-none ${jsonErrors.output_schema ? "border-destructive" : ""}`}
        style={{ fontSize: "13px" }}
      />
    </div>
  );

  const saveBar = (
    <div className="flex-shrink-0 flex justify-end gap-2 px-6 py-4 border-t border-border bg-background">
      <Button
        variant="outline"
        onClick={() => navigateTo("/administration/mcp-tools")}
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
        {isSaving ? "Creating…" : "Create Tool"}
      </Button>
    </div>
  );

  return (
    <div className="h-[calc(100dvh-var(--header-height))] flex flex-col overflow-hidden">
      <div className="flex-shrink-0 flex items-center gap-3 px-6 py-3 border-b border-border">
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
        <span className="text-sm font-medium text-muted-foreground">/</span>
        <span className="text-sm font-medium">New Tool</span>
      </div>

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
                      <span className="ml-1 text-destructive">⚠</span>
                    )}
                  </TabsTrigger>
                  <TabsTrigger value="output">
                    Output Schema
                    {jsonErrors.output_schema && (
                      <span className="ml-1 text-destructive">⚠</span>
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
              </div>
            </Tabs>
            {saveBar}
          </>
        )}
      </div>
    </div>
  );
}
