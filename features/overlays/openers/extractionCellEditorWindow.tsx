"use client";

/**
 * Opener for `extractionCellEditorWindow` — edit one extraction dataset cell
 * in a floating WindowPanel (edit / split / preview).
 */

import { useCallback, useEffect, useRef } from "react";
import { useAppDispatch } from "@/lib/redux/hooks";
import { closeOverlay, openOverlay } from "@/lib/redux/slices/overlaySlice";
import {
  createExtractionCellEditorCallbackGroup,
  extractionCellEditorInstanceId,
  type ExtractionCellEditorHandlers,
  type ExtractionCellEditorTarget,
} from "@/features/page-extraction/data-review/extractionCellEditorCallbacks";

const OVERLAY_ID = "extractionCellEditorWindow" as const;

export interface OpenExtractionCellEditorOptions extends ExtractionCellEditorTarget {
  callbackGroupId?: string;
}

export interface ExtractionCellEditorHandle {
  instanceId: string;
  close: () => void;
}

export function useOpenExtractionCellEditor(
  handlers?: ExtractionCellEditorHandlers,
) {
  const dispatch = useAppDispatch();
  const handlersRef = useRef(handlers);
  handlersRef.current = handlers;

  const groupRef = useRef<ReturnType<
    typeof createExtractionCellEditorCallbackGroup
  > | null>(null);

  useEffect(() => {
    groupRef.current = createExtractionCellEditorCallbackGroup({
      onSaved: (e) => handlersRef.current?.onSaved?.(e),
      onWindowClose: (e) => handlersRef.current?.onWindowClose?.(e),
    });
    return () => {
      groupRef.current?.dispose();
      groupRef.current = null;
    };
  }, []);

  return useCallback(
    (opts: OpenExtractionCellEditorOptions): ExtractionCellEditorHandle => {
      const instanceId = extractionCellEditorInstanceId(
        opts.rowId,
        opts.columnKey,
      );
      dispatch(
        openOverlay({
          overlayId: OVERLAY_ID,
          instanceId,
          data: {
            rowId: opts.rowId,
            columnKey: opts.columnKey,
            columnLabel: opts.columnLabel,
            pageLabel: opts.pageLabel,
            value: opts.value,
            writeKey: opts.writeKey,
            currentPayload: opts.currentPayload,
            callbackGroupId:
              opts.callbackGroupId ?? groupRef.current?.callbackGroupId ?? null,
          },
        }),
      );
      return {
        instanceId,
        close: () =>
          dispatch(closeOverlay({ overlayId: OVERLAY_ID, instanceId })),
      };
    },
    [dispatch],
  );
}
