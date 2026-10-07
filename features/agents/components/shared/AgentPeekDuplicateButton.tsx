"use client";

// AgentPeekDuplicateButton — the agent quick look's "Duplicate": the viewer's
// OWN copy of an agent they do not own, through the one duplicate path (the
// builder's `duplicateAgent` → `agx_duplicate_agent`), opened in a NEW TAB on the copy's
// page so the conversation they were in stays put (Arman, 2026-10-06).
// Rendered by every peek: the Sneak Peek dialog, the quick-look window and the
// chat composer's agent pill.
//
// Absent when the viewer owns the agent (they already have it), until the
// record is loaded (ownership is never guessed), and in a host with no
// builder door.

import { useEffect, useState } from "react";
import { CopyPlus, Loader2 } from "lucide-react";
import { Button } from "@ai-matrx/design-system/controls";
import { getUserMessage } from "@ai-matrx/agents/matrx";
import { useAppDispatch, useAppSelector } from "@ai-matrx/chat/store/hooks";
import { selectUserId } from "@ai-matrx/chat/host/identity";
import { duplicateAgent } from "@/features/agents/redux/builder-write.thunks";
import { fetchFullAgent } from "@ai-matrx/chat/agents/redux/agent-definition/thunks";
import { toast } from "@ai-matrx/chat/host/notify";
import { isOrganizationSelectionCancelled } from "@ai-matrx/chat/host/org";
import { selectAgentById, selectAgentReadyForBuilder } from "@ai-matrx/chat/agents/redux/agent-definition/selectors";
import { agentGoHref } from "@ai-matrx/chat/agents/addressing/agentAddress";

export function AgentPeekDuplicateButton({
  agentId,
  onStart,
}: {
  agentId: string;
  /**
   * Close the peek as the copy starts: the organization question (when none is
   * chosen) and the new tab must never open behind a menu.
   */
  onStart?: () => void;
}) {
  const dispatch = useAppDispatch();
  const userId = useAppSelector(selectUserId);
  const record = useAppSelector((state) => selectAgentById(state, agentId));
  const isReady = useAppSelector((state) => selectAgentReadyForBuilder(state, agentId));
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    // Ownership is never guessed: the builder reads the full record itself
    // (a failed read leaves the button absent).
    if (!isReady) void dispatch(fetchFullAgent(agentId)).unwrap().catch(() => undefined);
  }, [dispatch, agentId, isReady]);

  if (!isReady || !record) return null;
  const ownsIt = record.isOwner === true || (record.createdBy != null && record.createdBy === userId);
  if (ownsIt) return null;

  const duplicate = async () => {
    if (busy) return;
    setBusy(true);
    onStart?.();
    try {
      // Always a personal copy: the viewer's own agent, in the organization
      // they are working in (the door holds for one when none is chosen).
      const newId = await dispatch(duplicateAgent(agentId)).unwrap();
      const href = agentGoHref(newId, "/build");
      // Opened once the copy exists: the click (or the organization answer)
      // is still a fresh gesture. A browser that blocks it gets the door in
      // the notice instead — never a silent no-op.
      // (No "noopener" flag: with it the browser answers null even when the
      // tab opened, and a blocked tab could not be told apart.)
      const tab = window.open(href, "_blank");
      if (tab) {
        tab.opener = null;
        toast.success(`Duplicated "${record.name}" — opened in a new tab`);
      } else {
        toast.success(`Duplicated "${record.name}"`, {
          description: "Your browser kept the new tab closed",
          action: { label: "Open", onClick: () => window.open(href, "_blank", "noopener") },
        });
      }
    } catch (err) {
      if (!isOrganizationSelectionCancelled(err)) {
        toast.error("Could not duplicate agent", { description: getUserMessage(err) });
      }
    } finally {
      setBusy(false);
    }
  };

  return (
    <Button
      icon={busy ? <Loader2 className="animate-spin" /> : <CopyPlus />}
      variant="outline"
      onClick={duplicate}
      disabled={busy}
      title="Make your own copy of this agent, in a new tab"
    >
      Duplicate
    </Button>
  );
}
