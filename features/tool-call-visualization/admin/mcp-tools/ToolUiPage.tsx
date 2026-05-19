"use client";

import React, { useTransition, useState, useCallback } from "react";
import { useRouter } from "next/navigation";
import { ArrowLeft, Zap, Paintbrush, Eye } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useToast } from "@/components/ui/use-toast";
import { ToolUiComponentGenerator } from "@/features/tool-call-visualization/admin/ToolUiComponentGenerator";
import { ToolUiComponentEditor } from "@/features/tool-call-visualization/admin/ToolUiComponentEditor";
import { ToolComponentPreview } from "@/features/tool-call-visualization/admin/mcp-tools/ToolComponentPreview";
import { formatText } from "@/utils/text/text-case-converter";
import { invalidateCachedRenderer } from "@/features/tool-call-visualization/dynamic/cache";
import type { Database } from "@/types/database.types";

// ─── Types ────────────────────────────────────────────────────────────────────

type ToolRow = Database["public"]["Tables"]["tl_def"]["Row"];

interface GeneratedComponent {
  tool_name: string;
  display_name: string;
  results_label: string;
  inline_code: string;
  overlay_code: string;
  utility_code: string;
  header_extras_code: string;
  header_subtitle_code: string;
  keep_expanded_on_stream: boolean;
  allowed_imports: string[];
  version: string;
}

interface Props {
  tool: ToolRow;
}

// ─── Main Component ───────────────────────────────────────────────────────────

export function ToolUiPage({ tool }: Props) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const { toast } = useToast();
  const [previewKey, setPreviewKey] = useState(0);

  const navigateTo = (path: string) => {
    startTransition(() => router.push(path));
  };

  /** Bust the in-memory renderer cache and force the preview to remount. */
  const invalidateAndRefreshPreview = useCallback(() => {
    invalidateCachedRenderer(tool.name);
    setPreviewKey((k) => k + 1);
  }, [tool.name]);

  const handleSaveRevision = async (component: GeneratedComponent) => {
    // Check if a component already exists to decide PUT vs POST
    let existingId: string | null = null;
    try {
      const res = await fetch(
        `/api/admin/tool-ui-components?tool_name=${encodeURIComponent(tool.name)}`,
      );
      if (res.ok) {
        const data = (await res.json()) as {
          components?: Array<{ id: string }>;
        };
        if (data.components && data.components.length > 0) {
          existingId = data.components[0].id;
        }
      }
    } catch {
      /* network error on check — attempt POST anyway */
    }

    const url = existingId
      ? `/api/admin/tool-ui-components/${existingId}`
      : "/api/admin/tool-ui-components";
    const method = existingId ? "PUT" : "POST";

    const response = await fetch(url, {
      method,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        ...component,
        tool_id: tool.id,
        language: "tsx",
        is_active: true,
        notes: `${existingId ? "Updated" : "Created"} via AI revision`,
        overlay_code: component.overlay_code || null,
        utility_code: component.utility_code || null,
        header_extras_code: component.header_extras_code || null,
        header_subtitle_code: component.header_subtitle_code || null,
      }),
    });

    if (!response.ok) {
      let errMsg = `HTTP ${response.status}`;
      let errDetail = "";
      try {
        const errData = (await response.json()) as {
          error?: string;
          details?: string;
          message?: string;
        };
        errMsg = errData.error || errMsg;
        errDetail = errData.details || errData.message || "";
      } catch {
        /* body not JSON */
      }
      throw Object.assign(new Error(errMsg), { detail: errDetail });
    }

    // Bust the renderer cache so the preview shows the fresh component
    invalidateAndRefreshPreview();
  };

  return (
    <div className="h-[calc(100dvh-var(--header-height))] flex flex-col overflow-hidden">
      {/* Header */}
      <div className="flex-shrink-0 flex items-center gap-3 px-6 py-3 border-b border-border flex-wrap">
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
        <span className="text-sm font-medium">UI Component</span>
        {tool.category && (
          <Badge variant="outline" className="text-[10px]">
            {formatText(tool.category)}
          </Badge>
        )}
      </div>

      {/* Three-tab body */}
      <div className="flex-1 overflow-hidden flex flex-col">
        <Tabs
          defaultValue="preview"
          className="flex-1 flex flex-col overflow-hidden"
        >
          <div className="flex-shrink-0 px-6 pt-2 border-b border-border">
            <TabsList className="h-9">
              <TabsTrigger value="preview" className="text-xs gap-1.5">
                <Eye className="h-3.5 w-3.5" />
                Preview &amp; Test
              </TabsTrigger>
              <TabsTrigger value="generate" className="text-xs gap-1.5">
                <Zap className="h-3.5 w-3.5" />
                Generate
              </TabsTrigger>
              <TabsTrigger value="editor" className="text-xs gap-1.5">
                <Paintbrush className="h-3.5 w-3.5" />
                Edit Code
              </TabsTrigger>
            </TabsList>
          </div>

          <div className="flex-1 overflow-y-auto">
            {/* Preview + AI revision tab */}
            <TabsContent value="preview" className="p-6 m-0">
              <ToolComponentPreview
                key={previewKey}
                tool={tool}
                onSaveRevision={handleSaveRevision}
              />
            </TabsContent>

            {/* Generator wizard tab */}
            <TabsContent value="generate" className="p-6 m-0">
              <ToolUiComponentGenerator
                tools={[tool]}
                preselectedToolName={tool.name}
                onComplete={() => {
                  invalidateAndRefreshPreview();
                  toast({
                    title: "Component generated",
                    description: "Switch to the Preview tab to test it.",
                  });
                }}
              />
            </TabsContent>

            {/* Code editor tab */}
            <TabsContent value="editor" className="m-0">
              <ToolUiComponentEditor
                toolName={tool.name}
                toolId={tool.id}
                onSaved={() => {
                  invalidateAndRefreshPreview();
                  toast({
                    title: "Saved",
                    description:
                      "Switch to Preview to test the updated component.",
                  });
                }}
              />
            </TabsContent>
          </div>
        </Tabs>
      </div>
    </div>
  );
}
