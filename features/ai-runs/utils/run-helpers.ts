// @ts-nocheck

import type { AiRun, RunMessage, AiTask } from "../types";
import { idMatchesQuery } from "@/utils/search-scoring";

/**
 * Helper functions for working with AI runs
 */

/**
 * Get the last message from a run
 */
export function getLastMessage(run: AiRun): RunMessage | null {
  if (!run.messages || run.messages.length === 0) return null;
  return run.messages[run.messages.length - 1];
}

/**
 * Get the last user message from a run
 */
export function getLastUserMessage(run: AiRun): RunMessage | null {
  if (!run.messages) return null;

  for (let i = run.messages.length - 1; i >= 0; i--) {
    if (run.messages[i].role === "user") {
      return run.messages[i];
    }
  }

  return null;
}

/**
 * Get the last assistant message from a run
 */
export function getLastAssistantMessage(run: AiRun): RunMessage | null {
  if (!run.messages) return null;

  for (let i = run.messages.length - 1; i >= 0; i--) {
    if (run.messages[i].role === "assistant") {
      return run.messages[i];
    }
  }

  return null;
}

/**
 * Check if a run has any messages
 */
export function hasMessages(run: AiRun): boolean {
  return run.messages && run.messages.length > 0;
}

/**
 * Count messages by role
 */
export function countMessagesByRole(run: AiRun): Record<string, number> {
  if (!run.messages) return {};

  return run.messages.reduce(
    (acc, msg) => {
      acc[msg.role] = (acc[msg.role] || 0) + 1;
      return acc;
    },
    {} as Record<string, number>,
  );
}

/**
 * Get total tokens from messages metadata
 */
export function getTotalTokensFromMessages(run: AiRun): number {
  if (!run.messages) return 0;

  return run.messages.reduce((total, msg) => {
    return total + (msg.metadata?.tokens || 0);
  }, 0);
}

/**
 * Get total cost from messages metadata
 */
export function getTotalCostFromMessages(run: AiRun): number {
  if (!run.messages) return 0;

  return run.messages.reduce((total, msg) => {
    return total + (msg.metadata?.cost || 0);
  }, 0);
}

/**
 * Get average response time from messages
 */
export function getAverageResponseTime(run: AiRun): number | null {
  if (!run.messages) return null;

  const responseTimes = run.messages
    .filter((msg) => msg.role === "assistant" && msg.metadata?.totalTime)
    .map((msg) => msg.metadata!.totalTime);

  if (responseTimes.length === 0) return null;

  const sum = responseTimes.reduce((a, b) => a! + b!, 0);
  return Math.round(sum! / responseTimes.length);
}

/**
 * Check if run is empty (no messages)
 */
export function isRunEmpty(run: AiRun): boolean {
  return !run.messages || run.messages.length === 0;
}

/**
 * Check if run is in progress (has pending/streaming tasks)
 */
export function isRunInProgress(tasks: AiTask[]): boolean {
  return tasks.some(
    (task) => task.status === "pending" || task.status === "streaming",
  );
}

/**
 * Get failed tasks from a run
 */
export function getFailedTasks(tasks: AiTask[]): AiTask[] {
  return tasks.filter((task) => task.status === "failed");
}

/**
 * Format run duration (time between first and last message)
 */
export function getRunDuration(run: AiRun): string | null {
  if (!run.messages || run.messages.length < 2) return null;

  const firstMsg = run.messages[0];
  const lastMsg = run.messages[run.messages.length - 1];

  const start = new Date(firstMsg.timestamp).getTime();
  const end = new Date(lastMsg.timestamp).getTime();
  const durationMs = end - start;

  if (durationMs < 60000) {
    return "< 1 minute";
  } else if (durationMs < 3600000) {
    const minutes = Math.floor(durationMs / 60000);
    return `${minutes} minute${minutes > 1 ? "s" : ""}`;
  } else {
    const hours = Math.floor(durationMs / 3600000);
    const minutes = Math.floor((durationMs % 3600000) / 60000);
    return `${hours}h ${minutes}m`;
  }
}

/**
 * Get run summary stats
 */
export function getRunStats(run: AiRun) {
  const messageCounts = countMessagesByRole(run);
  const lastMessage = getLastMessage(run);
  const avgResponseTime = getAverageResponseTime(run);
  const duration = getRunDuration(run);

  return {
    totalMessages: run.message_count,
    userMessages: messageCounts["user"] || 0,
    assistantMessages: messageCounts["assistant"] || 0,
    totalTokens: run.total_tokens,
    totalCost: run.total_cost,
    taskCount: run.task_count,
    lastMessage,
    lastMessageTime: lastMessage?.timestamp,
    avgResponseTime,
    duration,
    isEmpty: isRunEmpty(run),
  };
}

/**
 * Sort runs by date (newest first)
 */
export function sortRunsByDate(
  runs: AiRun[],
  field: "created_at" | "last_message_at" = "last_message_at",
): AiRun[] {
  return [...runs].sort((a, b) => {
    const dateA = new Date(a[field]).getTime();
    const dateB = new Date(b[field]).getTime();
    return dateB - dateA; // Descending (newest first)
  });
}

/**
 * Group runs by date
 */
export function groupRunsByDate(runs: AiRun[]): Record<string, AiRun[]> {
  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const yesterday = new Date(today);
  yesterday.setDate(yesterday.getDate() - 1);
  const lastWeek = new Date(today);
  lastWeek.setDate(lastWeek.getDate() - 7);

  const groups: Record<string, AiRun[]> = {
    Today: [],
    Yesterday: [],
    "Last 7 days": [],
    Older: [],
  };

  runs.forEach((run) => {
    const runDate = new Date(run.last_message_at);

    if (runDate >= today) {
      groups["Today"].push(run);
    } else if (runDate >= yesterday) {
      groups["Yesterday"].push(run);
    } else if (runDate >= lastWeek) {
      groups["Last 7 days"].push(run);
    } else {
      groups["Older"].push(run);
    }
  });

  // Remove empty groups
  Object.keys(groups).forEach((key) => {
    if (groups[key].length === 0) {
      delete groups[key];
    }
  });

  return groups;
}

/**
 * Filter runs by search query
 */
export function filterRunsBySearch(runs: AiRun[], query: string): AiRun[] {
  if (!query || query.trim() === "") return runs;

  const lowerQuery = query.toLowerCase();

  return runs.filter((run) => {
    // Search in name
    if (run.name?.toLowerCase().includes(lowerQuery)) return true;

    // Search in description
    if (run.description?.toLowerCase().includes(lowerQuery)) return true;

    // Search in tags
    if (run.tags.some((tag) => tag.toLowerCase().includes(lowerQuery)))
      return true;

    // Search in messages content
    if (
      run.messages.some((msg) => msg.content.toLowerCase().includes(lowerQuery))
    )
      return true;

    // Search in run id (full or partial UUID paste)
    if (idMatchesQuery(run, lowerQuery)) return true;

    return false;
  });
}

/**
 * Create a preview text from run (for lists)
 */
export function getRunPreview(run: AiRun, maxLength: number = 100): string {
  const lastMsg = getLastAssistantMessage(run) || getLastUserMessage(run);

  if (!lastMsg) return "No messages yet";

  let preview = lastMsg.content.trim();

  // Remove markdown
  preview = preview.replace(/[#*_`]/g, "");

  // Truncate
  if (preview.length > maxLength) {
    preview = preview.substring(0, maxLength).trim() + "...";
  }

  return preview || "No content";
}

/**
 * Check if runs are from the same source
 */
export function isSameSource(run1: AiRun, run2: AiRun): boolean {
  return (
    run1.source_type === run2.source_type && run1.source_id === run2.source_id
  );
}
