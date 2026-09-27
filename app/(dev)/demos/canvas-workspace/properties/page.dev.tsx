// /demos/canvas-workspace/properties — ChatCanvasWorkspace with a properties
// panel over real rows (content_ir.kind_definition), so the panel's tabs,
// fade and hover scrollbar are provable. The spatial host is one level up.

import type { Metadata } from "next";
import { createClient } from "@/utils/supabase/server";
import { readCanvasNavCookie } from "@/features/shell/canvas-chrome/canvas-nav.server";
import { readCanvasChatCookie } from "@/features/canvas/workspace/workspace-cookies.server";
import { readComposerModeCookie } from "@/features/agents/components/inputs/smart-input/composer/composer-mode.server";
import { KindsCanvasWorkspaceDemo, type DemoKindRow } from "./KindsCanvasWorkspaceDemo";

const WORKSPACE_ID = "demo-registered-shapes";

export const metadata: Metadata = {
  title: "Canvas Workspace — Properties",
  description: "Chat beside a canvas with a properties panel over the registered shapes.",
};

async function loadKinds(): Promise<{ kinds: DemoKindRow[]; error: string | null }> {
  try {
    const supabase = await createClient();
    const { data, error } = await supabase
      .schema("content_ir")
      .from("kind_definition")
      .select("id,kind,label,version,is_active")
      .is("deleted_at", null)
      .order("label")
      .limit(500);
    if (error) throw new Error(error.message);
    return { kinds: data ?? [], error: null };
  } catch (err) {
    return { kinds: [], error: err instanceof Error ? err.message : String(err) };
  }
}

export default async function CanvasWorkspacePropertiesDemoPage() {
  const [{ kinds, error }, initialNav, initialChat, initialMode] = await Promise.all([
    loadKinds(),
    readCanvasNavCookie(),
    readCanvasChatCookie(WORKSPACE_ID),
    readComposerModeCookie(),
  ]);
  return (
    <div className="h-full min-h-0">
      <KindsCanvasWorkspaceDemo
        workspaceId={WORKSPACE_ID}
        kinds={kinds}
        loadError={error}
        initialNav={initialNav}
        initialChat={initialChat}
        initialMode={initialMode}
      />
    </div>
  );
}
