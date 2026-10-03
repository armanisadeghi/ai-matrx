"use client";

// features/vision-interview/group-chat/useGroupChat.ts
//
// The group's roster for the inspector, and the ONE policy write: optimistic in place, sent with
// the version the person edited (`expected_policy_version`). A 409 means someone else changed it
// first (or it names a participant that left): the roster reloads and the person sees the
// current policy — never a silent overwrite, never a silently lost edit.

import { useEffect, useState } from "react";
import { useAppDispatch } from "@/lib/redux/hooks";
import { toast } from "@/lib/toast";
import { getGroupChatCall, putParticipantPolicyCall } from "./api";
import type { GroupChatOut, ParticipantOut, ViewPolicy } from "./policy";

export type GroupChatState =
  | { status: "loading" }
  | { status: "missing" }
  | { status: "error"; message: string }
  | { status: "ready"; group: GroupChatOut };

/** Replace one participant's record in the group (pure — the optimistic, revert and confirmed steps). */
export function withParticipant(state: GroupChatState, next: ParticipantOut): GroupChatState {
  if (state.status !== "ready") return state;
  const participants = (state.group.participants ?? []).map((p) => (p.id === next.id ? next : p));
  return { status: "ready", group: { ...state.group, participants } };
}

/** The optimistic record: the new policy; the version moves only when the server bumps it. */
export function withPolicy(row: ParticipantOut, policy: ViewPolicy): ParticipantOut {
  return row.participant ? { ...row, participant: { ...row.participant, policy } } : row;
}

export function useGroupChat(anchorType: string, anchorId: string) {
  const dispatch = useAppDispatch();
  const [state, setState] = useState<GroupChatState>({ status: "loading" });
  const [saving, setSaving] = useState<string | null>(null);
  const [generation, setGeneration] = useState(0);

  useEffect(() => {
    let disposed = false;
    void (async () => {
      const result = await dispatch(getGroupChatCall({ anchorType, anchorId }));
      if (disposed) return;
      if (result.error) {
        setState(result.error.status === 404 ? { status: "missing" } : { status: "error", message: result.error.message });
        return;
      }
      setState({ status: "ready", group: result.data as GroupChatOut });
    })();
    return () => {
      disposed = true;
    };
  }, [dispatch, anchorType, anchorId, generation]);

  const reload = () => setGeneration((g) => g + 1);

  /** `row` is the record as the person saw it when editing — its version is the one sent. */
  const savePolicy = async (row: ParticipantOut, policy: ViewPolicy) => {
    const participant = row.participant;
    if (!participant) return;
    setState((s) => withParticipant(s, withPolicy(row, policy)));
    setSaving(row.id);
    const result = await dispatch(
      putParticipantPolicyCall({ anchorType, anchorId }, row.id, policy, participant.policy_version ?? null),
    );
    setSaving(null);
    if (result.error) {
      if (result.error.status === 409) {
        toast.error(`${participant.label}: changed elsewhere, reloaded`);
        reload();
        return;
      }
      setState((s) => withParticipant(s, row));
      toast.error(`${participant.label}: not saved. ${result.error.message}`);
      return;
    }
    setState((s) => withParticipant(s, result.data as ParticipantOut));
  };

  return { state, saving, savePolicy, reload };
}
