"use client";

import { useMemo } from "react";
import { useAppSelector } from "@/lib/redux/hooks";
import { selectConversationMessages } from "@/features/agents/redux/execution-system/messages/messages.selectors";
import type { MessageRecord } from "@/features/agents/redux/execution-system/messages/messages.slice";
import { WORKING_DOCUMENT_CONTEXT_KEY } from "@/features/agents/utils/workingDocumentContext";

export interface WorkingDocumentTurnSnapshot {
  id: string;
  label: string;
  content: string;
  createdAt: string | null;
  turnIndex: number;
}

function norm(s: string): string {
  return s
    .replace(/\r\n/g, "\n")
    .replace(/[ \t]+$/gm, "")
    .trim();
}

function extractWorkingDocContent(value: unknown): string | null {
  if (typeof value === "string") return value;
  if (value && typeof value === "object" && "content" in value) {
    const content = (value as { content?: unknown }).content;
    if (typeof content === "string") return content;
  }
  return null;
}

function snapshotFromMessage(
  record: MessageRecord,
  turnIndex: number,
): WorkingDocumentTurnSnapshot | null {
  const items = record.modelContext?.items ?? [];
  for (const item of items) {
    if (item.key !== WORKING_DOCUMENT_CONTEXT_KEY) continue;
    const content = extractWorkingDocContent(item.value);
    if (content == null) continue;
    return {
      id: `${record.id}:working_document`,
      label: `Turn ${turnIndex + 1}`,
      content,
      createdAt: record.createdAt ?? null,
      turnIndex,
    };
  }
  return null;
}

/** Per-turn working-document snapshots frozen on user messages in this thread. */
export function useWorkingDocumentTurnSnapshots(
  conversationId: string,
  currentContent: string,
): WorkingDocumentTurnSnapshot[] {
  const messages = useAppSelector(selectConversationMessages(conversationId));

  return useMemo(() => {
    const out: WorkingDocumentTurnSnapshot[] = [];
    let userTurn = 0;

    for (const record of messages) {
      if (record.role !== "user") continue;
      const snap = snapshotFromMessage(record, userTurn);
      userTurn += 1;
      if (!snap) continue;
      const prev = out[out.length - 1];
      if (prev && norm(prev.content) === norm(snap.content)) continue;
      out.push(snap);
    }

    const trimmedCurrent = currentContent.trim();
    if (trimmedCurrent) {
      const last = out[out.length - 1];
      if (!last || norm(last.content) !== norm(currentContent)) {
        out.push({
          id: "current",
          label: "Current",
          content: currentContent,
          createdAt: null,
          turnIndex: userTurn,
        });
      } else if (last.id !== "current") {
        out[out.length - 1] = { ...last, id: "current", label: "Current" };
      }
    }

    return out;
  }, [messages, currentContent]);
}
