"use client";

// features/voice-agent/hooks/useVoicePlaygroundWriteHandlers.ts
//
// The WRITE half of the `matrx-user/chat-voice` surface — one handler per
// `writeTargets` entry declared in
// `features/surfaces/manifests/chat-voice.manifest.ts`.
//
// Rules this file exists to hold (mirrors `useWarRoomWriteHandlers.ts` and the
// tasks exemplar in `features/tasks/components/editor/TaskEditorBody.tsx`):
//
//  • Every handler VALIDATES its input and THROWS on a bad shape. The writeback
//    seam (`features/surfaces/runtime/surface-writeback.ts`) converts a throw
//    into a safe error envelope the agent reads and can correct against — a
//    silently coerced value would be a lie told to both sides.
//
//  • Every handler dispatches the SAME `updateConfig` action the settings
//    sheet's own controls fire: `InstructionsEditor`'s textarea `onChange` and
//    `VoicePicker`'s `onValueChange`. Never a parallel write path.
//
//  • Every handler CONFIRMS the write actually landed. `updateConfig` is a
//    reducer that returns SILENTLY in three cases — no instance for this id,
//    the instance's preset is not "playground", and a falsy `voiceId` — so a
//    bare dispatch would report success for a write that never happened. The
//    store is the only honest evidence, and it is re-read after every dispatch.
//
//  • Every handler refuses while a voice session is LIVE. Mid-session the
//    change either does nothing (the instructions were already sent in
//    `session.update`) or silently alters what the user is talking to.
//
// STATE IS READ FROM THE STORE AT CALL TIME, never from a render snapshot.
// `applySurfaceWrite` resolves the handler BEFORE it shows the confirm dialog,
// so a guard reading a status captured in a closure can act on a value that is
// 30+ seconds stale — long enough for the user to have started a session while
// the dialog was open. `store.getState()` cannot go stale that way (a stronger
// version of the `useRef`-kept-current guard in `ImageStudioShell.tsx`).

import { useMemo } from "react";

import type { SurfaceWriteHandlers } from "@/features/surfaces/runtime/SurfaceRuntimeContext";
import { useAppDispatch, useAppStore } from "@/lib/redux/hooks";
import type { RootState } from "@/lib/redux/store";
import { VOICES } from "../constants";
import { updateConfig } from "../state/voiceAgentSlice";
import {
  selectVoiceInstanceExists,
  selectVoiceInstructions,
  selectVoicePreset,
  selectVoiceStatus,
  selectVoiceVoiceId,
} from "../state/selectors";
import type { VoiceId } from "../types";

/**
 * The only two statuses in which the playground's settings are editable —
 * the exact condition `VoiceAgentSurface` uses to grey the sheet's controls
 * (`disabled={liveStatus !== "idle" && liveStatus !== "error"}`). Anything
 * else means a realtime session is connecting or running.
 */
const EDITABLE_STATUSES = new Set(["idle", "error"]);

/** Allowed `voice_id` values, derived from the picker's own option list. */
const ALLOWED_VOICE_IDS: readonly string[] = VOICES.map((v) => v.id);

export function useVoicePlaygroundWriteHandlers(
  instanceId: string,
): SurfaceWriteHandlers {
  const dispatch = useAppDispatch();
  const store = useAppStore();

  return useMemo<SurfaceWriteHandlers>(() => {
    /**
     * Throws unless the playground's settings state is mounted AND no voice
     * session is live. Reads the store fresh on every call — see the header.
     */
    const assertEditable = (state: RootState) => {
      // Refuse loudly rather than staging into nothing: with no instance
      // there is no settings state this target could mean. Checked BEFORE the
      // preset, because the selectors fall back to a frozen `intro` instance
      // when the id is absent and would otherwise blame the wrong route.
      if (!selectVoiceInstanceExists(state, instanceId))
        throw new Error(
          "The voice playground's settings are not mounted, so there is nothing to write. Ask the user to open /chat/voice/playground first.",
        );
      if (selectVoicePreset(state, instanceId) !== "playground")
        throw new Error(
          "Voice settings are editable only on the Voice Playground (/chat/voice/playground). The introduction agent at /chat/voice runs a locked configuration that a person has to change in the Agent Builder.",
        );
      const status = selectVoiceStatus(state, instanceId);
      if (!EDITABLE_STATUSES.has(status))
        throw new Error(
          `A voice session is live right now (status: "${status}"), so this change was refused. The running session already received its voice and instructions — changing them now would either do nothing or silently alter what the user is mid-conversation with. Ask the user to end the session first, then apply this again; it will take effect on the next session.`,
        );
    };

    return {
      // ── System prompt ───────────────────────────────────────────────────
      voice_instructions: (value: unknown) => {
        if (typeof value !== "string" || !value.trim())
          throw new Error(
            "voice_instructions expects a non-empty string containing the full system prompt. Clearing the prompt is the user's own action, not a write.",
          );
        assertEditable(store.getState());
        const next = value;
        dispatch(updateConfig({ instanceId, instructions: next }));
        // `updateConfig` returns silently when it will not apply — the store
        // is the only honest evidence that the value actually landed.
        if (selectVoiceInstructions(store.getState(), instanceId) !== next)
          throw new Error(
            "Writing the voice instructions did not land — the playground settings state rejected the change.",
          );
      },

      append_voice_instructions: (value: unknown) => {
        if (typeof value !== "string" || !value.trim())
          throw new Error(
            "append_voice_instructions expects a non-empty string — the text to add to the end of the existing prompt.",
          );
        const state = store.getState();
        assertEditable(state);
        const current = selectVoiceInstructions(state, instanceId);
        const addition = value.trim();
        // Blank-line separated, matching how the prompt's own sections read.
        // Appending to an empty prompt must not leave leading blank lines.
        const next = current.trim()
          ? `${current.trimEnd()}\n\n${addition}`
          : addition;
        dispatch(updateConfig({ instanceId, instructions: next }));
        if (selectVoiceInstructions(store.getState(), instanceId) !== next)
          throw new Error(
            "Appending to the voice instructions did not land — the playground settings state rejected the change.",
          );
      },

      // ── Voice ───────────────────────────────────────────────────────────
      voice_id: (value: unknown) => {
        if (typeof value !== "string" || !ALLOWED_VOICE_IDS.includes(value))
          throw new Error(
            `voice_id must be exactly one of: ${ALLOWED_VOICE_IDS.join(
              ", ",
            )}. Received ${JSON.stringify(
              value,
            )}, which is not a voice this provider offers.`,
          );
        assertEditable(store.getState());
        dispatch(updateConfig({ instanceId, voiceId: value as VoiceId }));
        if (selectVoiceVoiceId(store.getState(), instanceId) !== value)
          throw new Error(
            "Changing the voice did not land — the playground settings state rejected the change.",
          );
      },
    };
  }, [dispatch, store, instanceId]);
}
