"use client";

import { useAlchemyDisclosure } from "@/components/agent-copy/useAlchemyDisclosure";

import * as React from "react";
import { ContentTransferMenu } from "@ai-matrx/design-system/content-transfer";
import { directSource } from "@ai-matrx/kit/content-transfer";
import { removeThinkingContent } from "@ai-matrx/print/markdown";
import type { RichDocumentActionContext } from "../../types";

export function AlchemyDocumentMenu({
  getCtx,
  sourceId,
  size = "sm",
}: {
  getCtx: () => RichDocumentActionContext;
  sourceId: string;
  size?: "sm" | "xs";
}) {
  useAlchemyDisclosure();
  const [hasThinking, setHasThinking] = React.useState(false);
  const source = {
    id: sourceId,
    label: "Document",
    // getCtx reads refs and is legal only when Alchemy starts capture.
    capture: async ({ signal }: { signal: AbortSignal }) => {
      signal.throwIfAborted();
      const ctx = getCtx();
      const capturedSourceId = ctx.instanceKey("alchemy");
      if (capturedSourceId !== sourceId)
        throw new Error(
          "The document changed. Reopen Alchemy Menu for the current document.",
        );
      const text = removeThinkingContent(ctx.content);
      setHasThinking(text !== ctx.content);
      return directSource(
        { kind: "markdown", text },
        {
          id: capturedSourceId,
          sourceId: capturedSourceId,
          revision: ctx.content,
          label: "Document",
        },
      );
    },
  };
  const includingThinkingSource = {
    id: `${sourceId}:including-thinking`,
    label: "Document",
    capture: async ({ signal }: { signal: AbortSignal }) => {
      signal.throwIfAborted();
      const ctx = getCtx();
      const capturedSourceId = ctx.instanceKey("alchemy");
      if (capturedSourceId !== sourceId)
        throw new Error(
          "The document changed. Reopen Alchemy Menu for the current document.",
        );
      return directSource(
        { kind: "markdown", text: ctx.content },
        {
          id: `${capturedSourceId}:including-thinking`,
          sourceId: capturedSourceId,
          revision: ctx.content,
          label: "Document",
        },
      );
    },
  };

  return (
    <ContentTransferMenu
      key={sourceId}
      source={source}
      label="Document"
      className={size === "xs" ? "matrx-alchemy-xs" : undefined}
      variants={
        hasThinking
          ? [
              {
                id: "include-thinking",
                label: "Including thinking",
                copyLabel: "Copy including thinking",
                hint: "Includes the original reasoning content",
                source: includingThinkingSource,
              },
            ]
          : []
      }
    />
  );
}
