"use client";

import { useEffect, useRef } from "react";
import { useAppDispatch } from "@/lib/redux/hooks";
import { closeOverlay, openOverlay } from "@/lib/redux/slices/overlaySlice";
import {
  createUserSearchCallbackGroup,
  type UserSearchHandlers,
} from "./callbacks";
import type { UserSearchCandidate, UserSearchWindowData } from "./types";

const OVERLAY_ID = "userSearchWindow" as const;

export interface OpenUserSearchWindowOptions extends UserSearchHandlers {
  title?: string;
  initialQuery?: string;
  directory?: "admin" | "provided";
  candidates?: UserSearchCandidate[];
  excludeUserIds?: string[];
  instanceId?: string;
}

export interface UserSearchWindowHandle {
  close: () => void;
  dispose: () => void;
}

interface HandleRef {
  instanceId: string;
  dispose: () => void;
}

export function useOpenUserSearchWindow() {
  const dispatch = useAppDispatch();
  const handlesRef = useRef<Set<HandleRef>>(new Set());

  useEffect(() => {
    const handles = handlesRef.current;
    return () => {
      for (const handle of handles) handle.dispose();
      handles.clear();
    };
  }, []);

  return (
    options: OpenUserSearchWindowOptions = {},
  ): UserSearchWindowHandle => {
    const instanceId =
      options.instanceId ??
      `${OVERLAY_ID}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    let handleRef: HandleRef | null = null;
    const { callbackGroupId, dispose } = createUserSearchCallbackGroup({
      onSelected: options.onSelected,
      onWindowClose: (event) => {
        options.onWindowClose?.(event);
        if (handleRef) handlesRef.current.delete(handleRef);
      },
    });
    const data: UserSearchWindowData = {
      callbackGroupId,
      title: options.title?.trim() || "Search users",
      initialQuery: options.initialQuery ?? "",
      directory: options.directory ?? "provided",
      candidates: options.candidates ?? [],
      excludeUserIds: options.excludeUserIds ?? [],
    };
    dispatch(openOverlay({ overlayId: OVERLAY_ID, instanceId, data }));

    const handle: HandleRef = { instanceId, dispose };
    handleRef = handle;
    handlesRef.current.add(handle);
    const detach = () => {
      dispose();
      handlesRef.current.delete(handle);
    };
    const close = () => {
      dispatch(closeOverlay({ overlayId: OVERLAY_ID, instanceId }));
      detach();
    };
    return { close, dispose: detach };
  };
}
