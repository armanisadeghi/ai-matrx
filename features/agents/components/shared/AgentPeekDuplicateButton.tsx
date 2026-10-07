"use client";

// AgentPeekDuplicateButton — the agent quick look's "Duplicate": the viewer's
// OWN copy of an agent they do not own, through the one Duplicate dialog
// (version + name; its success step offers "Open in new tab" so the
// conversation they were in stays put — Arman, 2026-10-06).
// Rendered by every peek: the Sneak Peek dialog, the quick-look window and the
// chat composer's agent pill.
//
// Absent when the viewer owns the agent (they already have it), until the
// record is loaded (ownership is never guessed), and in a host with no
// builder door.

import { useEffect } from "react";
import { useAgentDuplicateFlow } from "@/features/agents/hooks/useAgentDuplicateFlow";
import { CopyPlus, Loader2 } from "lucide-react";
import { Button } from "@ai-matrx/design-system/controls";
import { useAppDispatch, useAppSelector } from "@ai-matrx/chat/store/hooks";
import { selectUserId } from "@ai-matrx/chat/host/identity";
import {
  fetchFullAgent,
} from "@/features/agents/redux/fetch-full-agent.thunk";
import { selectAgentById, selectAgentReadyForBuilder } from "@ai-matrx/chat/agents/redux/agent-definition/selectors";

export function AgentPeekDuplicateButton({
  agentId,
  onStart,
}: {
  agentId: string;
  /** Close the peek once a copy is made and its dialog closes (the dialog opens above it). */
  onStart?: () => void;
}) {
  const dispatch = useAppDispatch();
  const userId = useAppSelector(selectUserId);
  const record = useAppSelector((state) => selectAgentById(state, agentId));
  const isReady = useAppSelector((state) => selectAgentReadyForBuilder(state, agentId));
  const duplicateFlow = useAgentDuplicateFlow({
    fallbackSuffix: "/build",
    // Cancel leaves the quick look open; after a copy it closes.
    onDialogClosed: (madeCopy) => {
      if (madeCopy) onStart?.();
    },
  });
  const busy = duplicateFlow.isDuplicating;
  useEffect(() => {
    // Ownership is never guessed: the builder reads the full record itself
    // (a failed read leaves the button absent).
    if (!isReady) void dispatch(fetchFullAgent(agentId)).unwrap().catch(() => undefined);
  }, [dispatch, agentId, isReady]);

  if (!isReady || !record) return null;
  const ownsIt = record.isOwner === true || (record.createdBy != null && record.createdBy === userId);
  if (ownsIt) return null;

  // THE one Duplicate dialog (version + name). It opens above the peek; the
  // peek closes once the dialog does (closing it first would unmount the dialog).
  const duplicate = () => void duplicateFlow.openDuplicate({ agentId, asSystem: false });

  return (
    <>
    {duplicateFlow.dialog}
    <Button
      icon={busy ? <Loader2 className="animate-spin" /> : <CopyPlus />}
      variant="outline"
      onClick={duplicate}
      disabled={busy}
      title="Make your own copy of this agent"
    >
      Duplicate
    </Button>
    </>
  );
}
