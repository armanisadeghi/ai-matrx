// features/voice-agent/hooks/useVoiceAgentInstance.ts
//
// Per-route slice instance lifecycle. The two routes — intro and playground
// — each mount this with their own preset; each gets its own slice instance
// so state cannot collide if both are mounted side by side in dev.
//
// Two configuration sources:
//
//   1. `agentId` (intro path) — Step 4 of the agent-system unification.
//      The hook loads the `agx_agent` row, then extracts voice_id /
//      instructions / realtime_tools from `settings` + `messages[0]` and
//      seeds the slice. The voice agent is now a normal agent row;
//      duplicating it in the Agent Builder produces a custom voice
//      agent at zero infra cost.
//
//   2. `voiceId` / `instructions` / `tools` props (playground path) —
//      explicit per-mount overrides, for users iterating on voice
//      config without writing it back to an agent record. Falls back to
//      hardcoded intro defaults in `constants.ts` when no agentId and
//      no override is provided.
//
// Init blocks until the agent record arrives (status pulses through the
// slice's `connecting` so the surface doesn't render a confusingly empty
// mic before the agent identity is known).

import { useEffect, useMemo, useRef } from "react";
import { useAppDispatch, useAppStore } from "@/lib/redux/hooks";
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
import { fetchFullAgent } from "@/features/agents/redux/agent-definition/thunks";
import type { RootState } from "@/lib/redux/store";

interface UseVoiceAgentInstanceOpts {
  preset: VoiceAgentPreset;
  /**
   * When set, loads the agent record and reads voice config from it.
   * `settings.voice_id`, `settings.realtime_tools`, and the first
   * system message in `messages[0].content[0].text` drive the slice.
   *
   * When unset, falls back to per-prop overrides (and the constants
   * defaults below) — used by the playground for ad-hoc iteration.
   */
  agentId?: string;
  /** Override knobs — used only when `agentId` is not set. */
  voiceId?: VoiceId;
  instructions?: string;
  tools?: ToolName[];
  /** Whether to persist transcripts to Supabase. Defaults to true. */
  persist?: boolean;
}

/** Defensive narrower: returns x as string if it is one, otherwise null. */
function asString(x: unknown): string | null {
  return typeof x === "string" ? x : null;
}

/** Extract the system-instruction text from an agent's messages[]. */
function readInstructionsFromAgent(
  messages: unknown,
  fallback: string,
): string {
  if (!Array.isArray(messages) || messages.length === 0) return fallback;
  const sys = (messages as Array<{ role?: string; content?: unknown }>).find(
    (m) => m?.role === "system",
  );
  if (!sys || !Array.isArray(sys.content)) return fallback;
  const text = (sys.content as Array<{ type?: string; text?: unknown }>).find(
    (b) => b?.type === "text",
  )?.text;
  return asString(text) ?? fallback;
}

/** Extract voice_id from agent.settings, falling back to DEFAULT_INTRO_VOICE. */
function readVoiceIdFromAgent(settings: unknown): VoiceId {
  if (settings && typeof settings === "object") {
    const v = (settings as Record<string, unknown>).voice_id;
    if (typeof v === "string" && /^(ara|eve|leo|rex|sal)$/.test(v)) {
      return v as VoiceId;
    }
  }
  return DEFAULT_INTRO_VOICE;
}

/** Extract realtime_tools from agent.settings. */
function readToolsFromAgent(settings: unknown): ToolName[] {
  const fallback: ToolName[] = [...DEFAULT_INTRO_TOOLS];
  if (settings && typeof settings === "object") {
    const t = (settings as Record<string, unknown>).realtime_tools;
    if (Array.isArray(t)) {
      const valid = t.filter(
        (x): x is ToolName => x === "web_search" || x === "x_search",
      );
      if (valid.length > 0) return valid;
    }
  }
  return fallback;
}

export function useVoiceAgentInstance(opts: UseVoiceAgentInstanceOpts): string {
  const dispatch = useAppDispatch();
  const store = useAppStore();

  // One stable instanceId per mount. Intro is keyed on agentId so
  // multiple intro mounts (one per agent) don't collide; the playground
  // gets a random suffix so two playground tabs are independent.
  const instanceId = useMemo(() => {
    if (opts.preset === "intro" && opts.agentId) {
      return `intro-${opts.agentId}`;
    }
    if (opts.preset === "intro") return "intro";
    return `playground-${Math.random().toString(36).slice(2, 8)}`;
    // Mount-once on (preset, agentId).
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Track the latest opts so the async loader doesn't dispatch stale config.
  const optsRef = useRef(opts);
  optsRef.current = opts;

  useEffect(() => {
    let cancelled = false;

    async function init(): Promise<void> {
      const o = optsRef.current;
      let voiceId: VoiceId;
      let instructions: string;
      let tools: ToolName[];

      if (o.agentId) {
        // Ensure the agent row is in Redux before reading config off it.
        const state = store.getState() as RootState;
        const existing = state.agentDefinition.agents?.[o.agentId];
        if (!existing) {
          await dispatch(fetchFullAgent(o.agentId)).unwrap().catch(() => {
            // Errors are surfaced via the slice's agent error field; we
            // continue with hardcoded defaults so the mic never bricks
            // on a transient fetch failure.
          });
        }
        const latest = store.getState() as RootState;
        const agent = latest.agentDefinition.agents?.[o.agentId];
        voiceId = readVoiceIdFromAgent(agent?.settings);
        instructions = readInstructionsFromAgent(
          agent?.messages,
          INTRO_INSTRUCTIONS,
        );
        tools = readToolsFromAgent(agent?.settings);
      } else {
        voiceId = o.voiceId ?? DEFAULT_INTRO_VOICE;
        instructions = o.instructions ?? INTRO_INSTRUCTIONS;
        tools = o.tools ?? DEFAULT_INTRO_TOOLS;
      }

      if (cancelled) return;
      dispatch(
        initInstance({
          instanceId,
          voiceId,
          instructions,
          tools,
          preset: o.preset,
          persist: o.persist ?? true,
        }),
      );
    }

    void init();
    return () => {
      cancelled = true;
      dispatch(disposeInstance({ instanceId }));
    };
    // Mount-once init. Config knobs are mutated via updateConfig actions
    // from the playground UI, not by re-running initInstance.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dispatch, instanceId, store]);

  return instanceId;
}
