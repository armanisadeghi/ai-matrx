// components/admin/markdown-tester/utils/run-server-parser.ts
// One-shot call to the Python `block-processing/process` endpoint.
// Returns the server's render-block list, normalized to the same
// `RenderBlockPayload` shape used by the streaming Redux accumulator,
// so byte-equality comparisons against the local parsers are valid.

import { ENDPOINTS } from "@/lib/api/endpoints";
import { requestRaw } from "@/lib/python-client";
import type { RenderBlockPayload } from "@ai-matrx/agents/generated/stream-events";

export interface RunServerParserOptions {
  /**
   * @deprecated Ignored. The host door (`requestRaw`) resolves the active
   * server; callers should stop passing it.
   */
  baseUrl?: string;
  /** @deprecated Ignored. The host door adds Authorization. */
  authToken?: string | null;
  /** @deprecated Ignored. The host door adds Authorization + X-Organization-Id. */
  authHeaders?: Record<string, string> | null;
  signal?: AbortSignal;
}

export interface ServerParseResult {
  blocks: RenderBlockPayload[];
  rawResponse: string;
}

function normalizeBlock(
  block: Record<string, unknown>,
  fallbackIndex: number,
): RenderBlockPayload {
  const blockId =
    (block.blockId as string | undefined) ??
    (block.block_id as string | undefined) ??
    `server-block-${fallbackIndex}`;
  const blockIndex =
    (block.blockIndex as number | undefined) ??
    (block.block_index as number | undefined) ??
    fallbackIndex;
  return {
    blockId,
    blockIndex,
    type: (block.type as string) ?? "text",
    status: "complete",
    content: (block.content ?? null) as string | null,
    data: (block.data ?? null) as Record<string, unknown> | null,
    metadata: (block.metadata ?? {}) as Record<string, unknown>,
  };
}

export async function runServerParser(
  content: string,
  options: RunServerParserOptions,
): Promise<ServerParseResult> {
  // The host door resolves the server, adds auth + organization headers, and
  // throws a classified BackendApiError on a non-2xx (read its sentence with
  // `getUserMessage`).
  const res = await requestRaw(
    ENDPOINTS.blockProcessing.process,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ content }),
    },
    { signal: options.signal },
  );
  const rawResponse = await res.text();
  const parsed = JSON.parse(rawResponse) as {
    blocks?: Record<string, unknown>[];
  };
  const blocks = (parsed.blocks ?? []).map((b, i) => normalizeBlock(b, i));
  return { blocks, rawResponse };
}
