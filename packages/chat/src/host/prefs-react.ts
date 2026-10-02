"use client";

/**
 * React reads of the prefs port (PACKAGE-INDEPENDENCE §2.3, slice P8): the
 * settings register, the admin debug panel, and the host's setting doors.
 * Same names and shapes the call sites imported from the host app
 * (`useSessionKnob`, `useEffectiveKnob`, `useDebugContext`, `SettingDoor`).
 *
 * The port comes from the nearest <ChatProvider>; outside one, the configured
 * host's; else no register (every knob unanswered, said once).
 */

import { createElement, useCallback, useEffect, useRef } from "react";
import type { ChatPrefsPort, ChatSettingDoorProps } from "./contract";
import { getChatHost, isChatHostConfigured } from "./configure";
import { useMaybeChatHost } from "./react";
import {
  chatKnobs,
  selectIsDebugMode,
  selectIsSuperAdminDebugger,
  preferenceWritten,
  type KnobRef,
  type KnobScope,
} from "./prefs";
import { useAppDispatch, useAppSelector } from "../store/hooks";

function usePrefsPort(): ChatPrefsPort | null {
  const host = useMaybeChatHost();
  if (host) return host.prefs;
  return isChatHostConfigured() ? getChatHost().prefs : null;
}

/** The effective value for these principals; `undefined` until answered. */
export function useEffectiveKnob(
  organizationId: string | null | undefined,
  userId: string | null | undefined,
  ref: KnobRef,
  scopes?: readonly KnobScope[],
): unknown {
  return chatKnobs(usePrefsPort()).useEffective(organizationId, userId, ref, scopes);
}

/** The effective value for this session (the signed-in person in the active org); `undefined` until answered. */
export function useSessionKnob(ref: KnobRef): unknown {
  return chatKnobs(usePrefsPort()).useSession(ref);
}

/**
 * Publish debug context to the host's admin debug panel, namespaced
 * ("Chat:Session ID"). A no-op unless the person is a super admin with debug
 * mode on; the namespace is cleared on unmount.
 */
export function useDebugContext(namespace: string) {
  const dispatch = useAppDispatch();
  const isAdmin = useAppSelector(selectIsSuperAdminDebugger);
  const isDebugMode = useAppSelector(selectIsDebugMode);
  const namespaceRef = useRef(namespace);

  // Namespace cleanup on unmount only — isAdmin is read as of mount.
  useEffect(() => {
    namespaceRef.current = namespace;
    return () => {
      if (isAdmin) {
        dispatch(preferenceWritten({ kind: "debug-namespace-cleared", namespace: namespaceRef.current }));
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const publish = useCallback(
    (data: Record<string, unknown>) => {
      if (!isAdmin || !isDebugMode) return;
      const namespaced: Record<string, unknown> = {};
      for (const [key, value] of Object.entries(data)) {
        namespaced[`${namespace}:${key}`] = value;
      }
      dispatch(preferenceWritten({ kind: "debug-data", data: namespaced }));
    },
    [isAdmin, isDebugMode, namespace, dispatch],
  );

  const publishKey = useCallback(
    (key: string, value: unknown) => {
      if (!isAdmin || !isDebugMode) return;
      dispatch(preferenceWritten({ kind: "debug-data", data: { [`${namespace}:${key}`]: value } }));
    },
    [isAdmin, isDebugMode, namespace, dispatch],
  );

  // Whether debug publishing is active — gate expensive state collection on it.
  const isActive = isAdmin && isDebugMode;

  return { publish, publishKey, isActive };
}

/** The host control that governs a setting. A host without one draws no door (absent, never dead). */
export function SettingDoor(props: ChatSettingDoorProps) {
  const Door = usePrefsPort()?.SettingDoor;
  return Door ? createElement(Door, props) : null;
}
