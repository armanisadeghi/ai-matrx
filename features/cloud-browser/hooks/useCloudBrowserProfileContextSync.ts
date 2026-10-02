"use client";

/**
 * useCloudBrowserProfileContextSync — tells the conversation WHICH cloud
 * browser the person picked in the panel.
 *
 * Before this, `ProfileSelector` → `useCloudBrowser.selectProfile` moved the
 * panel's view to another browser and nothing told the agent: it kept working
 * against whatever profile its tool call resolved on its own, so "use this
 * one" was a UI-only choice. Same shape as the code editor's active file
 * (`features/code-editor/agent-code-editor/hooks/useIdeContextSync.ts`): the
 * surface publishes ONE `instanceContext` entry and the server exposes it to
 * the model through `ctx_get(key)`.
 *
 * 🚨 This is MACHINE content, so it goes out as a context entry and NEVER
 * through `setUserInputText` (THE USER-INPUT LAW — `user_input` carries only
 * what the human typed).
 */

import { useEffect, useRef } from "react";
import { useAppDispatch } from "@/lib/redux/hooks";
import {
  removeContextEntry,
  setContextEntries,
} from "@ai-matrx/chat/agents/redux/execution-system/instance-context/instance-context.slice";

/** The one context key this surface owns. */
export const CLOUD_BROWSER_PROFILE_CONTEXT_KEY = "cloud_browser_profile";

/** Label shown wherever the context entry is listed for a person. */
export const CLOUD_BROWSER_PROFILE_CONTEXT_LABEL = "Cloud Browser";

/**
 * The entry's value. Sent as a JSON object (`type: "json"`), matching the
 * composite `vsc_active_file` entry the editor publishes — the server reads a
 * json entry as a dict.
 */
export interface CloudBrowserProfileContextValue {
  profile_id: string;
  display_name: string;
}

/** Just the fields this hook needs — any `CloudBrowserProfile` satisfies it. */
export interface CloudBrowserProfileContextInput {
  id: string;
  displayName: string;
}

/**
 * Publish the panel's active browser onto `conversationId`.
 *
 * No-ops while `conversationId` is falsy (the standalone window opener has no
 * chat). Dispatches only when the profile actually changes; when the profile
 * goes away the entry is REMOVED (a stale browser id is worse than none —
 * `setContextEntries` is merge-only and can never clear it).
 */
export function useCloudBrowserProfileContextSync(
  conversationId: string | null | undefined,
  profile: CloudBrowserProfileContextInput | null | undefined,
): void {
  const dispatch = useAppDispatch();
  const signatureRef = useRef<string | null>(null);

  const profileId = profile?.id ?? null;
  const displayName = profile?.displayName ?? null;

  useEffect(() => {
    if (!conversationId) return;

    const signature = `${conversationId}\0${profileId ?? ""}\0${displayName ?? ""}`;
    if (signatureRef.current === signature) return;
    signatureRef.current = signature;

    if (!profileId) {
      dispatch(
        removeContextEntry({
          conversationId,
          key: CLOUD_BROWSER_PROFILE_CONTEXT_KEY,
        }),
      );
      return;
    }

    const value: CloudBrowserProfileContextValue = {
      profile_id: profileId,
      display_name: displayName ?? "",
    };

    dispatch(
      setContextEntries({
        conversationId,
        entries: [
          {
            key: CLOUD_BROWSER_PROFILE_CONTEXT_KEY,
            value,
            type: "json",
            label: CLOUD_BROWSER_PROFILE_CONTEXT_LABEL,
          },
        ],
      }),
    );
  }, [conversationId, profileId, displayName, dispatch]);
}
