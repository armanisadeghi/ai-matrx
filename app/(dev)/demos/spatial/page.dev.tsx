// /demos/spatial — the spatial view proof: many live AI results on one
// pannable, zoomable plane, with streaming paced by zoom level — hosted in the
// ONE chat-beside-a-canvas layout (features/canvas/workspace/FEATURE.md): the
// platform chat docks beside it (or floats over it) and receives the board as
// ONE `spatial_board` context entry. Engine + doctrine: features/spatial/FEATURE.md.

import type { Metadata } from "next";
import { createClient } from "@/utils/supabase/server";
import type { DemoKindExample } from "@/features/spatial/demo/SpatialDemoBoard";
import { readCanvasNavCookie } from "@/features/shell/canvas-chrome/canvas-nav.server";
import { readCanvasChatCookie } from "@/features/canvas/workspace/workspace-cookies.server";
import { readComposerModeCookie } from "@/features/agents/components/inputs/smart-input/composer/composer-mode.server";
import { SpatialCanvasWorkspaceDemo } from "../canvas-workspace/SpatialCanvasWorkspaceDemo";

/** The workspace id (its chat surface key and cookies). */
const WORKSPACE_ID = "demo-spatial-board";

export const metadata: Metadata = {
  title: "Spatial View",
  description: "Many live AI results on one pannable, zoomable plane — streaming paced by zoom.",
};

/** Kinds shown in the study pack, in board order (missing ones are skipped). */
const BOARD_KINDS = ["flashcard_set", "quiz_set", "study_notes", "presentation_deck"] as const;

async function loadCanonicalExamples(): Promise<{
  kinds: DemoKindExample[];
  note: string | null;
}> {
  try {
    const supabase = await createClient();
    const { data: defs, error } = await supabase
      .schema("content_ir")
      .from("kind_definition")
      .select("id,kind,label")
      .in("kind", [...BOARD_KINDS])
      .is("deleted_at", null);
    if (error) throw new Error(`kind_definition: ${error.message}`);
    const ids = (defs ?? []).map((d) => d.id);
    const { data: examples, error: exError } = await supabase
      .schema("content_ir")
      .from("kind_example")
      .select("kind_definition_id,data")
      .in("kind_definition_id", ids)
      .eq("is_canonical", true)
      .is("deleted_at", null);
    if (exError) throw new Error(`kind_example: ${exError.message}`);

    const exampleByDef = new Map((examples ?? []).map((e) => [e.kind_definition_id, e.data]));
    const byKind = new Map((defs ?? []).map((d) => [d.kind, d]));
    const kinds: DemoKindExample[] = [];
    for (const slug of BOARD_KINDS) {
      const def = byKind.get(slug);
      const example = def ? exampleByDef.get(def.id) : undefined;
      if (!def || typeof example !== "object" || example === null || Array.isArray(example)) continue;
      kinds.push({ kind: def.kind, label: def.label, example: example as Record<string, unknown> });
    }
    return {
      kinds,
      note:
        kinds.length === 0
          ? "No canonical examples were found for the study-pack kinds, so the board is using two built-in sample payloads (flashcards and a quiz)."
          : null,
    };
  } catch (err) {
    const reason = err instanceof Error ? err.message : String(err);
    return {
      kinds: [],
      note: `The canonical kind examples could not be read (${reason}), so the study pack is using two built-in sample payloads. Everything else on the board is unaffected.`,
    };
  }
}

export default async function SpatialDemoPage() {
  const [{ kinds, note }, initialNav, initialChat, initialMode] = await Promise.all([
    loadCanonicalExamples(),
    readCanvasNavCookie(),
    readCanvasChatCookie(WORKSPACE_ID),
    readComposerModeCookie(),
  ]);
  return (
    <div className="h-full min-h-0">
      <SpatialCanvasWorkspaceDemo
        workspaceId={WORKSPACE_ID}
        kinds={kinds}
        examplesNote={note}
        initialNav={initialNav}
        initialChat={initialChat}
        initialMode={initialMode}
      />
    </div>
  );
}
