"use client";

// features/applets/code-preview/AppletSourcePreview.tsx — THE CODE WORKSPACE'S PREVIEW OF AN APPLET.
//
// Mounts the Applet through the ONE host in preview mode (reads live, writes held, page changes stay in
// the preview — BUILD-LOOP §4). The host reads the saved record and the open file's unsaved buffer is
// laid over it (`files`), so the preview follows the keystrokes; Reload re-reads the record.

import { useEffect, useState } from "react";
import { AppWindow, RotateCw } from "lucide-react";
import { Button, EmptyState, RegionSkeleton } from "@ai-matrx/design-system/controls";
import { createClient } from "@/utils/supabase/client";
import { AppletHostMount } from "@/features/applets-host/AppletHostMount";
import type { RenderPreviewerProps } from "@/features/code/preview/renderPreviewRegistry";

export function AppletSourcePreview({ rowId, fieldId, code }: RenderPreviewerProps) {
  const [slug, setSlug] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [held, setHeld] = useState(0);
  const [generation, setGeneration] = useState(0);

  useEffect(() => {
    let cancelled = false;
    void createClient()
      .schema("app")
      .from("definition")
      .select("slug")
      .eq("id", rowId)
      .is("deleted_at", null)
      .maybeSingle()
      .then(({ data, error: err }) => {
        if (cancelled) return;
        if (err) setError(err.message);
        else if (!data) setError("This app no longer exists.");
        else setSlug(data.slug);
      });
    return () => {
      cancelled = true;
    };
  }, [rowId]);

  if (error) return <EmptyState icon={<AppWindow />} title="Preview unavailable" line={error} />;
  if (!slug) return <RegionSkeleton shape="cards" count={3} aria-label="Opening preview" />;
  return (
    <div className="flex h-full w-full flex-col bg-card">
      <div className="flex items-center justify-between gap-2 border-b border-border px-2 py-1 text-xs text-muted-foreground">
        <span>{held > 0 ? `Live buffer · ${held} held writes` : "Live buffer"}</span>
        <Button variant="quiet" icon={<RotateCw />} onClick={() => setGeneration((g) => g + 1)}>
          Reload
        </Button>
      </div>
      <div className="min-h-0 flex-1 overflow-auto">
        <AppletHostMount
          key={generation}
          appletId={rowId}
          slug={slug}
          files={fieldId ? { [fieldId]: code } : undefined}
          preview={{ onHeld: (writes) => setHeld(writes.length) }}
        />
      </div>
    </div>
  );
}
