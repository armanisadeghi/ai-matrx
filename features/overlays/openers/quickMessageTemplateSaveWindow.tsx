"use client";

import { useCallback, useEffect } from "react";
import { useAppDispatch } from "@/lib/redux/hooks";
import { closeOverlay, openOverlay } from "@/lib/redux/slices/overlaySlice";
import type { MessageRole } from "@/features/message-templates/types/message-templates-db";

const OVERLAY_ID = "quickMessageTemplateSaveWindow" as const;

export interface OpenQuickMessageTemplateSaveWindowOptions {
  initialContent: string;
  defaultName?: string;
  defaultRole?: MessageRole;
}

export function useOpenQuickMessageTemplateSaveWindow() {
  const dispatch = useAppDispatch();
  return useCallback(
    (options: OpenQuickMessageTemplateSaveWindowOptions) => {
      dispatch(openOverlay({ overlayId: OVERLAY_ID, data: options }));
      return {
        close: () => dispatch(closeOverlay({ overlayId: OVERLAY_ID })),
      };
    },
    [dispatch],
  );
}

export function QuickMessageTemplateSaveWindowController(
  props: OpenQuickMessageTemplateSaveWindowOptions,
): null {
  const open = useOpenQuickMessageTemplateSaveWindow();
  useEffect(() => {
    const handle = open(props);
    return () => {
      handle.close();
    };
  }, [open, props.initialContent, props.defaultName, props.defaultRole]);
  return null;
}
