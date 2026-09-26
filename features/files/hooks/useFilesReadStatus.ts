/**
 * Where the user's file tree read stands — the ONE answer every files surface
 * (the /files page, the Cloud Files window panel, pickers, the mobile stack)
 * asks before it may say "empty". A failed or unfinished read is never "No
 * files yet" (RC-B12 round 10: the window panel said "This folder is empty."
 * over a failed read while /files said "We couldn't load your files").
 */
import { useCallback } from "react";
import { useAppDispatch, useAppSelector } from "@/lib/redux/hooks";
import { selectTreeError, selectTreeStatus } from "@/features/files/redux/selectors";
import { loadUserFileTree } from "@/features/files/redux/thunks";
import { selectUserId } from "@/lib/redux/selectors/userSelectors";

export type FilesReadStatus = {
  status: "loading" | "error" | "ready";
  error: string | null;
  retry: () => void;
};

export function useTreeReadStatus(): FilesReadStatus {
  const dispatch = useAppDispatch();
  const treeStatus = useAppSelector(selectTreeStatus);
  const error = useAppSelector(selectTreeError);
  const userId = useAppSelector(selectUserId);
  const retry = useCallback(() => {
    if (userId) void dispatch(loadUserFileTree({ userId }));
  }, [dispatch, userId]);
  const status = treeStatus === "loaded" ? "ready" : treeStatus === "error" ? "error" : "loading";
  return { status, error: error ?? null, retry };
}
