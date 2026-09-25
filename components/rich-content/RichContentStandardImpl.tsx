"use client";

// The `standard` level's implementation, reached ONLY through the single
// dynamic edge in RichContent.tsx (never import this file directly). The full
// engine renders nested content through standard/NestedRichContent instead,
// which is statically part of its own graph.

import { RichContentDepthProvider } from "./depth";
import { StandardBlocks } from "./standard/StandardBlocks";
import { RichContentVariantRoot } from "./prose/variant-root";
import type { RichContentVariant } from "./rich-content-types";

export interface RichContentStandardImplProps {
  source: string;
  isStreaming?: boolean;
  className?: string;
  depthCap?: number;
  variant?: RichContentVariant;
}

export default function RichContentStandardImpl({
  source,
  isStreaming,
  className,
  depthCap,
  variant,
}: RichContentStandardImplProps) {
  return (
    <RichContentVariantRoot variant={variant}>
      <RichContentDepthProvider depth={0} cap={depthCap}>
        <StandardBlocks
          source={source}
          isStreaming={isStreaming}
          className={className}
        />
      </RichContentDepthProvider>
    </RichContentVariantRoot>
  );
}
