/**
 * features/files/components/surfaces/FilesQueryHydrator.tsx
 *
 * One-shot URL query → Redux hydration for the `/files/all` workspace.
 * Lives in the page slot (layouts cannot read `searchParams`) while
 * `<PageShell/>` persists in the route layout — so folder navigation via
 * `history.pushState` never remounts the shell but the first paint still
 * matches `?view=…&file=…` from the server.
 */

"use client";

import { useEffect, useRef } from "react";
import { useAppDispatch } from "@/lib/redux/hooks";
import { setActiveFileId, setUiBatch } from "@/features/files/redux/slice";
import type { UiState } from "@/features/files/types";

export interface FilesQueryHydratorProps {
  initialUiPatch: Partial<UiState>;
  initialFileId: string | null;
}

export function FilesQueryHydrator({
  initialUiPatch,
  initialFileId,
}: FilesQueryHydratorProps) {
  const dispatch = useAppDispatch();
  const didRunRef = useRef(false);

  useEffect(() => {
    if (didRunRef.current) return;
    didRunRef.current = true;
    if (initialFileId) dispatch(setActiveFileId(initialFileId));
    if (Object.keys(initialUiPatch).length > 0) {
      dispatch(setUiBatch(initialUiPatch));
    }
  }, [dispatch, initialUiPatch, initialFileId]);

  return null;
}
