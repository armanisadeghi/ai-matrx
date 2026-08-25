import type {
  AgentProjectionOperation,
  AgentProjectionRenderBlock,
  AgentProjectionTool,
  AgentRequestProjection,
} from "@ai-matrx/agents/projection/request";
import type { ActiveRequest } from "@/features/agents/types/request.types";

/**
 * The package's `answer` is the raw chunk channel. Matrix additionally folds
 * explicit server render blocks into its UI answer, but those blocks already
 * have their own portable parity field below. Compare like with like so a
 * code/image block is neither dropped nor counted twice.
 */
function projectRawChunkAnswer(request: ActiveRequest): string {
  const closedRuns = request.timeline.flatMap((entry) =>
    entry.kind === "text_end" ? [entry.rawText] : [],
  );
  if (request.isTextStreaming && request.currentTextRunRaw) {
    closedRuns.push(request.currentTextRunRaw);
  }
  return closedRuns.join("");
}

/**
 * Project Matrix's richer request row onto the framework-independent fields
 * owned by `@ai-matrx/agents`. This is a comparison boundary, not a second
 * runtime store: parity tests and migration diagnostics use it to prove which
 * fields can move without erasing Matrix-only persistence and host effects.
 */
export function projectMatrixRequestForPortableParity(
  request: ActiveRequest,
): AgentRequestProjection {
  const operations: Record<string, AgentProjectionOperation> = {};

  for (const operation of Object.values(request.activeOperations)) {
    operations[operation.operationId] = {
      operationId: operation.operationId,
      operation: operation.operation,
      parentOperationId: operation.parentOperationId ?? null,
      status: "active",
      metadata: operation.metadata ?? null,
      result: null,
    };
  }

  for (const operation of Object.values(request.completedOperations)) {
    operations[operation.operationId] = {
      operationId: operation.operationId,
      operation: operation.operation,
      parentOperationId: operation.parentOperationId ?? null,
      status:
        operation.status === "failed" || operation.status === "cancelled"
          ? operation.status
          : "success",
      metadata: operation.metadata ?? null,
      result: operation.result,
    };
  }

  const tools: Record<string, AgentProjectionTool> = {};
  for (const tool of Object.values(request.toolLifecycle)) {
    tools[tool.callId] = {
      callId: tool.callId,
      toolName: tool.toolName,
      status: tool.status === "result_preview" ? "preview" : tool.status,
      message: tool.latestMessage,
      data: tool.latestData,
    };
  }

  const renderBlocks: Record<string, AgentProjectionRenderBlock> = {};
  for (const [blockId, block] of Object.entries(request.renderBlocks)) {
    renderBlocks[blockId] = {
      blockId,
      blockIndex: block.blockIndex,
      type: block.type,
      status:
        block.status === "complete" || block.status === "error"
          ? block.status
          : "streaming",
      content: block.content ?? null,
      data: block.data ?? null,
      metadata: block.metadata ?? null,
    };
  }

  return {
    requestId: request.requestId,
    conversationId: request.conversationId,
    status:
      request.status === "timeout" || request.status === "connecting"
        ? "error"
        : request.status,
    answer: projectRawChunkAnswer(request),
    reasoning: request.accumulatedReasoning,
    reasoningActive: request.isReasoningStreaming,
    phase: request.currentPhase,
    phaseHistory: request.phaseHistory,
    operations,
    tools,
    renderBlocks,
    renderBlockOrder: request.renderBlockOrder,
    completion: request.completion ? { ...request.completion } : null,
    error: request.error ? { ...request.error } : null,
    lastTransportSeq: request.lastTransportSeq,
    // Matrix intentionally coalesces hot-path chunks and does not store one
    // universal event counter. The package owns this portable diagnostic.
    eventCount: 0,
  };
}

export interface PortableParityReport {
  shared: {
    requestId: boolean;
    conversationId: boolean;
    status: boolean;
    answer: boolean;
    reasoning: boolean;
    reasoningActive: boolean;
    phase: boolean;
    phaseHistory: boolean;
    operations: boolean;
    tools: boolean;
    explicitRenderBlocks: boolean;
    completion: boolean;
    error: boolean;
    lastTransportSeq: boolean;
  };
  matrixOnlyRenderBlockIds: string[];
}

const canonicalize = (value: unknown): unknown => {
  if (Array.isArray(value)) return value.map(canonicalize);
  if (value === null || typeof value !== "object") return value;
  return Object.fromEntries(
    Object.entries(value as Record<string, unknown>)
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([key, child]) => [key, canonicalize(child)]),
  );
};

const same = (left: unknown, right: unknown): boolean =>
  JSON.stringify(canonicalize(left)) === JSON.stringify(canonicalize(right));

/** Compare only fields both runtimes claim to own. */
export function compareMatrixRequestToPortableProjection(
  request: ActiveRequest,
  portable: AgentRequestProjection,
): PortableParityReport {
  const matrix = projectMatrixRequestForPortableParity(request);
  const explicitIds = portable.renderBlockOrder;
  const matrixExplicitBlocks = Object.fromEntries(
    explicitIds.flatMap((blockId) =>
      matrix.renderBlocks[blockId]
        ? [[blockId, matrix.renderBlocks[blockId]]]
        : [],
    ),
  );

  return {
    shared: {
      requestId: matrix.requestId === portable.requestId,
      conversationId: matrix.conversationId === portable.conversationId,
      status: matrix.status === portable.status,
      answer: matrix.answer === portable.answer,
      reasoning: matrix.reasoning === portable.reasoning,
      reasoningActive: matrix.reasoningActive === portable.reasoningActive,
      phase: matrix.phase === portable.phase,
      phaseHistory: same(matrix.phaseHistory, portable.phaseHistory),
      operations: same(matrix.operations, portable.operations),
      tools: same(matrix.tools, portable.tools),
      explicitRenderBlocks: same(matrixExplicitBlocks, portable.renderBlocks),
      completion: same(matrix.completion, portable.completion),
      error: same(matrix.error, portable.error),
      lastTransportSeq: matrix.lastTransportSeq === portable.lastTransportSeq,
    },
    matrixOnlyRenderBlockIds: matrix.renderBlockOrder.filter(
      (blockId) => !explicitIds.includes(blockId),
    ),
  };
}
