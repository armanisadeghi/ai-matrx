// features/voice-agent/hooks/useVoiceAgentInstance.ts
//
// Per-route slice instance lifecycle. The two routes — intro and playground
// — each mount this with their own preset; each gets its own slice instance
// so state cannot collide if both are mounted side by side in dev.
//
// Two configuration sources:
//
//   1. `agentId` (intro path) — Step 4 of the agent-system unification.
//      Loads the `agx_agent` row, then extracts voice_id / instructions /
//      realtime_tools from `settings` + `messages[0]` and reapplies them
//      to the slice. The voice agent is now a normal agent row;
//      duplicating it in the Agent Builder produces a custom voice
//      agent at zero infra cost.
//
//   2. `voiceId` / `instructions` / `tools` props (playground path) —
//      explicit per-mount overrides for users iterating on voice
//      config without writing it back to an agent record. Falls back
//      to hardcoded intro defaults in `constants.ts` when no agentId
//      and no override is provided.
//
// Avoiding the async-init race:
//   `initInstance` runs SYNCHRONOUSLY on mount with hardcoded fallback
//   values, so consumers like `useXaiVoiceSession` that subscribe to
//   `voiceId` / `instructions` / `tools` via selectors always see a
//   real instance. The agent record then loads in the background and
//   `applyAgentConfig` swaps the values in. Mic-click timing makes the
//   race largely theoretical (agent load is ~one supabase query while
//   the user is still reading the surface), but seeding with fallbacks
//   removes any possibility of a session starting on `EMPTY_INSTANCE`
//   defaults.

import { useEffect, useMemo, useRef } from "react";
import { useAppDispatch, useAppStore } from "@/lib/redux/hooks";
import {
  DEFAULT_INTRO_TOOLS,
  DEFAULT_INTRO_VOICE,
  INTRO_INSTRUCTIONS,
} from "../constants";
import {
  applyAgentConfig,
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

function asString(x: unknown): string | null {
  return typeof x === "string" ? x : null;
}

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

function readVoiceIdFromAgent(settings: unknown): VoiceId {
  if (settings && typeof settings === "object") {
    const v = (settings as Record<string, unknown>).voice_id;
    if (typeof v === "string" && /^(ara|eve|leo|rex|sal)$/.test(v)) {
      return v as VoiceId;
    }
  }
  return DEFAULT_INTRO_VOICE;
}

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

  const optsRef = useRef(opts);
  optsRef.current = opts;

  useEffect(() => {
    // ── Synchronous seed ────────────────────────────────────────────
    // Initialize the instance immediately with fallback values so any
    // downstream consumer (useXaiVoiceSession) sees a populated slice
    // on its first render. The agent-driven config arrives below.
    const o = optsRef.current;
    dispatch(
      initInstance({
        instanceId,
        voiceId: o.voiceId ?? DEFAULT_INTRO_VOICE,
        instructions: o.instructions ?? INTRO_INSTRUCTIONS,
        tools: o.tools ?? DEFAULT_INTRO_TOOLS,
        preset: o.preset,
        persist: o.persist ?? true,
      }),
    );

    // ── Async agent load ────────────────────────────────────────────
    let cancelled = false;
    if (o.agentId) {
      void (async () => {
        const state0 = store.getState() as RootState;
        if (!state0.agentDefinition.agents?.[o.agentId!]) {
          await dispatch(fetchFullAgent(o.agentId!)).unwrap().catch(() => {
            // Errors are surfaced via the agent-definition slice's own
            // error path; we keep the constants-seeded fallback so the
            // mic never bricks on a transient fetch failure.
          });
        }
        if (cancelled) return;
        const state1 = store.getState() as RootState;
        const agent = state1.agentDefinition.agents?.[o.agentId!];
        if (!agent) return;
        dispatch(
          applyAgentConfig({
            instanceId,
            voiceId: readVoiceIdFromAgent(agent.settings),
            instructions: readInstructionsFromAgent(
              agent.messages,
              INTRO_INSTRUCTIONS,
            ),
            tools: readToolsFromAgent(agent.settings),
          }),
        );
      })();
    }

    return () => {
      cancelled = true;
      dispatch(disposeInstance({ instanceId }));
    };
    // Mount-once init. Config knobs are mutated via updateConfig /
    // applyAgentConfig actions, not by re-running this effect.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dispatch, instanceId, store]);

  return instanceId;
}
