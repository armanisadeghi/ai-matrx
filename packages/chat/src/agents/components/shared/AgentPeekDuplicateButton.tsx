"use client";

// AgentPeekDuplicateButton — the agent quick look's "Duplicate": the viewer's
// OWN copy of an agent they do not own, through the one duplicate path (the
// builder door → `agx_duplicate_agent`), opened in a NEW TAB on the copy's
// page so the conversation they were in stays put (Arman, 2026-10-06).
// Rendered by every peek: the Sneak Peek dialog, the quick-look window and the
// chat composer's agent pill.
//
// Absent when the viewer owns the agent (they already have it), until the
// record is loaded (ownership is never guessed), and in a host with no
// builder door.

import { useState } from "react";
import { CopyPlus, Loader2 } from "lucide-react";
import { Button } from "@ai-matrx/design-system/controls";
import { getUserMessage } from "@ai-matrx/agents/matrx";
import { useAppDispatch, useAppSelector } from "../../../store/hooks";
import { selectUserId } from "../../../host/identity";
import { getBuilderDoor } from "../../../host/builder-door";
import { toast } from "../../../host/notify";
import { isOrganizationSelectionCancelled } from "../../../host/org";
import { selectAgentById, selectAgentReadyForBuilder } from "../../redux/agent-definition/selectors";
import { agentGoHref } from "../../addressing/agentAddress";

export function AgentPeekDuplicateButton({
  agentId,
  onDuplicated,
}: {
  agentId: string;
  /** Close the peek once the copy opens. */
  onDuplicated?: () => void;
}) {
  const dispatch = useAppDispatch();
  const userId = useAppSelector(selectUserId);
  const record = useAppSelector((state) => selectAgentById(state, agentId));
  const isReady = useAppSelector((state) => selectAgentReadyForBuilder(state, agentId));
  const [busy, setBusy] = useState(false);
  const door = getBuilderDoor();

  if (!door || !isReady || !record) return null;
  const ownsIt = record.isOwner === true || (record.createdBy != null && record.createdBy === userId);
  if (ownsIt) return null;

  const duplicate = async () => {
    if (busy) return;
    setBusy(true);
    // The tab opens INSIDE the click, so no popup blocker stops it; the copy's
    // address arrives once the database has made it.
    const tab = window.open("about:blank", "_blank");
    try {
      // Always a personal copy: the viewer's own agent, in the organization
      // they are working in (the door holds for one when none is chosen).
      const newId = await dispatch(door.duplicateAgent(agentId)).unwrap();
      const href = agentGoHref(newId, "/build");
      if (tab) {
        tab.opener = null;
        tab.location.href = href;
      } else {
        window.open(href, "_blank", "noopener");
      }
      toast.success(`Duplicated "${record.name}" — opened in a new tab`);
      onDuplicated?.();
    } catch (err) {
      tab?.close();
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
