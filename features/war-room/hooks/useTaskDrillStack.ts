"use client";

import { useCallback, useState } from "react";

/** In-tile task drill-down: push subtasks (or project tasks), pop to go back up. */
export function useTaskDrillStack() {
  const [stack, setStack] = useState<string[]>([]);

  const push = useCallback((taskId: string) => {
    setStack((prev) =>
      prev[prev.length - 1] === taskId ? prev : [...prev, taskId],
    );
  }, []);

  const pop = useCallback(() => {
    setStack((prev) => (prev.length > 0 ? prev.slice(0, -1) : prev));
  }, []);

  const popTo = useCallback((index: number) => {
    setStack((prev) => {
      if (index < 0) return [];
      return prev.slice(0, index + 1);
    });
  }, []);

  const reset = useCallback(() => setStack([]), []);

  const currentTaskId = stack.length > 0 ? stack[stack.length - 1] : null;
  const isDrilled = stack.length > 0;

  return {
    stack,
    currentTaskId,
    isDrilled,
    push,
    pop,
    popTo,
    reset,
  };
}
