"use client";

import { useAlchemyDisclosure } from "@/components/agent-copy/useAlchemyDisclosure";

import { useId } from "react";
import { ContentTransferMenu } from "@ai-matrx/design-system/content-transfer";
import { directSource } from "@ai-matrx/kit/content-transfer";
import { removeThinkingContent } from "@ai-matrx/print/markdown";
import { useOpenHtmlPreviewBridge } from "@/features/overlays/openers/htmlPreview";
import { cn } from "@/lib/utils";

export function MarkdownCopyButton({
  markdownContent,
  className,
  iconOnly = false,
  title = "Content",
  sourceId,
  hideHTMLPreview = false,
}: {
  markdownContent: string;
  className?: string;
  iconOnly?: boolean;
  title?: string;
  sourceId?: string;
  /** Hosts with an editable preview keep that single authoritative action. */
  hideHTMLPreview?: boolean;
}) {
  useAlchemyDisclosure();
  const instanceId = useId();
  const stableSourceId = sourceId ?? `markdown-copy:${instanceId}`;
  const text = removeThinkingContent(markdownContent);
  const openPreview = useOpenHtmlPreviewBridge();
  const source = {
    id: stableSourceId,
    label: title,
    capture: async () =>
      directSource(
        { kind: "markdown", text },
        {
          id: stableSourceId,
          sourceId: stableSourceId,
          revision: markdownContent,
          label: title,
        },
      ),
  };
  return (
    <ContentTransferMenu
      source={source}
      label={title}
      className={cn(iconOnly && "matrx-alchemy-xs", className)}
      variants={
        text === markdownContent
          ? []
          : [
              {
                id: "include-thinking",
                label: "Including thinking",
                copyLabel: "Copy including thinking",
                hint: "Includes the original reasoning content",
                source: {
                  id: `${stableSourceId}:including-thinking`,
                  label: title,
                  capture: async () =>
                    directSource(
                      { kind: "markdown", text: markdownContent },
                      {
                        id: `${stableSourceId}:including-thinking`,
                        sourceId: stableSourceId,
                        revision: markdownContent,
                        label: title,
                      },
                    ),
                },
              },
            ]
      }
      actions={
        hideHTMLPreview
          ? []
          : [
              {
                id: "html-preview",
                label: "HTML preview",
                supports: () => true,
                run: async ({ draft }) => {
                  if (
                    draft.payload.kind !== "markdown" &&
                    draft.payload.kind !== "text"
                  )
                    throw new Error("HTML preview requires text.");
                  openPreview({
                    content: draft.payload.text,
                    title,
                    showSaveButton: false,
                  });
                  return {
                    status: "success",
                    delivered: "action",
                    mimeTypes: [],
                    message: "HTML preview opened",
                  };
                },
              },
            ]
      }
    />
  );
}

export function SimpleCopyButton({
  markdownContent,
  label = "Content",
  className,
  sourceId,
}: {
  markdownContent: string;
  label?: string;
  className?: string;
  sourceId?: string;
}) {
  return (
    <MarkdownCopyButton
      markdownContent={markdownContent}
      title={label}
      className={className}
      sourceId={sourceId}
    />
  );
}

type InlineCopyButtonPosition =
  | "top-right"
  | "top-left"
  | "top-center"
  | "bottom-right"
  | "bottom-left"
  | "bottom-center"
  | "center-left"
  | "center-right"
  | "center";
type InlineCopyButtonSize = "xs" | "sm" | "md" | "lg" | "xl";
const positions: Record<InlineCopyButtonPosition, string> = {
  "top-right": "top-1 right-1",
  "top-left": "top-1 left-1",
  "top-center": "top-1 left-1/2 -translate-x-1/2",
  "bottom-right": "bottom-1 right-1",
  "bottom-left": "bottom-1 left-1",
  "bottom-center": "bottom-1 left-1/2 -translate-x-1/2",
  "center-left": "top-1/2 left-1 -translate-y-1/2",
  "center-right": "top-1/2 right-1 -translate-y-1/2",
  center: "top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2",
};

export function InlineCopyButton({
  markdownContent,
  position = "top-right",
  size = "sm",
  className,
  tooltipText = "Content",
  isMarkdown = false,
  sourceId,
}: {
  markdownContent: string;
  position?: InlineCopyButtonPosition;
  size?: InlineCopyButtonSize;
  className?: string;
  tooltipText?: string;
  isMarkdown?: boolean;
  constrainToParent?: boolean;
  sourceId?: string;
}) {
  const classes = cn(
    "absolute z-10",
    positions[position],
    size === "xs"
      ? "matrx-alchemy-xs"
      : size === "sm"
        ? "matrx-alchemy-sm"
        : undefined,
    className,
  );
  if (isMarkdown)
    return (
      <MarkdownCopyButton
        markdownContent={markdownContent}
        title={tooltipText}
        className={classes}
        sourceId={sourceId}
      />
    );
  return (
    <InlineTextTransfer
      text={markdownContent}
      label={tooltipText}
      className={classes}
      sourceId={sourceId}
    />
  );
}

function InlineTextTransfer({
  text,
  label,
  className,
  sourceId,
}: {
  text: string;
  label: string;
  className?: string;
  sourceId?: string;
}) {
  useAlchemyDisclosure();
  const instanceId = useId();
  const stableSourceId = sourceId ?? `inline-copy:${instanceId}`;
  return (
    <ContentTransferMenu
      source={{
        id: stableSourceId,
        label,
        capture: async () =>
          directSource(
            { kind: "text", text },
            {
              id: stableSourceId,
              sourceId: stableSourceId,
              revision: text,
              label,
            },
          ),
      }}
      label={label}
      className={className}
    />
  );
}
