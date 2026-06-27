"use client";

/**
 * DiffCanvas — the diff renderer for a DiffBlock (```diff fences).
 *
 * Self-sizing, chrome-less light-engine diff (DiffBlock provides the card,
 * title, split/unified toggle, and copy). Uses the canonical InlineTextDiff so
 * it shares the one diff engine + GitHub-style color palette with the rest of
 * the app — no third-party diff library. DiffBlock still loads this file via
 * `next/dynamic ssr:false`, the single boundary for this subtree.
 */

import React from "react";
import { InlineTextDiff } from "@/components/diff/adapters/InlineTextDiff";

export default function DiffCanvas({
  oldValue,
  newValue,
  split,
}: {
  oldValue: string;
  newValue: string;
  split: boolean;
}) {
  return (
    <div className="px-1 py-1 text-[13px]">
      <InlineTextDiff
        original={oldValue}
        modified={newValue}
        view={split ? "split" : "inline"}
      />
    </div>
  );
}
