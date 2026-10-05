"use client";

/**
 * The compact snippet's kind refusal (X1): a settled json / jsonc / json5 /
 * unlabelled snippet whose text is kind JSON is drawn as its kind, exactly as
 * `CodeBlock` does (`KindDataGate` — and the caller is reported). Behind a
 * lazy edge from `InlineCodeSnippet`, which the block engine imports
 * statically and which must not pull the kind route into that graph.
 */

import React from "react";
import { KindDataGate } from "@/components/official/structured-value/KindDataGate";

export default function InlineCodeSnippetKindGate({ value }: { value: unknown }) {
  return (
    <KindDataGate component="InlineCodeSnippet" data={value}>
      {null}
    </KindDataGate>
  );
}
