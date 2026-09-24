"use client";

// The nested-rendering depth guard. Every place that renders content INSIDE
// other content (an XML section's body, a ```markdown fence, a markdown-valued
// kind field) goes through `NestedRichContent`, which reads this context,
// renders one level deeper, and falls back to plain text at the cap. This
// replaces "never recurse" rules with a real, bounded recursion.

import { createContext, useContext, type ReactNode } from "react";
import { DEFAULT_RICH_CONTENT_DEPTH_CAP } from "./rich-content-types";

interface RichContentDepth {
  /** 0 = top-level content; +1 per nested section/fence/field. */
  depth: number;
  /** Deepest level that still renders formatted. */
  cap: number;
}

const RichContentDepthContext = createContext<RichContentDepth>({
  depth: 0,
  cap: DEFAULT_RICH_CONTENT_DEPTH_CAP,
});

export function useRichContentDepth(): RichContentDepth {
  return useContext(RichContentDepthContext);
}

export function RichContentDepthProvider({
  depth,
  cap,
  children,
}: {
  depth: number;
  cap?: number;
  children: ReactNode;
}) {
  const parent = useContext(RichContentDepthContext);
  return (
    <RichContentDepthContext.Provider
      value={{ depth, cap: cap ?? parent.cap }}
    >
      {children}
    </RichContentDepthContext.Provider>
  );
}
