"use client";

/**
 * CanvasDockBody — the HEAVY half of the docked canvas (CanvasSurfaceCard →
 * CanvasPane → renderers → materialization). Loaded by `CanvasDock` through
 * dynamic({ssr:false}) once an item exists, exactly as the sheet loads its own
 * Impl, so mounting a dock on a route costs a panel group and nothing else.
 *
 * Never import this statically.
 */

import React, { useCallback, useEffect } from "react";

import { useAppDispatch } from "@/lib/redux/hooks";
import { setCanvasSplitRatio } from "@/features/canvas/redux/canvasSlice";
import { CanvasSurfaceCard } from "./CanvasSurface";

export function CanvasDockBody() {
  const dispatch = useAppDispatch();

  const handleSplitRatioChange = useCallback(
    (topPercent: number) => {
      dispatch(setCanvasSplitRatio(topPercent));
    },
    [dispatch],
  );

  // The shell header hides its avatar while the canvas owns a header of its
  // own — the same signal the sheet sets, so the chrome never doubles up.
  useEffect(() => {
    document.documentElement.dataset.canvasOpen = "true";
    return () => {
      delete document.documentElement.dataset.canvasOpen;
    };
  }, []);

  return (
    <CanvasSurfaceCard
      presentation="docked"
      edge="flush"
      onSplitRatioChange={handleSplitRatioChange}
    />
  );
}

export default CanvasDockBody;
