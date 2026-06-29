"use client";

import { useCallback } from "react";
import { useAppDispatch, useAppSelector } from "@/lib/redux/hooks";
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
  // Selectors use optional chaining internally so they return safe defaults
  // when the canvas slice is missing from the store
  const isOpen = useAppSelector(selectCanvasIsOpen);
  const content = useAppSelector(selectCanvasContent);

  const open = useCallback(
    (canvasContent: CanvasContent) => {
      dispatch(openCanvas(canvasContent));
    },
    [dispatch],
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
