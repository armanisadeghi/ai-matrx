"use client";
import { useClipboard } from "@ai-matrx/kit/clipboard";
import { copyNotify } from "@/lib/clipboard/copy-notify";
import { Button, Chip } from "@ai-matrx/design-system/controls";
import React, { useState } from "react";
import { HelpCircle, ChevronDown, ChevronUp, Copy, Check } from "lucide-react";
import { AGENT_ICON } from "@/components/icons/domain-icons";
import { KindValueFrontDoor } from "@/components/official/structured-value/KindValueFrontDoor";
import {
  rootKindSlug,
  valueCarriesKind,
} from "@/features/content-ir/surfaces/json-kind-signal";
import { useReportKindAtRawRenderer } from "@/features/content-ir/surfaces/report-kind-at-raw-renderer";

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
  const { copyText } = useClipboard({
    notify: copyNotify,
  });
  const [isCopied, setIsCopied] = useState(false);
  const [aiCopied, setAiCopied] = useState(false);
  const [isExpanded, setIsExpanded] = useState(true);
  const pretty = JSON.stringify(data, null, 2);
  // A payload carrying `__kind` is a kind whatever its event type: it renders
  // through the one value door, never as this card's JSON dump (Arman,
  // 2026-09-30). The unregistered event type is still filed for the team.
  const kindPayload = valueCarriesKind(data);
  useReportKindAtRawRenderer(
    "UnknownDataEventBlock",
    kindPayload ? (rootKindSlug(data) ?? dataType) : null,
    kindPayload,
  );

  const handleCopy = async () => {
    if (!(await copyText(pretty))) return;
    setIsCopied(true);
    setTimeout(() => setIsCopied(false), 2000);
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
    if (!(await copyText(payload))) return;
    setAiCopied(true);
    setTimeout(() => setAiCopied(false), 2000);
  };

  if (kindPayload) {
    return (
      <div className="my-2 min-w-0">
        <KindValueFrontDoor value={data} />
      </div>
    );
  }

  return (
    <div className="rounded-lg border border-warning/50 bg-warning/5 my-2 overflow-hidden">
      <div className="flex items-center gap-2 px-3 py-2">
        <HelpCircle className="w-4 h-4 text-warning flex-shrink-0" />
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <span className="text-sm font-medium text-foreground">
              Unknown Data Event
            </span>
            <Chip tone="warning" label={dataType} />
          </div>
          <p className="text-xs text-muted-foreground mt-0.5">
            This data type is not yet registered. Expand to inspect, or Copy for
            AI to hand an agent the full context.
          </p>
        </div>
        <div className="flex items-center gap-1 flex-shrink-0">
          <Button
            variant="quiet"
            onClick={handleCopyForAi}
            title="Copy full failure context for an AI agent"
            icon={aiCopied ? <Check />  : <AGENT_ICON />}
          >
            Copy for AI
          </Button>
          <Button variant="quiet" icon={isCopied ? (
              <Check />
            ) : (
              <Copy />
            )} glyphTone={aiCopied ? "success" : undefined} onClick={handleCopy} title="Copy JSON" aria-label="Copy JSON" />
          <Button variant="quiet" icon={isExpanded ? (
              <ChevronUp />
            ) : (
              <ChevronDown />
            )} onClick={() => setIsExpanded((v) => !v)} aria-label={isExpanded ? "Collapse" : "Expand"} aria-expanded={isExpanded} />
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
