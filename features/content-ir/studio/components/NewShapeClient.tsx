"use client";

/**
 * New Shape — create-with-agent entry. The studio does NOT own a chat: it
 * composes the user's intent (+ optional pasted sample data) and opens the
 * creator agent in a floating run window on this page (the shared
 * `agentRunWindow` overlay), pre-loaded with the composed brief. The user
 * reviews and sends; the creator agent does the actual creation server-side and
 * the run streams in-place — no navigation away from the studio. When the shape
 * lands, the /shapes list's Refresh picks it up.
 *
 * Not-configured state is LOUD: no fallback agent, ever.
 */

import { useCallback, useState } from "react";
import { CircleAlert, PencilRuler } from "lucide-react";
import { Button } from "@/components/ui/button";
import { ProTextarea } from "@/components/official/ProTextarea";
import { useOpenAgentRunWindow } from "@/features/overlays/openers/agentRunWindow";
import { shapeCreatorAgentId } from "@/features/content-ir/studio/constants";
import { SurfaceRuntimeProvider } from "@/features/surfaces/runtime/SurfaceRuntimeContext";
import { createShapesScope } from "@/features/surfaces/manifests/shapes.manifest";

function composeDraft(intent: string, sample: string): string {
  const parts = [intent.trim()];
  if (sample.trim().length > 0) {
    parts.push(`Here is a sample of my data:\n\n${sample.trim()}`);
  }
  return parts.join("\n\n");
}

export default function NewShapeClient() {
  const openRun = useOpenAgentRunWindow();
  const agentId = shapeCreatorAgentId();
  const [intent, setIntent] = useState("");
  const [sample, setSample] = useState("");

  // Surface scope (matrx-user/shapes) — the create-a-shape draft. Built at
  // TRIGGER time; no kind exists yet, so no kind_* values are emitted here.
  const getSurfaceScope = useCallback(
    () =>
      createShapesScope({
        studio_tab: "new",
        new_shape_intent: intent || undefined,
        new_shape_sample: sample || undefined,
        shape_creator_agent_id: agentId || undefined,
      }),
    [intent, sample, agentId],
  );

  if (!agentId) {
    return (
      <div className="mx-auto max-w-xl rounded-md border border-amber-500/30 bg-amber-500/5 px-4 py-6 text-center">
        <CircleAlert className="mx-auto h-6 w-6 text-amber-600 dark:text-amber-400" />
        <p className="mt-2 text-sm font-medium text-foreground">
          The Shape creator agent is not configured yet.
        </p>
        <p className="mx-auto mt-1 max-w-md text-xs text-muted-foreground">
          Creating shapes with an agent needs the platform creator agent. Set{" "}
          <code className="font-mono">SHAPE_CREATOR_AGENT_ID</code> in{" "}
          <code className="font-mono">
            features/content-ir/studio/constants.ts
          </code>{" "}
          once the agent ships.
        </p>
      </div>
    );
  }

  const canStart = intent.trim().length > 0;

  const start = () => {
    if (!canStart) return;
    openRun({
      initialAgentId: agentId,
      initialDraftText: composeDraft(intent, sample),
    });
  };

  return (
    <SurfaceRuntimeProvider
      surfaceName="matrx-user/shapes"
      getScope={getSurfaceScope}
      isEditable={false}
    >
      <div className="mx-auto max-w-2xl space-y-4">
        <div className="rounded-md border border-border bg-card p-4">
          <h2 className="flex items-center gap-2 text-sm font-semibold text-foreground">
            <PencilRuler className="h-4 w-4 text-primary" />
            Design a shape with the agent
          </h2>
          <p className="mt-1 text-xs text-muted-foreground">
            Describe your data and what you want to see. The agent creates the
            shape, builds a custom component for it, and you test it right here
            in the studio.
          </p>

          <label className="mt-4 block text-xs font-medium text-foreground">
            What do you want to build?
            <ProTextarea
              value={intent}
              onChange={(e) => setIntent(e.target.value)}
              placeholder="e.g. A recipe card with ingredients, steps, cook time, and a difficulty rating"
              className="text-base sm:text-sm"
              wrapperClassName="mt-1 w-full"
              autoGrow
              minHeight={96}
              maxHeight={240}
              enableTextStats={false}
            />
          </label>

          <label className="mt-3 block text-xs font-medium text-foreground">
            Sample data{" "}
            <span className="font-normal text-muted-foreground">
              (optional — paste JSON, CSV, or plain text)
            </span>
            <ProTextarea
              value={sample}
              onChange={(e) => setSample(e.target.value)}
              placeholder="Paste an example of your real data so the agent designs around it"
              className="font-mono text-base sm:text-sm"
              wrapperClassName="mt-1 w-full"
              autoGrow
              minHeight={96}
              maxHeight={240}
              enableTextStats={false}
            />
          </label>

          <div className="mt-4 flex items-center justify-end">
            <Button onClick={start} disabled={!canStart} className="gap-1.5">
              <PencilRuler className="h-4 w-4" />
              Start with the agent
            </Button>
          </div>
        </div>

        <p className="text-center text-[11px] text-muted-foreground">
          When the agent finishes, come back to Shapes and hit Refresh — your
          new shape appears in the list, ready to preview and test.
        </p>
      </div>
    </SurfaceRuntimeProvider>
  );
}
