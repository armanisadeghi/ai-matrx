"use client";

import React, { useCallback, useState } from "react";
import { Loader2, Save } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { AgentAppPreview } from "./AgentAppPreview";
import type { AgentApp, PublicAgentApp, UpdateAgentAppInput } from "../types";

interface AgentAppEditorProps {
  app: AgentApp;
  onSave: (id: string, input: UpdateAgentAppInput) => Promise<void>;
}

function toPublicSubset(app: AgentApp): PublicAgentApp {
  return {
    id: app.id,
    slug: app.slug,
    name: app.name,
    tagline: app.tagline,
    description: app.description,
    category: app.category,
    tags: app.tags,
    preview_image_url: app.preview_image_url,
    favicon_url: app.favicon_url,
    component_code: app.component_code,
    component_language: app.component_language,
    allowed_imports: app.allowed_imports,
    variable_schema: app.variable_schema,
    layout_config: app.layout_config,
    styling_config: app.styling_config,
    total_executions: app.total_executions,
    success_rate: app.success_rate,
    agent_id: app.agent_id,
    agent_version_id: app.agent_version_id,
    use_latest: app.use_latest,
    app_kind: app.app_kind ?? "single",
    shared_context_slots: app.shared_context_slots ?? [],
    status: app.status,
    visibility: app.visibility,
    is_featured: app.is_featured,
    is_verified: app.is_verified,
    last_execution_at: app.last_execution_at,
    search_tsv: app.search_tsv ?? null,
  } as unknown as PublicAgentApp;
}

export function AgentAppEditor({ app, onSave }: AgentAppEditorProps) {
  const [componentCode, setComponentCode] = useState(app.component_code);
  const [saving, setSaving] = useState(false);

  const previewApp: PublicAgentApp = {
    ...toPublicSubset(app),
    component_code: componentCode,
  };

  const handleSave = useCallback(async () => {
    setSaving(true);
    try {
      await onSave(app.id, { component_code: componentCode });
    } finally {
      setSaving(false);
    }
  }, [app.id, componentCode, onSave]);

  return (
    <div className="h-full flex flex-col gap-3">
      <div className="flex-shrink-0 flex items-center justify-between px-3 py-2 border-b border-border">
        <div className="text-sm font-medium text-foreground">{app.name}</div>
        <Button size="sm" onClick={handleSave} disabled={saving}>
          {saving ? (
            <>
              <Loader2 className="w-4 h-4 animate-spin" />
              Saving…
            </>
          ) : (
            <>
              <Save className="w-4 h-4" />
              Save
            </>
          )}
        </Button>
      </div>

      <Tabs defaultValue="code" className="flex-1 min-h-0 flex flex-col">
        <TabsList>
          <TabsTrigger value="code">Code</TabsTrigger>
          <TabsTrigger value="preview">Preview</TabsTrigger>
        </TabsList>
        <TabsContent value="code" className="flex-1 min-h-0 flex flex-col">
          <Label htmlFor="component-code" className="sr-only">
            Component code
          </Label>
          <Textarea
            id="component-code"
            value={componentCode}
            onChange={(e) => setComponentCode(e.target.value)}
            className="flex-1 min-h-0 font-mono text-[13px]"
            spellCheck={false}
          />
        </TabsContent>
        <TabsContent value="preview" className="flex-1 min-h-0 overflow-hidden">
          <AgentAppPreview app={previewApp} />
        </TabsContent>
      </Tabs>
    </div>
  );
}
