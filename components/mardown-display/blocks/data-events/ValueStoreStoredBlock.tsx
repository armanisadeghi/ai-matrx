"use client";
import React from "react";
import { Database } from "lucide-react";
import MatrxEnvelopeBlock from "@/features/matrx-envelope/MatrxEnvelopeBlock";
import { parseReferenceFence } from "@/features/matrx-envelope/referenceFence";

/**
 * ValueStoreStoredBlock — the compact "result ready" card for a
 * `value_store.stored` stream event (Conversation Value Store, Pattern 2).
 *
 * A sub-agent's result landed in `chat.conversation_value`; the orchestrator
 * only received the bounded descriptor. This card shows key + description +
 * size, and renders the descriptor's ready-made ```matrx reference fence via
 * the canonical envelope chip renderer — NEVER as prose or a code block.
 *
 * Contract: aidream services/conversation_values/FEATURE.md +
 * docs/cx_chat/FE_HANDOFF_AGENT_PATTERNS.md §3.
 */
export interface ValueStoreStoredBlockProps {
  /** The `descriptor` off the ValueStoredEvent payload (loosely typed at the
   * block boundary — BlockRenderer reads it from the open serverData bag). */
  descriptor: {
    key?: string;
    description?: string;
    kind?: string;
    chars?: number;
    truncated?: boolean;
    fence?: string;
  };
}

function formatChars(chars: number): string {
  if (chars >= 1_000_000) return `${(chars / 1_000_000).toFixed(1)}M chars`;
  if (chars >= 1_000) return `${(chars / 1_000).toFixed(1)}K chars`;
  return `${chars} chars`;
}

const ValueStoreStoredBlock: React.FC<ValueStoreStoredBlockProps> = ({
  descriptor,
}) => {
  const { key, description, kind, chars, truncated, fence } = descriptor;
  // The fence arrives as a full ```matrx block — route it through the
  // canonical envelope pipeline (parse → registry → chips / neutral card).
  const parsedFence = fence ? parseReferenceFence(fence) : null;

  return (
    <div className="my-2 rounded-md border border-border bg-card px-3 py-2 text-sm">
      <div className="flex items-center gap-2">
        <Database className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
        <span className="font-medium text-foreground">Result ready</span>
        {key && (
          <code className="rounded bg-muted px-1.5 py-0.5 text-xs text-foreground">
            {key}
          </code>
        )}
        <span className="ml-auto text-xs text-muted-foreground">
          {kind ? `${kind} · ` : ""}
          {typeof chars === "number" ? formatChars(chars) : ""}
          {truncated ? " · truncated" : ""}
        </span>
      </div>
      {description && (
        <div className="mt-1 text-xs text-muted-foreground">{description}</div>
      )}
      {fence && (
        <div className="mt-1.5">
          {parsedFence ? (
            <MatrxEnvelopeBlock content={parsedFence.envelope} />
          ) : (
            <MatrxEnvelopeBlock content={fence} />
          )}
        </div>
      )}
    </div>
  );
};

export default ValueStoreStoredBlock;
