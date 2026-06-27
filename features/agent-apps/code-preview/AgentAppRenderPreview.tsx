"use client";

import { useEffect, useState } from "react";
import { Loader2 } from "lucide-react";
import { createClient } from "@/utils/supabase/client";
import { appDb } from "@/utils/supabase/appDb";
import { AgentAppErrorBoundary } from "../components/AgentAppErrorBoundary";
import { AgentAppPublicRenderer } from "../components/AgentAppPublicRenderer";
import type { PublicAgentApp, AgentApp } from "../types";
import type { RenderPreviewerProps } from "@/features/code/preview/renderPreviewRegistry";

/**
 * Render-preview component for `aga-app:` source tabs. Loads the full
 * `aga_apps` row once on mount, then renders `AgentAppPublicRenderer`
 * with the row's metadata (variable schema, layout/styling config,
 * agent id, allowed imports) and the *live* code from the editor
 * buffer. Subsequent edits in Monaco update `code` in props and the
 * Babel pipeline re-runs.
 */
export function AgentAppRenderPreview({ rowId, code }: RenderPreviewerProps) {
  const [app, setApp] = useState<AgentApp | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    const supabase = createClient();
    void appDb(supabase)
      .from("definition")
      .select("*")
      .eq("id", rowId)
      .single()
      .then(({ data, error: err }) => {
        if (cancelled) return;
        if (err) {
          setError(err.message);
          return;
        }
        setApp(data as unknown as AgentApp);
      });
    return () => {
      cancelled = true;
    };
  }, [rowId]);

  if (error) {
    return (
      <div className="flex h-full w-full items-center justify-center p-6 text-sm text-destructive">
        Failed to load agent app: {error}
      </div>
    );
  }

  if (!app) {
    return (
      <div className="flex h-full w-full items-center justify-center gap-2 text-sm text-muted-foreground">
        <Loader2 className="h-4 w-4 animate-spin" />
        Loading preview…
      </div>
    );
  }

  const previewApp = { ...app, component_code: code } as unknown as PublicAgentApp;

  return (
    <div className="flex h-full w-full flex-col bg-card">
      <AgentAppErrorBoundary appName={app.name}>
        <AgentAppPublicRenderer app={previewApp} slug={app.slug} />
      </AgentAppErrorBoundary>
    </div>
  );
}
