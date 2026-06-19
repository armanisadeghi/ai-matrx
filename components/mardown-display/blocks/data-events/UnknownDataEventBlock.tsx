"use client";
import React, { useState } from "react";
import { HelpCircle, ChevronDown, ChevronUp, Copy, Check, Bot } from "lucide-react";

export interface UnknownDataEventBlockProps {
  dataType: string;
  data: Record<string, unknown>;
  /** Provenance for the "Copy for AI" payload — threaded by BlockRenderer. */
  conversationId?: string;
  messageId?: string;
}

/**
 * Catchall block rendered when a `data` event arrives whose `type` is not
 * registered. Every field is visible so the team can immediately see what
 * arrived. The "Copy for AI" button wraps the full failure context (page,
 * conversation/message id, error, payload) in an XML-ish block an agent can act
 * on cold — the canonical failure-reporting affordance for the artifact system.
 */
const UnknownDataEventBlock: React.FC<UnknownDataEventBlockProps> = ({
  dataType,
  data,
  conversationId,
  messageId,
}) => {
  const [isCopied, setIsCopied] = useState(false);
  const [aiCopied, setAiCopied] = useState(false);
  const [isExpanded, setIsExpanded] = useState(true);
  const pretty = JSON.stringify(data, null, 2);

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(pretty);
      setIsCopied(true);
      setTimeout(() => setIsCopied(false), 2000);
    } catch {
      /* silent */
    }
  };

  const handleCopyForAi = async () => {
    const page =
      typeof window !== "undefined" ? window.location.href : "(unknown)";
    const payload = [
      `<artifact_failure>`,
      `  <error>Render-block failure: data type "${dataType}" is not registered — it fell through to the Unknown Data Event fallback (normalize-content-blocks.ts → makeUnknown).</error>`,
      `  <page>${page}</page>`,
      `  <conversation_id>${conversationId ?? "(unknown)"}</conversation_id>`,
      `  <message_id>${messageId ?? "(unknown)"}</message_id>`,
      `  <data_type>${dataType}</data_type>`,
      `  <payload>`,
      pretty,
      `  </payload>`,
      `  <instructions>This is an AI Matrx artifact/canvas system failure. Diagnose why this block was not recognized and routed to its renderer (likely a save/find shape mismatch). Fix the recognition so it renders correctly and never falls to Unknown Data Event.</instructions>`,
      `</artifact_failure>`,
    ].join("\n");
    try {
      await navigator.clipboard.writeText(payload);
      setAiCopied(true);
      setTimeout(() => setAiCopied(false), 2000);
    } catch {
      /* silent */
    }
  };

  return (
    <div className="rounded-lg border border-warning/50 bg-warning/5 my-2 overflow-hidden">
      <div className="flex items-center gap-2 px-3 py-2">
        <HelpCircle className="w-4 h-4 text-warning flex-shrink-0" />
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <span className="text-sm font-medium text-foreground">
              Unknown Data Event
            </span>
            <span className="text-xs font-mono px-1.5 py-0.5 rounded bg-warning/15 text-warning font-medium">
              {dataType}
            </span>
          </div>
          <p className="text-xs text-muted-foreground mt-0.5">
            This data type is not yet registered. Expand to inspect, or Copy for
            AI to hand an agent the full context.
          </p>
        </div>
        <div className="flex items-center gap-1 flex-shrink-0">
          <button
            onClick={handleCopyForAi}
            className="flex items-center gap-1 px-2 py-1 rounded text-xs font-medium bg-primary/10 text-primary hover:bg-primary/20"
            title="Copy full failure context for an AI agent"
          >
            {aiCopied ? (
              <Check className="w-3.5 h-3.5 text-success" />
            ) : (
              <Bot className="w-3.5 h-3.5" />
            )}
            <span>Copy for AI</span>
          </button>
          <button
            onClick={handleCopy}
            className="p-1 rounded hover:bg-muted/50 text-muted-foreground hover:text-foreground"
            title="Copy JSON"
          >
            {isCopied ? (
              <Check className="w-3.5 h-3.5 text-success" />
            ) : (
              <Copy className="w-3.5 h-3.5" />
            )}
          </button>
          <button
            onClick={() => setIsExpanded((v) => !v)}
            className="p-1 rounded hover:bg-muted/50 text-muted-foreground hover:text-foreground"
          >
            {isExpanded ? (
              <ChevronUp className="w-3.5 h-3.5" />
            ) : (
              <ChevronDown className="w-3.5 h-3.5" />
            )}
          </button>
        </div>
      </div>
      {isExpanded && (
        <div className="border-t border-border/40 px-3 py-2">
          <pre className="text-xs text-muted-foreground overflow-auto max-h-60 leading-relaxed font-mono">
            {pretty}
          </pre>
        </div>
      )}
    </div>
  );
};

export default UnknownDataEventBlock;
