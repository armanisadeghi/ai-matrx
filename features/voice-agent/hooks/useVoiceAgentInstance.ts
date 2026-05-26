// features/voice-agent/hooks/useVoiceAgentInstance.ts
//
// Per-route slice instance lifecycle. The two routes — intro and playground
// — each mount this with their own preset; each gets its own slice instance
// so state cannot collide if both are mounted side by side in dev.

import { useEffect, useMemo } from "react";
import { useAppDispatch } from "@/lib/redux/hooks";
import {
  DEFAULT_INTRO_TOOLS,
  DEFAULT_INTRO_VOICE,
  INTRO_INSTRUCTIONS,
} from "../constants";
import {
  disposeInstance,
  initInstance,
} from "../state/voiceAgentSlice";
import type { ToolName, VoiceAgentPreset, VoiceId } from "../types";

interface UseVoiceAgentInstanceOpts {
  preset: VoiceAgentPreset;
  /** Optional config overrides — defaults to the intro agent settings. */
  voiceId?: VoiceId;
  instructions?: string;
  tools?: ToolName[];
  /** Whether to persist transcripts to Supabase. Defaults to true. */
  persist?: boolean;
}

export function useVoiceAgentInstance(opts: UseVoiceAgentInstanceOpts): string {
  const dispatch = useAppDispatch();

  // One stable instanceId per mount. The intro and playground routes are
  // distinct presets and conventionally have one mount each — but if the
  // playground is opened twice somehow, the random suffix keeps them isolated.
  const instanceId = useMemo(() => {
    if (opts.preset === "intro") return "intro";
    return `playground-${Math.random().toString(36).slice(2, 8)}`;
    // Mount-once: we intentionally do NOT include opts.preset in deps; the
    // preset doesn't change for a given route.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    dispatch(
      initInstance({
        instanceId,
        voiceId: opts.voiceId ?? DEFAULT_INTRO_VOICE,
        instructions: opts.instructions ?? INTRO_INSTRUCTIONS,
        tools: opts.tools ?? DEFAULT_INTRO_TOOLS,
        preset: opts.preset,
        persist: opts.persist ?? true,
      }),
    );
    return () => {
      dispatch(disposeInstance({ instanceId }));
    };
    // Init is mount-only — config knobs are mutated via updateConfig actions
    // from the playground UI, not by re-running initInstance.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dispatch, instanceId]);

  return instanceId;
}
