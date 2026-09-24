"use client";

// The `standard` level's implementation, reached ONLY through the single
// dynamic edge in RichContent.tsx (never import this file directly). The full
// engine renders nested content through standard/NestedRichContent instead,
// which is statically part of its own graph.

import { RichContentDepthProvider } from "./depth";
import { StandardBlocks } from "./standard/StandardBlocks";

export interface RichContentStandardImplProps {
  source: string;
  isStreaming?: boolean;
  className?: string;
  depthCap?: number;
}

export default function RichContentStandardImpl({
  source,
  isStreaming,
  className,
  depthCap,
}: RichContentStandardImplProps) {
  return (
    <RichContentDepthProvider depth={0} cap={depthCap}>
      <StandardBlocks
        source={source}
        isStreaming={isStreaming}
        className={className}
      />
    </RichContentDepthProvider>
  );
}
