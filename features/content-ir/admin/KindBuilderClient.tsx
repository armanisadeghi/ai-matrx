"use client";

/**
 * KindBuilderClient — the admin surface that drives the `kind_architect` agent:
 * hand it a data structure, it builds the ENTIRE kind end to end (schema,
 * example, a live-quality component, skill, two content blocks) and activates
 * it, in one pass.
 *
 * Like the user-facing /shapes/new, this surface does NOT own a chat: it
 * composes the admin's structure into a draft and hands off to the canonical
 * direct-agent chat route (`/chat/a/[agentId]`) via `stashChatDraftTransfer` —
 * where the run streams and every kind_* tool call renders through the standard
 * ToolCallVisualization ("drive it, watch it work"). The read-only Kind
 * Registry board is one click away to confirm what landed.
 *
 * The target is the admin builder agent, not the cautious user creator — see
 * KIND_ARCHITECT_AGENT_ID.
 */

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Hammer, Loader2, Table2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { ProTextarea } from "@/components/official/ProTextarea";
import { stashChatDraftTransfer } from "@/features/agents/components/chat/chat-draft-transfer";

/**
 * The admin one-shot kind builder (agent.definition 'kind_architect', builtin).
 * Distinct from the user creator (`shapeCreatorAgentId`): no interview, no
 * confirmation gate, activates the kind, and builds to the alive-component bar.
 */
const KIND_ARCHITECT_AGENT_ID = "9d484ce1-1e2b-4db7-8469-d3ba8550cdd8";

export default function KindBuilderClient() {
  const router = useRouter();
  const [structure, setStructure] = useState("");
  const [notes, setNotes] = useState("");
  const [pending, startTransition] = useTransition();
  const [launching, setLaunching] = useState(false);

  const canStart = structure.trim().length > 0 && !launching && !pending;

  const start = () => {
    if (!canStart) return;
    setLaunching(true);
    const parts = [
      "Build a complete, live kind from this data structure. Run the whole build end to end and activate it.",
      structure.trim(),
    ];
    if (notes.trim().length > 0) {
      parts.push(`Additional direction:\n\n${notes.trim()}`);
    }
    stashChatDraftTransfer({
      text: parts.join("\n\n"),
      targetAgentId: KIND_ARCHITECT_AGENT_ID,
    });
    startTransition(() => {
      router.push(`/chat/a/${KIND_ARCHITECT_AGENT_ID}`);
    });
  };

  return (
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
          activates the kind — in one pass, no interview. The run opens in chat
          so you can watch every step.
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
            onClick={() => router.push("/administration/kind-registry")}
          >
            <Table2 className="h-4 w-4" />
            Kind Registry
          </Button>
          <Button onClick={start} disabled={!canStart} className="gap-1.5">
            {launching || pending ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Hammer className="h-4 w-4" />
            )}
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
  );
}
