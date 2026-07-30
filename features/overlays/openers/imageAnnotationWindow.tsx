"use client";

/**
 * Typed, callback-aware opener for the multi-instance annotation window.
 */

import { useCallback, useEffect, useRef } from "react";
import { useAppDispatch } from "@/lib/redux/hooks";
import { closeOverlay, openOverlay } from "@/lib/redux/slices/overlaySlice";
import {
  createImageAnnotationCallbackGroup,
  type ImageAnnotationWindowData,
  type ImageAnnotationWindowHandlers,
} from "@/features/overlays/callbacks/imageAnnotationWindow";

const OVERLAY_ID = "imageAnnotationWindow" as const;

export interface OpenImageAnnotationWindowOptions
  extends ImageAnnotationWindowHandlers {
  windowInstanceId?: string;
  sourceFileId?: string | null;
  sourceUrl?: string | null;
  sourceFilename?: string | null;
  defaultFolder?: string | null;
  title?: string | null;
  overwriteSource?: boolean;
}

export interface ImageAnnotationWindowHandle {
  instanceId: string;
  callbackGroupId: string;
  close: () => void;
  dispose: () => void;
}

type HandleRef = {
  instanceId: string;
  dispose: () => void;
};

export function useOpenImageAnnotationWindow() {
  const dispatch = useAppDispatch();
  const handlesRef = useRef<Set<HandleRef>>(new Set());

  useEffect(() => {
    const handles = handlesRef.current;
    return () => {
      for (const handle of handles) handle.dispose();
      handles.clear();
    };
  }, []);

  return useCallback(
    (
      options: OpenImageAnnotationWindowOptions = {},
    ): ImageAnnotationWindowHandle => {
      const instanceId =
        options.windowInstanceId ??
        `${OVERLAY_ID}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
      const { callbackGroupId, dispose } =
        createImageAnnotationCallbackGroup(options);
      const data: ImageAnnotationWindowData = {
        callbackGroupId,
        sourceFileId: options.sourceFileId ?? null,
        sourceUrl: options.sourceUrl ?? null,
        sourceFilename: options.sourceFilename ?? null,
        defaultFolder: options.defaultFolder ?? null,
        title: options.title ?? null,
        overwriteSource: options.overwriteSource ?? false,
      };

      dispatch(
        openOverlay({
          overlayId: OVERLAY_ID,
          instanceId,
          data,
        }),
      );

      const handleRef: HandleRef = { instanceId, dispose };
      handlesRef.current.add(handleRef);

      const close = () => {
        dispatch(
          closeOverlay({
            overlayId: OVERLAY_ID,
            instanceId,
          }),
        );
        dispose();
        handlesRef.current.delete(handleRef);
      };

      const detach = () => {
        dispose();
        handlesRef.current.delete(handleRef);
      };

      return {
        instanceId,
        callbackGroupId,
        close,
        dispose: detach,
      };
    },
    [dispatch],
  );
}

export function ImageAnnotationWindowController(
  props: OpenImageAnnotationWindowOptions,
): null {
  const open = useOpenImageAnnotationWindow();
  useEffect(() => {
    const handle = open(props);
    return () => handle.close();
  }, [
    open,
    props.windowInstanceId,
    props.sourceFileId,
    props.sourceUrl,
    props.sourceFilename,
    props.defaultFolder,
    props.title,
    props.overwriteSource,
  ]);
  return null;
}
