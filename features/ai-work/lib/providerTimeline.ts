import type { CxToolCallRecord } from "@/features/agents/redux/execution-system/observability/observability.slice";
import type { ProviderConversationMessage } from "./providerConversationMessage";

export type ProviderTimelineItem =
  | { kind: "message"; message: ProviderConversationMessage }
  | { kind: "activity"; records: CxToolCallRecord[] };

export interface ProviderTimelineInput {
  /** Loaded user-visible messages, ascending by position/created_at. */
  messages: ProviderConversationMessage[];
  /** Loaded chat.tool_call records, ascending by started_at. */
  toolCalls: CxToolCallRecord[];
  /** True when messages older than the loaded window still exist. */
  hasEarlierMessages: boolean;
  /** True when tool calls older than the loaded window still exist. */
  toolCallsHaveMore: boolean;
}

export interface ProviderTimeline {
  items: ProviderTimelineItem[];
  /** Loaded messages hidden below the honesty floor (partial overlap). */
  hiddenMessages: number;
  /** Loaded tool calls hidden below the honesty floor. */
  hiddenToolCalls: number;
}

function timeOf(value: string | null): number {
  if (!value) return Number.NEGATIVE_INFINITY;
  const parsed = Date.parse(value);
  return Number.isNaN(parsed) ? Number.NEGATIVE_INFINITY : parsed;
}

/**
 * Ordering rank at an identical timestamp: a user message precedes the tool
 * activity it triggered; an assistant message follows the activity that
 * produced it.
 */
function messageRank(message: ProviderConversationMessage): number {
  return message.role === "user" ? 0 : 2;
}

/**
 * Merges two independently paginated streams (messages by position, tool
 * calls by started_at) into one truthful timeline. THE HONESTY FLOOR: when
 * either stream has unloaded older rows, items from the OTHER stream older
 * than that boundary are withheld rather than rendered against a gap —
 * otherwise a message would appear to have no tool activity simply because
 * the activity page has not been loaded yet.
 */
export function buildProviderTimeline(
  input: ProviderTimelineInput,
): ProviderTimeline {
  const messageFloor = input.hasEarlierMessages
    ? timeOf(input.messages[0]?.created_at ?? null)
    : Number.NEGATIVE_INFINITY;
  const toolFloor = input.toolCallsHaveMore
    ? timeOf(input.toolCalls[0]?.startedAt ?? null)
    : Number.NEGATIVE_INFINITY;
  const displayFloor = Math.max(messageFloor, toolFloor);

  const messages = input.messages.filter(
    (message) => timeOf(message.created_at) >= displayFloor,
  );
  const toolCalls = input.toolCalls.filter(
    (record) => timeOf(record.startedAt) >= displayFloor,
  );

  const items: ProviderTimelineItem[] = [];
  let m = 0;
  let t = 0;
  while (m < messages.length || t < toolCalls.length) {
    const message = m < messages.length ? messages[m] : null;
    const record = t < toolCalls.length ? toolCalls[t] : null;
    const takeMessage =
      message !== null &&
      (record === null ||
        timeOf(message.created_at) < timeOf(record.startedAt) ||
        (timeOf(message.created_at) === timeOf(record.startedAt) &&
          messageRank(message) < 1));

    if (takeMessage && message) {
      items.push({ kind: "message", message });
      m += 1;
      continue;
    }
    if (record) {
      const last = items[items.length - 1];
      if (last && last.kind === "activity") {
        last.records.push(record);
      } else {
        items.push({ kind: "activity", records: [record] });
      }
      t += 1;
    }
  }

  return {
    items,
    hiddenMessages: input.messages.length - messages.length,
    hiddenToolCalls: input.toolCalls.length - toolCalls.length,
  };
}
