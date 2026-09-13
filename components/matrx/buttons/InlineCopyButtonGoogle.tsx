"use client";

import { useAlchemyDisclosure } from "@/components/agent-copy/useAlchemyDisclosure";

import { useId, type ReactElement } from "react";
import { ContentTransferMenu } from "@ai-matrx/design-system/content-transfer";
import {
  directSource,
  normalizeTransferJson,
  type TransferOutcome,
} from "@ai-matrx/kit/content-transfer";
import { cn } from "@/lib/utils";

type Position =
  | "top-right"
  | "top-left"
  | "bottom-right"
  | "bottom-left"
  | "center-right"
  | "center-left";
type Size = "xs" | "sm" | "md" | "lg" | "xl";

const positions: Record<Position, string> = {
  "top-right": "absolute top-1 right-1",
  "top-left": "absolute top-1 left-1",
  "bottom-right": "absolute bottom-1 right-1",
  "bottom-left": "absolute bottom-1 left-1",
  "center-right": "absolute top-1/2 right-1 -translate-y-1/2",
  "center-left": "absolute top-1/2 left-1 -translate-y-1/2",
};

export interface InlineCopyButtonGoogleProps {
  content: string | object;
  position?: Position;
  size?: Size;
  className?: string;
  /** Alchemy owns trigger hint presentation; retained for call-site compatibility. */
  showTooltip?: boolean;
  tooltipText?: string;
  /** Alchemy owns success notice duration; retained for call-site compatibility. */
  successDuration?: number;
  formatJson?: boolean;
  isMarkdown?: boolean;
  /** Retained so callers keep compiling; Alchemy exposes Google Docs as a format choice. */
  googleDocsFormat?: boolean;
  onCopySuccess?: () => void;
  onCopyError?: (error: unknown) => void;
  /** Optional durable host identity. Without one, identity is stable for this mount. */
  sourceId?: string;
}

/**
 * Shared adapter for inline plain, structured, and Google-aware content.
 *
 * Markdown is passed as markdown so Alchemy can offer rich/Google Docs copy;
 * JSON is passed as JSON so formatting stays semantic instead of pre-serialized.
 */
export function InlineCopyButton({
  content,
  position = "top-right",
  size = "sm",
  className,
  showTooltip: _showTooltip = true,
  tooltipText = "Copy to clipboard",
  successDuration: _successDuration = 2000,
  formatJson = true,
  isMarkdown = false,
  googleDocsFormat: _googleDocsFormat = false,
  onCopySuccess,
  onCopyError,
  sourceId,
}: InlineCopyButtonGoogleProps): ReactElement {
  useAlchemyDisclosure();
  const instanceId = useId();
  const stableSourceId = sourceId ?? `inline-copy:${instanceId}`;
  const parsed =
    typeof content === "string" && formatJson ? tryJson(content) : null;
  const getPayload = () => {
    if (isMarkdown && typeof content === "string") {
      return { kind: "markdown" as const, text: content };
    }
    if (typeof content === "string") {
      return parsed?.ok
        ? { kind: "json" as const, value: normalizeTransferJson(parsed.value) }
        : { kind: "text" as const, text: content };
    }
    return { kind: "json" as const, value: normalizeTransferJson(content) };
  };
  const report = (outcome: TransferOutcome) => {
    if (outcome.status === "success" && outcome.delivered === "clipboard")
      onCopySuccess?.();
    if (outcome.status === "error") onCopyError?.(new Error(outcome.message));
  };

  return (
    <div
      className={cn(
        positions[position],
        "inline-flex z-10",
        size === "xs" && "matrx-alchemy-xs",
        size === "sm" && "matrx-alchemy-sm",
        className,
      )}
    >
      <ContentTransferMenu
        source={{
          id: stableSourceId,
          label: tooltipText,
          capture: async () =>
            directSource(getPayload(), {
              id: stableSourceId,
              sourceId: stableSourceId,
              revision: JSON.stringify(content),
              label: tooltipText,
            }),
        }}
        label={tooltipText}
        capabilities={{ onOutcome: report }}
      />
    </div>
  );
}

function tryJson(value: string): { ok: true; value: unknown } | { ok: false } {
  try {
    return { ok: true, value: JSON.parse(value) };
  } catch {
    return { ok: false };
  }
}

export default InlineCopyButton;
