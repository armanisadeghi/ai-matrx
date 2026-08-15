"use client";

import { createContext, useContext, useEffect } from "react";
import MarkdownStream, {
  type MarkdownStreamProps,
} from "@/components/MarkdownStream";

export interface AgentAppStreamRuntime {
  response: string;
  requestId: string | null;
  conversationId: string | null;
  isStreaming: boolean;
}

const AgentAppStreamContext = createContext<AgentAppStreamRuntime | null>(null);

export function AgentAppStreamProvider({
  value,
  children,
}: {
  value: AgentAppStreamRuntime;
  children: React.ReactNode;
}) {
  return (
    <AgentAppStreamContext.Provider value={value}>
      {children}
    </AgentAppStreamContext.Provider>
  );
}

/**
 * Supply the host's live request identity when generated code renders the
 * current response with MarkdownStream. The equality gate keeps historical
 * message renderers independent: only the exact live response inherits the
 * active request and streaming state.
 */
export function resolveAgentAppMarkdownStreamProps(
  props: MarkdownStreamProps,
  runtime: AgentAppStreamRuntime | null,
): MarkdownStreamProps {
  if (!runtime || props.content !== runtime.response) return props;

  return {
    ...props,
    requestId: props.requestId ?? runtime.requestId ?? undefined,
    conversationId: props.conversationId ?? runtime.conversationId ?? undefined,
    isStreamActive: runtime.isStreaming || props.isStreamActive === true,
  };
}

/**
 * MarkdownStream exposed inside generated Agent App code. Generated code may
 * omit requestId/isStreamActive; the host still routes incremental Shape IR
 * through the canonical renderer instead of flashing raw JSON until EOF.
 */
export function AgentAppMarkdownStream(props: MarkdownStreamProps) {
  const runtime = useContext(AgentAppStreamContext);
  const isLiveResponse = Boolean(runtime && props.content === runtime.response);
  const recoveredRequestId = isLiveResponse && !props.requestId;
  const recoveredStreamingState =
    isLiveResponse && runtime?.isStreaming === true && !props.isStreamActive;

  useEffect(() => {
    if (!recoveredRequestId && !recoveredStreamingState) return;
    console.warn(
      "[AgentAppMarkdownStream] Generated component omitted live stream context; the host recovered it. Regenerate this component against the Agent App generator contract.",
      {
        recoveredRequestId,
        recoveredStreamingState,
      },
    );
  }, [recoveredRequestId, recoveredStreamingState]);

  return (
    <MarkdownStream {...resolveAgentAppMarkdownStreamProps(props, runtime)} />
  );
}
