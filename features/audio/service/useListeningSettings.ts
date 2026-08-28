"use client";

/**
 * useListeningSettings — the settings-pane face of the tiered listening
 * config (see ./listeningConfig.ts for the model).
 *
 * Reads the EFFECTIVE values (system → org → user merge, legacy-pref boot
 * fallback) and writes the CURRENT USER's tier only, per-field: `update()`
 * merges the patch into the user's existing `listening` row and upserts that
 * one row (`setNamespaceConfig`), then re-resolves. Targeted rows are the
 * point — no whole-preferences-body write exists to clobber another tab's
 * newer choice, and clearing a field (undefined) falls back to the org/system
 * tier instead of an app hardcode.
 */

import { useCallback } from "react";
import { useAppSelector } from "@/lib/redux/hooks";
import { useSurfaceConfig } from "@/features/surfaces/hooks/useSurfaceConfig";
import { setNamespaceConfig } from "@/features/surfaces/services/surface-config.service";
import type { ListeningConfig } from "@/features/surfaces/config/namespace-registry";
import {
  LISTENING_HOME_SURFACE,
  LISTENING_NAMESPACE,
  selectListeningLanguage,
  selectListeningSpeed,
  selectListeningVoice,
} from "./listeningConfig";
import { resolveVoiceId } from "@/lib/cartesia/config";

export interface UseListeningSettingsResult {
  /** Effective raw voice preference ("" = purpose default). */
  voice: string;
  /** The voice id that will actually speak (purpose defaults applied). */
  effectiveVoiceId: string;
  speed: number;
  language: string;
  /**
   * Merge `patch` into MY tier and persist. Fields left out of the patch keep
   * my existing choices; a field explicitly set to `undefined` clears my
   * override so the org/system tier shows through again.
   */
  update: (patch: Partial<ListeningConfig>) => Promise<void>;
  /** True once the tiered config has resolved (until then values are boot fallbacks). */
  ready: boolean;
}

export function useListeningSettings(): UseListeningSettingsResult {
  const { status, resolved, refresh } = useSurfaceConfig(
    LISTENING_HOME_SURFACE,
  );
  const userId = useAppSelector((s) => s.userAuth?.id ?? null);
  const voice = useAppSelector(selectListeningVoice);
  const speed = useAppSelector(selectListeningSpeed);
  const language = useAppSelector(selectListeningLanguage);

  // My tier's raw row (RLS already limits visible user-tier rows to mine).
  const userRowConfig = (resolved?.configRows.find(
    (r) =>
      r.namespace === LISTENING_NAMESPACE &&
      r.userId !== null &&
      r.scopeId === null,
  )?.config ?? {}) as ListeningConfig;

  const update = useCallback(
    async (patch: Partial<ListeningConfig>) => {
      if (!userId) throw new Error("Not signed in");
      const next: ListeningConfig = { ...userRowConfig, ...patch };
      // Explicit-undefined clears the field from my tier entirely.
      for (const key of Object.keys(next) as (keyof ListeningConfig)[]) {
        if (next[key] === undefined) delete next[key];
      }
      await setNamespaceConfig({
        surfaceName: LISTENING_HOME_SURFACE,
        namespace: LISTENING_NAMESPACE,
        config: next,
        scope: { userId },
      });
      refresh();
    },
    [userId, userRowConfig, refresh],
  );

  return {
    voice,
    effectiveVoiceId: resolveVoiceId(voice, "assistant"),
    speed,
    language,
    update,
    ready: status === "ready",
  };
}
