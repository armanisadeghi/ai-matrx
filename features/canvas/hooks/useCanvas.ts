"use client";

import { useCallback } from "react";
import { useAppDispatch, useAppSelector } from "@/lib/redux/hooks";
import {
  reportCanvasOpenDrop,
  titleForDrop,
} from "@/features/canvas/openRequest";
import { useCanvasOpenGuard } from "./useCanvasOpenGuard";
import {
  openCanvas,
  closeCanvas,
  clearCanvas,
  updateCanvasContent,
  selectCanvasIsOpen,
  selectCanvasContent,
  CanvasContent,
} from "@/features/canvas/redux/canvasSlice";

/**
 * useCanvas - Simple hook for canvas interactions
 *
 * Provides clean API for opening/closing canvas and accessing canvas state.
 * Requires a Redux provider to be present in the tree (all authenticated and
 * SSR routes satisfy this via Providers/StoreProvider).
 *
 * @example
 * ```tsx
 * const { open, close, isOpen } = useCanvas();
 *
 * const handleExpandQuiz = () => {
 *   open({
 *     type: 'quiz',
 *     data: quizData,
 *     metadata: { title: 'My Quiz' }
 *   });
 * };
 * ```
 */
export function useCanvas() {
  const dispatch = useAppDispatch();
  const { ensureCanvasReachable } = useCanvasOpenGuard();
  // Selectors use optional chaining internally so they return safe defaults
  // when the canvas slice is missing from the store
  const isOpen = useAppSelector(selectCanvasIsOpen);
  const content = useAppSelector(selectCanvasContent);

  /**
   * Open content in the canvas. Returns whether the canvas actually took it —
   * a request it cannot honour is ANNOUNCED (`reportCanvasOpenDrop`), never
   * dropped on the floor. Before this, `open({ type: undefined })` on a route
   * with no canvas surface was a completely invisible no-op.
   */
  const open = useCallback(
    (canvasContent: CanvasContent): boolean => {
      const requested = titleForDrop(canvasContent?.metadata?.title);
      if (!canvasContent?.type) {
        return reportCanvasOpenDrop({ reason: "no-content", requested });
      }
      if (canvasContent.data == null) {
        return reportCanvasOpenDrop({
          reason: "no-content",
          requested,
          detail: `type ${canvasContent.type} arrived with no data`,
        });
      }
      if (!ensureCanvasReachable(requested)) return false;
      dispatch(openCanvas(canvasContent));
      return true;
    },
    [dispatch, ensureCanvasReachable],
  );

  const close = useCallback(() => {
    dispatch(closeCanvas());
  }, [dispatch]);

  const clear = useCallback(() => {
    dispatch(clearCanvas());
  }, [dispatch]);

  const update = useCallback(
    (canvasContent: CanvasContent) => {
      dispatch(updateCanvasContent({ content: canvasContent }));
    },
    [dispatch],
  );

  return {
    open,
    close,
    clear,
    update,
    isOpen,
    content,
  };
}

export { useOpenArtifactInCanvas } from "./useOpenArtifactInCanvas";
export { useCanvasOpenGuard } from "./useCanvasOpenGuard";
