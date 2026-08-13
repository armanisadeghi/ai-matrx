"use client";

/**
 * KindBuilderClient — the admin surface that drives the `kind_architect` agent:
 * hand it a data structure, it builds the ENTIRE kind end to end (schema,
 * example, a live-quality component, skill, two content blocks) and activates
 * it, in one pass.
 *
 * Like the user-facing /shapes/new, this surface does NOT own a chat: it
 * composes the admin's structure into a brief and opens the builder agent in a
 * floating run window on this page (the shared `agentRunWindow` overlay) — where
 * the run streams and every kind_* tool call renders through the standard
 * ToolCallVisualization ("drive it, watch it work"), with no navigation away.
 * The read-only Kind Registry board is one click away to confirm what landed.
 *
 * The target is the admin builder agent, not the cautious user creator — see
 * the `content_ir.kind_architect` agent slot.
 */

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useAgentSlot } from "@/features/agents/slots/useAgentSlot";
import { Hammer, Table2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { ProTextarea } from "@/components/official/ProTextarea";
import { useOpenAgentRunWindow } from "@/features/overlays/openers/agentRunWindow";
import { SurfaceRuntimeProvider } from "@/features/surfaces/runtime/SurfaceRuntimeContext";
import {
  ADMIN_KIND_REGISTRY_SURFACE_NAME,
  createAdminKindRegistryScope,
} from "@/features/surfaces/manifests/admin-kind-registry.manifest";

/**
 * The admin one-shot kind builder (agent.definition 'kind_architect', builtin).
 * Distinct from the user creator (`shapeCreatorAgentId`): no interview, no
 * confirmation gate, activates the kind, and builds to the alive-component bar.
 */
const KIND_ARCHITECT_SLOT = "content_ir.kind_architect";

export default function KindBuilderClient() {
  // Which agent builds a kind is a SLOT, not a hardcoded id — swappable from
  // the admin console or an override at /agents/slots, no deploy.
  const { slot: architect, error: architectError } = useAgentSlot(KIND_ARCHITECT_SLOT);
  const router = useRouter();
  const openRun = useOpenAgentRunWindow();
  const [structure, setStructure] = useState("");
  const [notes, setNotes] = useState("");

  const canStart = structure.trim().length > 0 && architect !== null;

  const start = () => {
    if (!canStart || !architect) return;
    const parts = [
      "Build a complete, live kind from this data structure. Run the whole build end to end and activate it.",
      structure.trim(),
    ];
    if (notes.trim().length > 0) {
      parts.push(`Additional direction:\n\n${notes.trim()}`);
    }
    // Open the builder agent in a floating run window on this page, pre-loaded
    // with the brief. The run streams in-place; the admin watches every step.
    openRun({
      initialAgentId: architect.agentId,
      initialDraftText: parts.join("\n\n"),
    });
  };

  return (
    <SurfaceRuntimeProvider
      surfaceName={ADMIN_KIND_REGISTRY_SURFACE_NAME}
      getScope={() =>
        createAdminKindRegistryScope({
          kind_registry_section: "build",
          kind_builder_structure: structure,
          kind_builder_notes: notes,
          kind_builder_architect_agent_id: architect?.agentId,
          kind_builder_can_start: canStart,
        })
      }
    >
    <div className="mx-auto max-w-3xl space-y-4 p-4">
      <div className="rounded-md border border-border bg-card p-4">
        <h2 className="flex items-center gap-2 text-sm font-semibold text-foreground">
          <Hammer className="h-4 w-4 text-primary" />
          Build a kind end to end
        </h2>
        <p className="mt-1 text-xs text-muted-foreground">
          Paste a data structure. The admin builder agent creates the schema, a
          live-quality interactive component (with copy-for-AI and any agent
          triggers the data implies), the skill and content blocks, and
          activates the kind — in one pass, no interview. The run opens in a
          window right here so you can watch every step.
        </p>

        <label className="mt-4 block text-xs font-medium text-foreground">
          Data structure
          <ProTextarea
            value={structure}
            onChange={(e) => setStructure(e.target.value)}
            placeholder={
              'Paste JSON, a row, or a field list. e.g.\n{\n  "__kind": "topic_ideas",\n  "concept_summary": "…",\n  "ideas": [{ "title": "…", "hook": "…", "key_points": ["…"] }]\n}'
            }
            className="font-mono text-base sm:text-sm"
            wrapperClassName="mt-1 w-full"
            autoGrow
            minHeight={160}
            maxHeight={420}
            enableTextStats={false}
          />
        </label>

        <label className="mt-3 block text-xs font-medium text-foreground">
          Direction{" "}
          <span className="font-normal text-muted-foreground">
            (optional — e.g. "the description should have a Generate image
            button wired to agent &lt;id&gt;")
          </span>
          <ProTextarea
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            placeholder="Any specific look, interaction, or agent trigger you want on the component"
            className="text-base sm:text-sm"
            wrapperClassName="mt-1 w-full"
            autoGrow
            minHeight={72}
            maxHeight={200}
            enableTextStats={false}
          />
        </label>

        <div className="mt-4 flex items-center justify-between">
          <Button
            variant="outline"
            size="sm"
            className="gap-1.5"
            onClick={() => router.push("/administration/utilities/kind-registry")}
          >
            <Table2 className="h-4 w-4" />
            Kind Registry
          </Button>
          <Button onClick={start} disabled={!canStart} className="gap-1.5">
            <Hammer className="h-4 w-4" />
            Build the kind
          </Button>
        </div>
      </div>

      <p className="text-center text-[11px] text-muted-foreground">
        When the agent reports the kind ACTIVE, open the Kind Registry to see its
        row go green, or drop a{" "}
        <code className="font-mono">{'{ "__kind": "…" }'}</code> payload in any
        chat to see it render.
      </p>
    </div>
    </SurfaceRuntimeProvider>
  );
}
