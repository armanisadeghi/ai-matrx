"use client";

/**
 * DiffCanvas — the react-diff-viewer-continued renderer for a DiffBlock.
 *
 * BUNDLE POLICY: the diff lib is the only thing imported here, loaded EXCLUSIVELY
 * via `next/dynamic ssr:false` from DiffBlock, so it stays out of the server
 * build / initial bundle.
 */

import React from "react";
import ReactDiffViewer, { DiffMethod } from "react-diff-viewer-continued";

import { useAppSelector } from "@/lib/redux/hooks";

export default function DiffCanvas({
  oldValue,
  newValue,
  split,
}: {
  oldValue: string;
  newValue: string;
  split: boolean;
}) {
  const isDark = useAppSelector((s) => s.theme.mode) === "dark";
  return (
    <div className="overflow-auto text-[13px] [&_pre]:!font-mono">
      <ReactDiffViewer
        oldValue={oldValue}
        newValue={newValue}
        splitView={split}
        useDarkTheme={isDark}
        compareMethod={DiffMethod.WORDS}
        leftTitle={split ? "Before" : undefined}
        rightTitle={split ? "After" : undefined}
      />
    </div>
  );
}
