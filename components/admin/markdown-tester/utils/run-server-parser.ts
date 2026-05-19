// components/admin/markdown-tester/utils/run-server-parser.ts
// One-shot call to the Python `block-processing/process` endpoint.
// Returns the server's render-block list, normalized to the same
// `RenderBlockPayload` shape used by the streaming Redux accumulator,
// so byte-equality comparisons against the local parsers are valid.

import { ENDPOINTS } from "@/lib/api/endpoints";
import type { RenderBlockPayload } from "@/types/python-generated/stream-events";

export interface RunServerParserOptions {
  baseUrl: string;
  authToken?: string | null;
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
  const { baseUrl, authToken, signal } = options;
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
  };
  if (authToken) headers["Authorization"] = `Bearer ${authToken}`;

  const res = await fetch(`${baseUrl}${ENDPOINTS.blockProcessing.process}`, {
    method: "POST",
    headers,
    body: JSON.stringify({ content }),
    signal,
  });
  if (!res.ok) {
    const detail = await res
      .json()
      .catch(() => ({}) as Record<string, unknown>);
    const message =
      (detail as { detail?: string; message?: string }).detail ??
      (detail as { detail?: string; message?: string }).message ??
      `HTTP ${res.status}`;
    throw new Error(message);
  }
  const rawResponse = await res.text();
  const parsed = JSON.parse(rawResponse) as {
    blocks?: Record<string, unknown>[];
  };
  const blocks = (parsed.blocks ?? []).map((b, i) => normalizeBlock(b, i));
  return { blocks, rawResponse };
}
