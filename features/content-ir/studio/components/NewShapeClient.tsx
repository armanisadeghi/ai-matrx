"use client";

/**
 * New Shape — the create entry.
 *
 * There is NO form here any more. The page used to collect an intent and a
 * sample into two textareas and then hand the composed result to an agent
 * window — the user typed their idea, then typed it again into the composer.
 * The window's own composer and variable panel already are that input, so the
 * middle step was pure double entry.
 *
 * What happens now: the page publishes the `matrx-user/shapes` surface scope,
 * opens the studio's `shape_builder` role in a floating window ON THIS PAGE,
 * and gets out of the way. The user describes their data in the composer and
 * presses Send; the agent creates the Shape and its assets, and the run
 * streams in-place — no navigation.
 *
 * The agent is the surface ROLE (mandate-backed `content_ir.kind_creator`,
 * overridable per user in the header Agents menu), never a UUID in code.
 * Resolution failure is LOUD: no fallback agent, ever.
 */

import { useEffect, useRef } from "react";
import { BrainCircuit, CircleAlert, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  SHAPES_SURFACE_NAME,
  SHAPE_BUILDER_ROLE,
} from "@/features/content-ir/studio/constants";
import { composeNewShapeIntent } from "@/features/content-ir/studio/kind-agent-intents";
import { useKindAgentLaunch } from "@/features/content-ir/studio/useKindAgentLaunch";
import { useSurfaceAgentRoles } from "@/features/surfaces/hooks/useSurfaceConfig";
import { SurfaceRuntimeProvider } from "@/features/surfaces/runtime/SurfaceRuntimeContext";
import { createShapesScope } from "@/features/surfaces/manifests/shapes.manifest";

function NewShapeLauncher() {
  const { roles, status } = useSurfaceAgentRoles(SHAPES_SURFACE_NAME);
  const { launch, ready, launching } = useKindAgentLaunch(
    SHAPES_SURFACE_NAME,
    SHAPE_BUILDER_ROLE,
  );
  const openedRef = useRef(false);

  // Landing on /shapes/new IS the request to build a shape — open the builder
  // once, as soon as the role resolves. The user can reopen it from the card
  // below if they close the window.
  useEffect(() => {
    if (!ready || openedRef.current) return;
    openedRef.current = true;
    void launch(composeNewShapeIntent());
  }, [launch, ready]);

  if (status === "loading" || status === "idle") {
    return (
      <div className="mx-auto flex max-w-xl items-center justify-center gap-2 px-4 py-10 text-sm text-muted-foreground">
        <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
        Opening the Shape builder…
      </div>
    );
  }

  if (!ready) {
    return (
      <div className="mx-auto max-w-xl rounded-md border border-amber-500/30 bg-amber-500/5 px-4 py-6 text-center">
        <CircleAlert className="mx-auto h-6 w-6 text-amber-600 dark:text-amber-400" />
        <p className="mt-2 text-sm font-medium text-foreground">
          The Shape builder agent is unavailable.
        </p>
        <p className="mx-auto mt-1 max-w-md text-xs text-muted-foreground">
          Nothing is filling the{" "}
          <span className="font-medium">
            {roles[SHAPE_BUILDER_ROLE]?.role.label ?? "Shape Builder"}
          </span>{" "}
          role on this page. Pick an agent for it in the header Agents menu, or
          check its mandate in the admin console.
        </p>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-2xl">
      <div className="rounded-md border border-border bg-card p-4 text-center">
        <BrainCircuit className="mx-auto h-5 w-5 text-primary" aria-hidden />
        <h2 className="mt-2 text-sm font-semibold text-foreground">
          The Shape builder is open
        </h2>
        <p className="mx-auto mt-1 max-w-md text-xs text-muted-foreground">
          Describe your data and how you want to see it in the builder window —
          paste a real example if you have one. It designs the shape, builds a
          component for it, and you test it right here in the studio.
        </p>
        <Button
          variant="outline"
          size="sm"
          className="mt-4 gap-1.5"
          disabled={launching}
          onClick={() => void launch(composeNewShapeIntent())}
        >
          {launching ? (
            <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
          ) : (
            <BrainCircuit className="h-4 w-4" aria-hidden />
          )}
          Reopen the builder
        </Button>
      </div>
      <p className="mt-4 text-center text-[11px] text-muted-foreground">
        When the agent finishes, come back to Shapes and hit Refresh — your new
        shape appears in the list, ready to preview and test.
      </p>
    </div>
  );
}

export default function NewShapeClient() {
  const { roles } = useSurfaceAgentRoles(SHAPES_SURFACE_NAME);
  // Ref-held, not a useCallback dep: the role resolves asynchronously and the
  // window opens the instant it does, so a closure captured on an earlier
  // render would emit `shape_creator_agent_id` as absent — a surface value
  // the page really does have. Read it at TRIGGER time instead.
  const builderAgentIdRef = useRef<string | null>(null);
  builderAgentIdRef.current = roles[SHAPE_BUILDER_ROLE]?.effectiveAgentId ?? null;

  // Surface scope (matrx-user/shapes) — the create entry. No kind exists yet,
  // so no kind_* values are emitted here.
  const getSurfaceScope = () =>
    createShapesScope({
      studio_tab: "new",
      shape_creator_agent_id: builderAgentIdRef.current || undefined,
    });

  return (
    <SurfaceRuntimeProvider
      surfaceName={SHAPES_SURFACE_NAME}
      getScope={getSurfaceScope}
      isEditable={false}
    >
      <NewShapeLauncher />
    </SurfaceRuntimeProvider>
  );
}
