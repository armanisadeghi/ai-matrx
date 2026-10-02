/**
 * THE ONE place a LAUNCH writes into a conversation's model-override layer.
 *
 * Everything a launch writes here (the caller's `config.llmOverrides`, a
 * shortcut's `llmOverrides`, and on the basic-chat door the person's
 * `agents.model_prefs.chat_default_model` preference) is a launch default for
 * THIS conversation's agent. None of it is a choice the person made in the
 * picker for this conversation, so it is written as SEEDED: an agent switch
 * never carries it to another agent (W-81, PB-07 2026-10-01 — admin's Gemini
 * default rode a Search-agents switch into a Claude Sonnet agent's run).
 */

import type { AppDispatch } from "@host/lib/redux/store";
import type { FeLlmParams } from "../../../types/agent-api-types";
import {
  isBasicWorkMandate,
  resolvePreferredChatModel,
} from "@host/features/ai-models/preferredChatModel";
import { seedOverrides } from "./instance-model-overrides.slice";

export async function applyLaunchModelOverrides(
  dispatch: AppDispatch,
  {
    conversationId,
    mandateKey,
    llmOverrides: callerOverrides,
  }: {
    conversationId: string;
    mandateKey?: string;
    llmOverrides?: Partial<FeLlmParams> | null;
  },
): Promise<void> {
  const llmOverrides: Partial<FeLlmParams> = { ...callerOverrides };
  // THE PERSON'S OWN DEFAULT MODEL FOR BASIC WORK: honoured ONLY on the
  // basic-chat door, and only when the caller named no model. Null = platform
  // default = no override.
  if (isBasicWorkMandate(mandateKey) && !llmOverrides.model) {
    const preferred = await resolvePreferredChatModel();
    if (preferred) llmOverrides.model = preferred;
  }
  if (Object.keys(llmOverrides).length > 0) {
    dispatch(seedOverrides({ conversationId, changes: llmOverrides }));
  }
}
