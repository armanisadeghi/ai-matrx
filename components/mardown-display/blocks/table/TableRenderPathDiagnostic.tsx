"use client";

import { AlertTriangle } from "lucide-react";
import { useAppSelector } from "@/lib/redux/hooks";
import { selectIsAdmin } from "@/lib/redux/selectors/userSelectors";

export interface TableRenderDiagnosticContext {
  /** Block type that routed here (usually "text"). */
  blockType: string;
  /** Where in the pipeline this markdown table was rendered. */
  renderPath: "BasicMarkdownContent";
  conversationId?: string;
  messageId?: string;
  requestId?: string;
  surfaceKey?: string;
  /** First ~120 chars of the hosting block for identification. */
  contentPreview?: string;
}

interface TableRenderPathDiagnosticProps {
  context: TableRenderDiagnosticContext;
}

/**
 * Admin-only warning shown under tables that rendered through the markdown
 * fallback (react-markdown GFM) instead of StreamingTableRenderer / TableArtifact.
 */
export function TableRenderPathDiagnostic({
  context,
}: TableRenderPathDiagnosticProps) {
  const isAdmin = useAppSelector(selectIsAdmin);
  if (!isAdmin) return null;

  return (
    <div className="my-2 rounded-md border border-amber-500/60 bg-amber-50/90 px-3 py-2 text-xs text-amber-950 dark:bg-amber-950/40 dark:text-amber-100">
      <div className="mb-1 flex items-center gap-1.5 font-semibold">
        <AlertTriangle className="h-3.5 w-3.5 shrink-0" />
        Table render path diagnostic (admin)
      </div>
      <p className="mb-2 leading-relaxed opacity-90">
        This table was rendered by{" "}
        <code className="rounded bg-amber-200/60 px-1 dark:bg-amber-900/60">
          {context.renderPath}
        </code>{" "}
        (plain GFM HTML), not{" "}
        <code className="rounded bg-amber-200/60 px-1 dark:bg-amber-900/60">
          StreamingTableRenderer
        </code>
        . The block splitter did not promote it to{" "}
        <code className="rounded bg-amber-200/60 px-1 dark:bg-amber-900/60">
          type: &quot;table&quot;
        </code>{" "}
        before render.
      </p>
      <dl className="grid gap-1 font-mono text-[11px] leading-relaxed opacity-80">
        <div>
          <dt className="inline font-semibold">host block type: </dt>
          <dd className="inline">{context.blockType}</dd>
        </div>
        {context.surfaceKey ? (
          <div>
            <dt className="inline font-semibold">surfaceKey: </dt>
            <dd className="inline break-all">{context.surfaceKey}</dd>
          </div>
        ) : null}
        {context.conversationId ? (
          <div>
            <dt className="inline font-semibold">conversationId: </dt>
            <dd className="inline break-all">{context.conversationId}</dd>
          </div>
        ) : null}
        {context.messageId ? (
          <div>
            <dt className="inline font-semibold">messageId: </dt>
            <dd className="inline break-all">{context.messageId}</dd>
          </div>
        ) : null}
        {context.requestId ? (
          <div>
            <dt className="inline font-semibold">requestId: </dt>
            <dd className="inline break-all">{context.requestId}</dd>
          </div>
        ) : null}
        {context.contentPreview ? (
          <div>
            <dt className="inline font-semibold">block preview: </dt>
            <dd className="inline break-all">{context.contentPreview}</dd>
          </div>
        ) : null}
      </dl>
      <p className="mt-2 leading-relaxed opacity-75">
        Likely causes: Redux client <code>text</code> block skipped re-split
        (processedBlocks path), DB text fragment without header+separator in the
        same part, or malformed table markdown (rows must start with{" "}
        <code>|</code>).
      </p>
    </div>
  );
}
