"use client";

/**
 * TextWithReferences — render a plain-text string that may embed ```matrx
 * fences: prose stays prose, every fence becomes the SAME live reference chip
 * the chat markdown pipeline renders (MatrxEnvelopeBlock → registry).
 *
 * For surfaces that carry raw text and do not run the markdown pipeline
 * (direct messages, notifications, activity feeds). Never hand-parse a fence
 * at a callsite; never render envelope JSON to a human.
 */

import React from "react";
import { cn } from "@/lib/utils";
import { splitMatrxFences } from "@/features/matrx-envelope/referenceText";
import MatrxEnvelopeBlock from "@/features/matrx-envelope/MatrxEnvelopeBlock";

interface TextWithReferencesProps {
  content: string;
  className?: string;
}

export function TextWithReferences({
  content,
  className,
}: TextWithReferencesProps) {
  const segments = splitMatrxFences(content);

  return (
    <span className={cn("whitespace-pre-wrap break-words block", className)}>
      {segments.map((segment, i) =>
        segment.kind === "text" ? (
          <React.Fragment key={`t${i}`}>{segment.text}</React.Fragment>
        ) : (
          <MatrxEnvelopeBlock key={`e${i}`} content={segment.envelope} />
        ),
      )}
    </span>
  );
}

export default TextWithReferences;
