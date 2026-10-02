"use client";

/**
 * One message's flags, their per-model verdicts, and the toggle — the single
 * door every message header (user/assistant items and the system message) uses.
 */

import { useAppDispatch, useAppSelector } from "@/lib/redux/hooks";
import {
  selectAgentMessages,
  selectAgentModelId,
} from "@/features/agents/redux/agent-definition/selectors";
import { setAgentMessages } from "@/features/agents/redux/agent-definition/slice";
import { useModelFull } from "@/features/ai-models/hooks/useModels";
import { useSessionKnob } from "@/lib/scoped-config/sessionKnob";
import type { AgentDefinitionMessage } from "@/features/agents/types/agent-message-types";
import {
  FLAG_COMPATIBILITY_KNOB,
  cacheBoundaryVerdict,
  flagPlacementProblem,
  flagsOf,
  prefillVerdict,
  resolveFlagCompatibilityMode,
  toggleMessageFlag,
  type MessageFlagKey,
  type MessageFlags,
} from "./flags";
import type { FlagToggleState } from "./MessageFlagToggles";
import { useMessageFlagProfile } from "./useMessageFlagProfile";

export interface MessageFlagsController {
  flags: MessageFlags;
  states: Partial<Record<MessageFlagKey, FlagToggleState>>;
  onToggle: (flag: MessageFlagKey) => void;
}

export function useMessageFlags(agentId: string, messageIndex: number): MessageFlagsController {
  const dispatch = useAppDispatch();
  const messages = useAppSelector((state) => selectAgentMessages(state, agentId));
  const modelId = useAppSelector((state) => selectAgentModelId(state, agentId));
  const model = useModelFull(modelId);
  const profile = useMessageFlagProfile(modelId);
  const mode = resolveFlagCompatibilityMode(useSessionKnob(FLAG_COMPATIBILITY_KNOB));

  const list = messages ?? [];
  const message = list[messageIndex];
  const flags = flagsOf(message);
  const role = message?.role;
  const isLast = messageIndex === list.length - 1;

  const states: Partial<Record<MessageFlagKey, FlagToggleState>> = {
    cache_boundary: {
      verdict: cacheBoundaryVerdict(model, profile),
      placementProblem: flags.cache_boundary
        ? flagPlacementProblem(list, messageIndex, "cache_boundary")
        : null,
    },
    example: {
      hidden: role !== "user" && role !== "assistant",
      verdict: {
        verdict: "native",
        reason: "Sent as an ordinary turn; the paired user and assistant messages toggle together.",
      },
      placementProblem: flags.example ? flagPlacementProblem(list, messageIndex, "example") : null,
    },
    prefill: {
      // Absent unless it can be lawful here — or it is set and now misplaced,
      // so the author can see why and switch it off.
      hidden: !flags.prefill && !(role === "assistant" && isLast),
      verdict: prefillVerdict(model, mode),
      placementProblem: flags.prefill ? flagPlacementProblem(list, messageIndex, "prefill") : null,
    },
  };

  const onToggle = (flag: MessageFlagKey) => {
    if (!messages) return;
    dispatch(
      setAgentMessages({
        id: agentId,
        messages: toggleMessageFlag(messages, messageIndex, flag) as AgentDefinitionMessage[],
      }),
    );
  };

  return { flags, states, onToggle };
}
