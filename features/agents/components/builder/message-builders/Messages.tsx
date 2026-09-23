"use client";

import { RefObject, useState } from "react";
import { ChevronRight } from "lucide-react";
import { Skeleton } from "@ai-matrx/design-system";
import { useAppSelector } from "@/lib/redux/hooks";
import {
  selectAgentConversationMessageIndices,
  selectAgentMessages,
  selectAgentModelId,
} from "@/features/agents/redux/agent-definition/selectors";
import { MessageItem } from "@/features/agents/components/builder/message-builders/MessageItem";
import { exampleRuns, flagPreview } from "@/features/agents/message-flags/flags";
import { useMessageFlagProfile } from "@/features/agents/message-flags/useMessageFlagProfile";
import { MessageFlagsPreview } from "@/features/agents/message-flags/MessageFlagsPreview";
import { estimateTokensForText } from "@/lib/tokens/estimate";

interface MessagesProps {
  agentId: string;
  onOpenFullScreenEditor?: (messageIndex: number) => void;
  scrollContainerRef?: RefObject<HTMLDivElement | null>;
}

export function Messages({
  agentId,
  onOpenFullScreenEditor,
  scrollContainerRef,
}: MessagesProps) {
  const conversationIndices = useAppSelector((state) =>
    selectAgentConversationMessageIndices(state, agentId),
  );
  const messages = useAppSelector((state) => selectAgentMessages(state, agentId));
  const modelId = useAppSelector((state) => selectAgentModelId(state, agentId));
  const profile = useMessageFlagProfile(modelId);
  // Example runs start collapsed; the key is the run's first message index.
  const [expandedRuns, setExpandedRuns] = useState<Set<number>>(() => new Set());

  if (conversationIndices === undefined) {
    return <Skeleton className="h-24 w-full rounded-md" />;
  }

  const list = messages ?? [];
  const preview = flagPreview(list, profile);
  const runs = exampleRuns(list);
  const runOf = (index: number) => runs.find(([start, end]) => index >= start && index <= end);

  const toggleRun = (start: number) =>
    setExpandedRuns((prev) => {
      const next = new Set(prev);
      if (next.has(start)) next.delete(start);
      else next.add(start);
      return next;
    });

  const rows: React.ReactNode[] = [];
  for (const msgIndex of conversationIndices) {
    const run = runOf(msgIndex);
    if (run && msgIndex === run[0]) {
      const [start, end] = run;
      const expanded = expandedRuns.has(start);
      const count = end - start + 1;
      const pairs = Math.floor(count / 2);
      const tokens = list
        .slice(start, end + 1)
        .reduce(
          (sum, m) =>
            sum +
            estimateTokensForText(
              (m.content as Array<{ type?: string; text?: string }>)
                .map((b) => (b.type === "text" ? (b.text ?? "") : ""))
                .join(""),
            ),
          0,
        );
      rows.push(
        <button
          key={`examples-${start}`}
          type="button"
          onClick={() => toggleRun(start)}
          aria-expanded={expanded}
          data-testid="builder-example-run"
          className="flex w-full items-center gap-1.5 rounded-md bg-muted/60 px-2 py-1 text-left text-xs text-muted-foreground hover:bg-muted"
        >
          <ChevronRight
            className={`h-3.5 w-3.5 transition-transform ${expanded ? "rotate-90" : ""}`}
          />
          <span className="font-medium text-foreground">Examples</span>
          <span>
            {pairs > 0 ? `${pairs} ${pairs === 1 ? "pair" : "pairs"}` : `${count} messages`}
          </span>
          <span className="ml-auto tabular-nums">≈{tokens.toLocaleString()} tokens</span>
        </button>,
      );
      if (!expanded) continue;
    } else if (run && !expandedRuns.has(run[0])) {
      continue;
    }
    rows.push(
      <MessageItem
        key={msgIndex}
        messageIndex={msgIndex}
        agentId={agentId}
        onOpenFullScreenEditor={onOpenFullScreenEditor}
        scrollContainerRef={scrollContainerRef}
      />,
    );
  }

  return (
    <div className="space-y-2">
      <MessageFlagsPreview preview={preview} profile={profile} />
      {conversationIndices.length === 0 ? (
        <div className="rounded-lg border border-dashed border-border p-4 text-center">
          <p className="text-xs text-muted-foreground">
            No conversation examples yet. Add user/assistant message pairs to
            guide the agent.
          </p>
        </div>
      ) : (
        <div className="space-y-2 rounded-lg">{rows}</div>
      )}
    </div>
  );
}
