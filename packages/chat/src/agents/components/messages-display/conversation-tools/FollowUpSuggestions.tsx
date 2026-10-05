"use client";

/**
 * FollowUpSuggestions — the slot for "ask next" chips under the latest answer
 * (Perplexity related questions, ChatGPT / Gemini suggested prompts).
 *
 * INTEGRATION POINT (no producer exists yet — agents never author agents):
 * a producer writes an array of strings to the assistant cx_message's
 * `metadata.follow_up_suggestions` (the mandate that will produce them is
 * listed as missing in the rich-content register for Arman's agent loop).
 * Also read: `metadata.follow_up_questions` as `{question}` objects — the
 * shape the registered `follow_up_question` kind already uses.
 *
 * With no suggestions the slot renders NOTHING — never an empty shell.
 * A chip fills the composer and focuses it; the person reads, edits and sends
 * it themselves, so what goes out as `user_input` is theirs.
 */

import React from "react";
import { CornerDownRight } from "lucide-react";
import { useAppDispatch, useAppSelector } from "../../../../store/hooks";
import { selectMessageById } from "../../../redux/execution-system/messages/messages.selectors";
import { setUserInputText } from "../../../redux/execution-system/instance-user-input/instance-user-input.slice";
import { Tile } from "@ai-matrx/design-system/controls";

export const FOLLOW_UP_METADATA_KEY = "follow_up_suggestions";

export function readFollowUpSuggestions(metadata: unknown): string[] {
  if (!metadata || typeof metadata !== "object") return [];
  const m = metadata as Record<string, unknown>;
  const out: string[] = [];
  const push = (v: unknown) => {
    const q =
      typeof v === "string"
        ? v
        : v && typeof v === "object" && typeof (v as Record<string, unknown>).question === "string"
          ? ((v as Record<string, unknown>).question as string)
          : "";
    const t = q.trim();
    if (t && !out.includes(t)) out.push(t);
  };
  if (Array.isArray(m[FOLLOW_UP_METADATA_KEY])) (m[FOLLOW_UP_METADATA_KEY] as unknown[]).forEach(push);
  if (Array.isArray(m.follow_up_questions)) (m.follow_up_questions as unknown[]).forEach(push);
  return out.slice(0, 5);
}

export function FollowUpSuggestions({
  conversationId,
  messageId,
}: {
  conversationId: string;
  messageId: string;
}) {
  const dispatch = useAppDispatch();
  const record = useAppSelector(selectMessageById(conversationId, messageId));
  const suggestions = readFollowUpSuggestions(record?.metadata);
  if (suggestions.length === 0) return null;

  const pick = (text: string) => {
    dispatch(setUserInputText({ conversationId, text }));
    document.querySelector<HTMLTextAreaElement>("textarea[data-agent-main-input]")?.focus();
  };

  return (
    <nav aria-label="Suggested follow-up questions" className="mt-2 flex flex-col gap-1" data-find-ignore="">
      {suggestions.map((q) => (
        <Tile variant="quiet" icon={<CornerDownRight />} title={q} key={q} onClick={() => pick(q)} className="w-fit" />
      ))}
    </nav>
  );
}
