"use client";

// features/agents/components/agent-listings/AgentPeekDuplicateButton.tsx
//
// The agent quick look's "Duplicate" — the viewer's OWN copy of an agent they
// do not own, through the one duplicate path (`duplicateAgent` →
// `agx_duplicate_agent`), then straight into the copy. Rendered by BOTH peek
// shells (the Sneak Peek dialog and the quick-look window), so every surface
// that opens a peek — chat, the agent pickers, the Intelligence card, the
// agents list — carries it.
//
// Absent when the viewer owns the agent: they already have it. Absent until
// the record is loaded, so ownership is never guessed.

import { useState } from "react";
import { useRouter } from "next/navigation";
import { CopyPlus, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useAppDispatch, useAppSelector } from "@/lib/redux/hooks";
import { selectUserId } from "@/lib/redux/selectors/userSelectors";
import {
  selectAgentById,
  selectAgentReadyForBuilder,
} from "@/features/agents/redux/agent-definition/selectors";
import { duplicateAgent } from "@/features/agents/redux/agent-definition/thunks";
import { agentGoHref } from "@/features/agents/addressing/agentAddress";
import { toast } from "@/lib/toast";
import { getUserMessage } from "@/lib/api/errors";
import { isOrganizationSelectionCancelled } from "@/lib/organization/organization-gate";

export function AgentPeekDuplicateButton({
  agentId,
  onDuplicated,
}: {
  agentId: string;
  /** Close the peek once the copy opens. */
  onDuplicated?: () => void;
}) {
  const dispatch = useAppDispatch();
  const router = useRouter();
  const userId = useAppSelector(selectUserId);
  const record = useAppSelector((state) => selectAgentById(state, agentId));
  const isReady = useAppSelector((state) =>
    selectAgentReadyForBuilder(state, agentId),
  );
  const [busy, setBusy] = useState(false);

  if (!isReady || !record) return null;
  const ownsIt =
    record.isOwner === true ||
    (record.createdBy != null && record.createdBy === userId);
  if (ownsIt) return null;

  const duplicate = async () => {
    if (busy) return;
    setBusy(true);
    try {
      // Always a personal copy: the viewer's own agent, in the organization
      // they are working in (the thunk holds for one when none is chosen).
      const newId = await dispatch(duplicateAgent(agentId)).unwrap();
      toast.success(`Duplicated "${record.name}"`);
      onDuplicated?.();
      router.push(agentGoHref(newId, "/build"));
    } catch (err) {
      if (!isOrganizationSelectionCancelled(err)) {
        toast.error("Could not duplicate agent", {
          description: getUserMessage(err),
        });
      }
    } finally {
      setBusy(false);
    }
  };

  return (
    <Button
      variant="outline"
      size="sm"
      onClick={duplicate}
      disabled={busy}
      title="Make your own copy of this agent"
    >
      {busy ? <Loader2 className="animate-spin" /> : <CopyPlus />}
      Duplicate
    </Button>
  );
}
