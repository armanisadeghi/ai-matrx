"use client";

/**
 * Opener for the `contextAssignment` overlay — the "Attach To" surface that
 * wraps `ContextAssignmentWindow` (durable scope/project/task tagging of an
 * entity). Data-only: the subject is a plain serializable object, so it travels
 * straight through `openOverlay` data. Mirrors `diffViewerWindow` /
 * `shareModalWindow`.
 *
 * - `useOpenContextAssignment()` — imperative hook. Returns a handle with
 *   `close()`.
 * - `<ContextAssignmentController />` — declarative wrapper.
 */

import { useCallback, useEffect } from "react";
import { useAppDispatch } from "@/lib/redux/hooks";
import { closeOverlay, openOverlay } from "@/lib/redux/slices/overlaySlice";
import type { EntityType } from "@/features/scopes/types";

const OVERLAY_ID = "contextAssignment" as const;

export interface ContextAssignmentSubjectInput {
  entityType: EntityType;
  entityId: string;
  title: string;
}

export interface OpenContextAssignmentOptions {
  subject: ContextAssignmentSubjectInput;
  /** Optional stable instance id. Omit for the default singleton slot. */
  instanceId?: string;
}

export interface ContextAssignmentHandle {
  close: () => void;
}

export function useOpenContextAssignment() {
  const dispatch = useAppDispatch();
  return useCallback(
    (opts: OpenContextAssignmentOptions): ContextAssignmentHandle => {
      dispatch(
        openOverlay({
          overlayId: OVERLAY_ID,
          instanceId: opts.instanceId,
          data: { subject: opts.subject },
        }),
      );
      return {
        close: () =>
          dispatch(
            closeOverlay({
              overlayId: OVERLAY_ID,
              instanceId: opts.instanceId,
            }),
          ),
      };
    },
    [dispatch],
  );
}

/**
 * Declarative form. Renders nothing visible; opens the overlay on mount, closes
 * it on unmount.
 */
export function ContextAssignmentController(
  props: OpenContextAssignmentOptions,
): null {
  const open = useOpenContextAssignment();
  useEffect(() => {
    const handle = open(props);
    return () => handle.close();
  }, [
    open,
    props.instanceId,
    props.subject.entityType,
    props.subject.entityId,
    props.subject.title,
  ]);
  return null;
}
