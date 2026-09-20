import type { ConversationBattleFork } from "./types";

interface CreateConversationBattleForksArgs {
  count: number;
  firstForkNumber: number;
  sourceTitle: string;
  forkConversation: (title: string) => Promise<{
    conversationId: string;
    loadError?: string;
  }>;
  createColumnId?: () => string;
}

export interface CreateConversationBattleForksResult {
  created: ConversationBattleFork[];
  failures: unknown[];
}

/**
 * Fork all contenders independently and retain partial success. A battle with
 * three requested columns should still show the two durable forks that were
 * created if the third request fails.
 */
export async function createConversationBattleForks({
  count,
  firstForkNumber,
  sourceTitle,
  forkConversation,
  createColumnId = () => crypto.randomUUID(),
}: CreateConversationBattleForksArgs): Promise<CreateConversationBattleForksResult> {
  const results = await Promise.allSettled(
    Array.from({ length: count }, (_, offset) => {
      const forkNumber = firstForkNumber + offset;
      return forkConversation(
        `${sourceTitle} — Battle fork ${forkNumber}`,
      ).then((result): ConversationBattleFork => ({
        columnId: createColumnId(),
        conversationId: result.conversationId,
        label: `Fork ${forkNumber}`,
        ...(result.loadError ? { loadError: result.loadError } : {}),
      }));
    }),
  );

  return results.reduce<CreateConversationBattleForksResult>(
    (summary, result) => {
      if (result.status === "fulfilled") {
        summary.created.push(result.value);
      } else {
        summary.failures.push(result.reason);
      }
      return summary;
    },
    { created: [], failures: [] },
  );
}
