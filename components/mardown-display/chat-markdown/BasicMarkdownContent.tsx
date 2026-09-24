"use client";

// ─────────────────────────────────────────────────────────────────────────
// Part of the RICH DOCUMENT rendering engine (the "basement"). This is the
// minimal renderer variant.
//
// IMPORTANT: despite the react-markdown / remark imports below, this is NOT a
// thin markdown wrapper — it is one piece of a multi-thousand-line content
// runtime (interactive flashcards, live diagrams, wired task lists, tool-call
// traces, code surfaces, realtime feeds, plan viewers, …). Do not "simplify"
// it or swap it for a plugin.
//
// FRONT DOOR: prefer `<RichDocument>` (features/rich-document/RichDocument.tsx)
// — it wraps this engine and adds the action toolkit. See
// features/rich-document/FEATURE.md and the `rich-document-actions` skill.
// ─────────────────────────────────────────────────────────────────────────

import React from "react";
import MarkdownCore from "@/components/markdown-core/MarkdownCore";
import { PencilIcon } from "lucide-react";
import { useState, useMemo, useEffect } from "react";
import {
  guardMarkdownDelimiters,
  reportDelimiterViolations,
} from "@ai-matrx/kit/delimiter-guard";
import { captureError } from "@/lib/diagnostics/errorCaptureStore";
import { InlineCopyButton } from "@/components/matrx/buttons/MarkdownCopyButton";
import {
  TableRenderPathDiagnostic,
  type TableRenderDiagnosticContext,
} from "@/components/mardown-display/blocks/table/TableRenderPathDiagnostic";
import type { MarkdownComponents as Components } from "@/components/markdown-core/markdown-core-types";
import {
  detectTextDirection,
  preprocessProse,
} from "@/components/rich-content/prose/prose-prepare";
import {
  PROSE_BLOCK_ELEMENTS,
  PROSE_FRAME_CSS,
  proseFrameClass,
  renderProseTable,
} from "@/components/rich-content/prose/prose-block-elements";

interface BasicMarkdownContentProps {
  content: string;
  isStreamActive?: boolean;
  onEditRequest?: () => void;
  messageId?: string;
  showCopyButton?: boolean;
  /** Admin-only table fallback diagnostics (see TableRenderPathDiagnostic). */
  tableRenderDiagnostic?: Omit<TableRenderDiagnosticContext, "renderPath">;
}

export const BasicMarkdownContent: React.FC<BasicMarkdownContentProps> = ({
  content,
  isStreamActive,
  onEditRequest,
  messageId,
  showCopyButton = true,
  tableRenderDiagnostic,
}) => {
  const [isHovering, setIsHovering] = useState(false);

  // Detect text direction
  const textDirection = useMemo(() => detectTextDirection(content), [content]);


  // Last preprocessing step: stop a stray `$$` (KaTeX would dump the swallowed
  // prose as red `.katex-error` text) or an unclosed `[` (one giant link) from
  // eating a section. See lib/markdown/delimiter-guard.ts.
  const { text: processedContent, violations: delimiterViolations } =
    guardMarkdownDelimiters(preprocessProse(content));

  // Loud recovery — report once the stream settles, so a half-typed `$$`
  // mid-stream isn't reported as a defect.
  const delimiterViolationSignature = delimiterViolations
    .map((v) => `${v.reason}@${v.index}`)
    .join("|");
  useEffect(() => {
    if (isStreamActive || !delimiterViolationSignature) return;
    reportDelimiterViolations(delimiterViolations, {
      renderPath: "BasicMarkdownContent",
      messageId,
      capture: captureError,
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps -- signature is the stable identity of `delimiterViolations`
  }, [delimiterViolationSignature, isStreamActive, messageId]);

  const handleEdit = () => {
    onEditRequest?.();
  };

  // Conditional mouse event handlers - only active when stream is not active
  const handleMouseEnter = !isStreamActive
    ? () => setIsHovering(true)
    : undefined;
  const handleMouseLeave = !isStreamActive
    ? () => setIsHovering(false)
    : undefined;

  // The shared prose map; the admin-only table diagnostic is the one
  // per-instance override.
  const components = useMemo(
    () =>
      tableRenderDiagnostic
        ? ({
            ...PROSE_BLOCK_ELEMENTS,
            table: (props) =>
              renderProseTable(
                props,
                // HTML tables (parsed by rehypeSafeRawHtml) are correctly
                // rendered here and were never promotion candidates — skip
                // the diagnostic so it only flags genuinely un-promoted
                // markdown pipe tables.
                !props.node?.data?.matrxRawHtmlTable ? (
                  <TableRenderPathDiagnostic
                    context={{
                      ...tableRenderDiagnostic,
                      renderPath: "BasicMarkdownContent",
                      contentPreview:
                        tableRenderDiagnostic.contentPreview ??
                        content.slice(0, 120).replace(/\n/g, " "),
                    }}
                  />
                ) : null,
              ),
          } as Components)
        : PROSE_BLOCK_ELEMENTS,
    [tableRenderDiagnostic, content],
  );

  return (
    <div
      className={proseFrameClass(textDirection)}
      dir={textDirection}
      onMouseEnter={handleMouseEnter}
      onMouseLeave={handleMouseLeave}
    >
      <style dangerouslySetInnerHTML={{ __html: PROSE_FRAME_CSS }} />
      <MarkdownCore preset="chat" components={components}>
        {processedContent}
      </MarkdownCore>

      {/* Only render interactive elements when stream is not active */}
      {!isStreamActive && isHovering && (
        <div className="absolute top-0 right-0 p-1 opacity-0 group-hover:opacity-100 transition-opacity duration-200">
          {showCopyButton && (
            <InlineCopyButton
              markdownContent={content}
              position="top-right"
              className="mt-1 mr-1"
              isMarkdown={true}
            />
          )}
          {/* {onEditRequest && (
            <button
              onClick={handleEdit}
              className="p-1 pt-6 text-gray-500 hover:text-gray-700 rounded-md ml-1"
              title="Edit content"
            >
              <PencilIcon className="w-4 h-4" />
            </button>
          )} */}
        </div>
      )}
    </div>
  );
};

export default BasicMarkdownContent;
