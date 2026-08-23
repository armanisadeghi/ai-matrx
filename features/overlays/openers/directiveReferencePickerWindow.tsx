"use client";

import { useCallback, useEffect, useRef } from "react";
import { useAppDispatch } from "@/lib/redux/hooks";
import { closeOverlay, openOverlay } from "@/lib/redux/slices/overlaySlice";
import {
  createDirectiveReferencePickerCallbackGroup,
  type DirectiveReferencePickerHandlers,
  type DirectiveReferencePickerWindowData,
} from "@/features/window-panels/windows/admin/directive-reference-picker/callbacks";
import type { EntityTypeToken } from "@/types/generated/entity-types.generated";

const OVERLAY_ID = "directiveReferencePickerWindow";

export interface OpenDirectiveReferencePickerOptions extends DirectiveReferencePickerHandlers {
  entityToken: EntityTypeToken;
  fieldKey: string;
  title: string;
  instanceId?: string;
}

export interface DirectiveReferencePickerHandle {
  close: () => void;
  dispose: () => void;
}

interface HandleRef {
  instanceId: string;
  dispose: () => void;
}

export function useOpenDirectiveReferencePickerWindow() {
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
      options: OpenDirectiveReferencePickerOptions,
    ): DirectiveReferencePickerHandle => {
      const instanceId =
        options.instanceId ??
        `${OVERLAY_ID}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
      const { callbackGroupId, dispose } =
        createDirectiveReferencePickerCallbackGroup({
          onPicked: options.onPicked,
          onWindowClose: options.onWindowClose,
        });
      const data: DirectiveReferencePickerWindowData = {
        callbackGroupId,
        entityToken: options.entityToken,
        fieldKey: options.fieldKey,
        title: options.title,
      };
      dispatch(openOverlay({ overlayId: OVERLAY_ID, instanceId, data }));

      const handleRef: HandleRef = { instanceId, dispose };
      handlesRef.current.add(handleRef);
      const detach = () => {
        dispose();
        handlesRef.current.delete(handleRef);
      };
      const close = () => {
        dispatch(closeOverlay({ overlayId: OVERLAY_ID, instanceId }));
        detach();
      };
      return { close, dispose: detach };
    },
    [dispatch],
  );
}

export function DirectiveReferencePickerWindowController(
  options: OpenDirectiveReferencePickerOptions,
): null {
  const open = useOpenDirectiveReferencePickerWindow();
  const { entityToken, fieldKey, title, instanceId, onPicked, onWindowClose } =
    options;
  useEffect(() => {
    const handle = open({
      entityToken,
      fieldKey,
      title,
      instanceId,
      onPicked,
      onWindowClose,
    });
    return handle.close;
  }, [open, entityToken, fieldKey, title, instanceId, onPicked, onWindowClose]);
  return null;
}
