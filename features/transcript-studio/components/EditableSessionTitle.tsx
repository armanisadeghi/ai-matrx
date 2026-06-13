"use client";

/**
 * Click-to-edit session title. Thin feature-binding wrapper around the shared
 * `EditableLabel` primitive (components/official/item): commits the new title
 * via `updateSessionThunk`, falls back to the platform default on empty input.
 * Same exported API as before — call sites are unchanged.
 */

import { useCallback } from "react";
import { useAppDispatch } from "@/lib/redux/hooks";
import { EditableLabel } from "@/components/official/item/EditableLabel";
import { updateSessionThunk } from "../redux/thunks";
import { NEW_SESSION_DEFAULT_TITLE } from "../constants";

interface EditableSessionTitleProps {
  sessionId: string;
  title: string;
  className?: string;
  /** Auto-select all text on edit start. Default true. */
  selectOnEdit?: boolean;
  /** Truncate display when not editing. Default true. */
  truncate?: boolean;
}

export function EditableSessionTitle({
  sessionId,
  title,
  className,
  selectOnEdit = true,
  truncate = true,
}: EditableSessionTitleProps) {
  const dispatch = useAppDispatch();

  const handleCommit = useCallback(
    (next: string) => {
      void dispatch(updateSessionThunk({ id: sessionId, patch: { title: next } }));
    },
    [dispatch, sessionId],
  );

  return (
    <EditableLabel
      value={title}
      onCommit={handleCommit}
      emptyFallback={NEW_SESSION_DEFAULT_TITLE}
      selectOnEdit={selectOnEdit}
      truncate={truncate}
      ariaLabel="Session title"
      className={className}
      displayClassName="text-sm font-semibold"
      inputClassName="font-semibold"
    />
  );
}
