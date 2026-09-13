"use client";

/**
 * useListeningSettings — the settings-pane face of the listening settings
 * (see ./listeningConfig.ts for the model).
 *
 * VOICE reads the ladder-resolved knob (`media.listening.voice`) and writes
 * MY user rung through the ONE settings write path (`setKnobOverride`);
 * clearing (`voice: undefined`) removes my rung so the organization's or the
 * platform's choice shows through. Speed and language still read the
 * tiered surface-config `listening` namespace and write my tier of it,
 * per-field (`setNamespaceConfig`), until they get knob rows of their own.
 *
 * CARRY-OVER (once per person): before 2026-09-12 the voice lived in the
 * `listening` namespace. If my namespace row still holds a voice, the first
 * mount copies it to my user rung (it WAS my user tier) and clears it from
 * the row, announcing itself in the console, so nobody's voice silently
 * reverts and the rival store stops holding a voice.
 */

import { useCallback, useEffect, useRef } from "react";
import { useAppSelector } from "@/lib/redux/hooks";
import { useSurfaceConfig } from "@/features/surfaces/hooks/useSurfaceConfig";
import { setNamespaceConfig } from "@/features/surfaces/services/surface-config.service";
import type { ListeningConfig } from "@/features/surfaces/config/namespace-registry";
import { setKnobOverride } from "@/lib/scoped-config/service";
import { useSessionKnob } from "@/lib/scoped-config/sessionKnob";
import { selectOrganizationId } from "@/lib/redux/slices/appContextSlice";
import {
  LISTENING_HOME_SURFACE,
  LISTENING_NAMESPACE,
  LISTENING_VOICE_KNOB,
  selectListeningLanguage,
  selectListeningSpeed,
} from "./listeningConfig";
import { resolveVoiceId } from "@/lib/cartesia/config";

const [VOICE_FEATURE, VOICE_KEY] = ["media.listening", "voice"] as const;

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
  /** True once the voice knob and the tiered cadence config have resolved. */
  ready: boolean;
}

export function useListeningSettings(): UseListeningSettingsResult {
  const { status, resolved, refresh } = useSurfaceConfig(
    LISTENING_HOME_SURFACE,
  );
  const userId = useAppSelector((s) => s.userAuth?.id ?? null);
  const organizationId = useAppSelector(selectOrganizationId);
  const knobVoice = useSessionKnob(LISTENING_VOICE_KNOB);
  const voice = typeof knobVoice === "string" ? knobVoice : "";
  const speed = useAppSelector(selectListeningSpeed);
  const language = useAppSelector(selectListeningLanguage);

  // My tier's raw row (RLS already limits visible user-tier rows to mine).
  const userRowConfig = (resolved?.configRows.find(
    (r) =>
      r.namespace === LISTENING_NAMESPACE &&
      r.userId !== null &&
      r.scopeId === null,
  )?.config ?? {}) as ListeningConfig;

  const writeVoice = useCallback(
    async (next: string | undefined) => {
      if (!userId) throw new Error("Not signed in");
      if (!organizationId) throw new Error("No active organization — a voice is kept per organization.");
      const result = await setKnobOverride({
        feature: VOICE_FEATURE,
        key: VOICE_KEY,
        scopeKind: "user",
        scopeId: userId,
        organizationId,
        value: next === undefined ? null : next,
      });
      if (!result.ok) {
        throw new Error(`Voice not saved: ${result.reason}${result.detail ? ` — ${result.detail}` : ""}`);
      }
    },
    [userId, organizationId],
  );

  const writeCadence = useCallback(
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

  const update = useCallback(
    async (patch: Partial<ListeningConfig>) => {
      const { voice: voicePatch, ...cadence } = patch;
      if ("voice" in patch) await writeVoice(voicePatch);
      if (Object.keys(cadence).length > 0 || "voice" in patch) {
        // The namespace row never holds a voice again (the knob owns it);
        // clearing it here is what retires the rival store's voice field.
        await writeCadence({ ...cadence, voice: undefined });
      }
    },
    [writeVoice, writeCadence],
  );

  // Carry-over of a pre-ladder voice choice — once, announced, then cleared.
  const carriedOver = useRef(false);
  const legacyVoice = userRowConfig.voice;
  useEffect(() => {
    if (carriedOver.current || status !== "ready" || knobVoice === undefined) return;
    if (!legacyVoice || !userId || !organizationId) return;
    carriedOver.current = true;
    console.warn(
      `[listening] Carrying your voice choice ("${legacyVoice}") from the retired listening namespace to the settings ladder (media.listening.voice, your rung) — one-time migration.`,
    );
    void (async () => {
      try {
        // The row's voice WAS my user tier, so it lands on my user rung.
        await writeVoice(legacyVoice);
        await writeCadence({ voice: undefined });
      } catch (error) {
        console.error("[listening] Voice carry-over failed; the namespace row still holds the old voice:", error);
      }
    })();
  }, [status, knobVoice, legacyVoice, userId, organizationId, writeVoice, writeCadence]);

  return {
    voice,
    effectiveVoiceId: resolveVoiceId(voice, "assistant"),
    speed,
    language,
    update,
    ready: status === "ready" && knobVoice !== undefined,
  };
}
