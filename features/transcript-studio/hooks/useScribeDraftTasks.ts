"use client";

/**
 * useScribeDraftTasks — turn a Scribe session's captured voice into reviewed
 * DRAFT tasks, reusing the existing UI-first plan/tasks flow (no parallel store).
 *
 * It arms the registered `update_plan` + `tasks` client-delegated tools on the
 * session's assistant conversation, then sends an instruction asking the agent
 * to extract actionable draft tasks from the session transcript — matched
 * against existing items to avoid duplicates — and propose them via
 * `update_plan`. The proposal lands as an Approve/Reject ask-card
 * (`PendingAsksZone`, already rendered in the Agent tab), so NOTHING is written
 * until the user approves; on approve it fans out to `cx_agent_task` (the
 * per-conversation "holding area"). The HARD review gate is the ask-card.
 *
 * Dual-model note: which agent does the extraction is the user's choice (the
 * AssistantAgentBar agent picker) — assign a fast agent for this and a larger
 * one for reasoning, the idiomatic agent-per-model approach. No model is
 * hardcoded here.
 */

import { useCallback } from "react";
import { useAppDispatch } from "@/lib/redux/hooks";
import { addClientTool } from "@/features/agents/redux/execution-system/instance-client-tools/instance-client-tools.slice";

/** Registered UI-first tools the draft-task flow needs (server-known names). */
const DRAFT_TASK_TOOLS = ["update_plan", "tasks"] as const;

export const DRAFT_TASKS_INSTRUCTION = `Review everything captured in this session so far (the transcripts in your context) and turn it into a concise set of actionable DRAFT tasks for my review.

Before proposing anything:
- Read the tasks already in your context (use the tasks tool) and AVOID DUPLICATES — if new input matches existing work, fold it in or skip it rather than creating a near-duplicate.
- Only propose genuinely new, actionable items. Group related items, and suggest a short tag and a likely project for each where you can infer it.

Then propose them with update_plan so I can review and approve before anything is created. Do NOT create or modify any real tasks without my approval — this is a draft for review.`;

export function useScribeDraftTasks(
  conversationId: string | null,
  send: (text: string) => unknown,
) {
  const dispatch = useAppDispatch();
  return useCallback(() => {
    if (!conversationId) return;
    for (const toolName of DRAFT_TASK_TOOLS) {
      dispatch(addClientTool({ conversationId, toolName }));
    }
    void send(DRAFT_TASKS_INSTRUCTION);
  }, [conversationId, send, dispatch]);
}
