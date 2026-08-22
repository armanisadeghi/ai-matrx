"use client";

// ScribeLiveScreen — the "Live" mode of a scribe session.
//
// A realtime two-way VOICE conversation with xAI Grok, scoped to this
// session's working document. It reuses the platform's voice-agent
// primitives (hooks + inner components from `features/voice-agent/`); the
// only thing local to the studio is the layout (embedded inside the scribe
// shell, no full-screen back-header) and the working-document injection.
//
// Phase 1 (this build): the working document is injected into the agent's
// instructions and refreshed whenever it changes, so each session the agent
// starts knows the current document verbatim. Phase 2 (later) would add
// xAI tool/function-calling so the agent can fetch/update the document
// explicitly mid-conversation.

import { useEffect } from "react";
import { toast } from "@/lib/toast";
import { useAppDispatch, useAppSelector } from "@/lib/redux/hooks";
import { useVoiceAgentInstance } from "@/features/voice-agent/hooks/useVoiceAgentInstance";
import { useRealtimeAgentConfig } from "@/features/voice-agent/hooks/useRealtimeAgentConfig";
import { useXaiVoiceSession } from "@/features/voice-agent/hooks/useXaiVoiceSession";
import { usePersistVoiceTranscript } from "@/features/voice-agent/hooks/usePersistVoiceTranscript";
import { SCRIBE_LIVE_MANDATE_KEY } from "@/features/voice-agent/constants";
import { useMandateAgentInstructions } from "@/features/voice-agent/agentInstructions";
// Side-effect import: registers the working-document mutator client tools into
// the shared realtime client-tool registry so `execution:"client"` calls for
// them resolve to a runner. Phase 2 of the realtime tool bridge.
import "./realtimeWorkingDocTools";
import { updateConfig } from "@/features/voice-agent/state/voiceAgentSlice";
import {
  selectVoiceConversationId,
  selectVoiceError,
  selectVoiceMicMuted,
  selectVoiceStatus,
  selectVoiceTotalInterruptions,
  selectVoiceTurns,
} from "@/features/voice-agent/state/selectors";
import { SurfaceRuntimeProvider } from "@/features/surfaces/runtime/SurfaceRuntimeContext";
import {
  TRANSCRIPT_SCRIBE_LIVE_SURFACE,
  createTranscriptScribeLiveScope,
} from "@/features/surfaces/manifests/transcript-scribe-live.manifest";
import { deriveVoiceTranscriptScope } from "@/features/voice-agent/agent-context/voiceTranscriptScope";
import { VoiceOrb } from "@/features/voice-agent/components/VoiceOrb";
import { VoiceEdgeRibbon } from "@/features/voice-agent/components/VoiceEdgeRibbon";
import { VoiceControlCluster } from "@/features/voice-agent/components/VoiceControlCluster";
import { VoiceStatusPill } from "@/features/voice-agent/components/VoiceStatusPill";
import { VoiceTranscriptStream } from "@/features/voice-agent/components/VoiceTranscriptStream";
import { VoiceErrorBanner } from "@/features/voice-agent/components/VoiceErrorBanner";
import { VoiceDebugPanel } from "@/features/voice-agent/components/VoiceDebugPanel";
import { selectIsDebugMode } from "@/lib/redux/preferences/adminDebugSlice";
import { cn } from "@/lib/utils";
import { useStudioAssistant } from "../../hooks/useStudioAssistant";
import { useScribeLiveWriteHandlers } from "../../hooks/useScribeLiveWriteHandlers";

/**
 * DB surface name for the Scribe Live voice surface. Imported from the
 * manifest so the realtime tool-resolution key and the surface this tab emits
 * scope for can never drift apart.
 */
const SCRIBE_LIVE_SURFACE = TRANSCRIPT_SCRIBE_LIVE_SURFACE;

interface ScribeLiveScreenProps {
  sessionId: string;
}

/**
 * 🚨 THE AGENT'S PERSONA IS NOT IN THIS FILE. It is the system message of the
 * agent row `transcript_studio.scribe_live` resolves to; `base` below arrives
 * from that record. Until 2026-08-16 a `LIVE_BASE_INSTRUCTIONS` constant here
 * REPLACED the agent's own prompt, and the two had already diverged — the code
 * copy still told the agent "you cannot edit the working document directly in
 * this live mode" long after the agent was given the working-document mutator
 * tools it now uses every session.
 *
 * What stays in code is the CONNECTION: the current working document is
 * per-session runtime data, so we append it as clearly-labelled context under
 * the agent's own instructions. That is data injection, not a definition.
 */
function withWorkingDocument(base: string, docContent: string): string {
  const doc = docContent.trim();
  return `${base}

---

## Current working document
${doc ? doc : "(empty — nothing has been written to the working document yet)"}`;
}

export function ScribeLiveScreen({ sessionId }: ScribeLiveScreenProps) {
  const dispatch = useAppDispatch();
  const assistant = useStudioAssistant(sessionId);
  const docContent = assistant.workingDocument?.content ?? "";

  // The agent — and its instructions — come from the mandate. `agentId` drives
  // the realtime tool resolve below; `baseInstructions` is the agent record's
  // own system message, which nothing in this repo may substitute for.
  const {
    agentId: liveAgentId,
    instructions: baseInstructions,
    error: agentError,
  } = useMandateAgentInstructions(SCRIBE_LIVE_MANDATE_KEY);

  // Playground preset → `updateConfig` is permitted, so we can refresh the
  // injected working document between sessions. Ephemeral (persist=false):
  // the studio is the system of record; we don't want stray voice
  // conversations cluttering chat history.
  const instanceId = useVoiceAgentInstance({
    preset: "playground",
    // Empty until the agent record resolves. `useXaiVoiceSession.start()`
    // refuses to open a session on empty instructions, so the mic reports the
    // real problem instead of running a persona this file made up.
    instructions: "",
    // Seed with the xAI Realtime built-ins (web + X search) for live look-ups.
    // `useRealtimeAgentConfig` overwrites this with the backend-resolved set
    // (incl. the working-doc mutator client tools) when a scribe-live agent id
    // is supplied. The seed is `RealtimeToolSet`-shaped: builtins carry empty
    // params and `execution: "builtin"`.
    tools: [
      {
        name: "web_search",
        description: "Search the web.",
        parameters: {},
        execution: "builtin",
      },
      {
        name: "x_search",
        description: "Search X (Twitter).",
        parameters: {},
        execution: "builtin",
      },
    ],
    persist: false,
  });

  // Resolve the realtime tool set for the scribe-live surface from the mandate's
  // agent — the backend classifies its inline working-doc mutators as `client`
  // (declared to xAI, run locally via the shared registry) and the
  // auto-injected data/data_action as `server`. This OVERWRITES the seeded
  // builtins above with the full resolved set.
  useRealtimeAgentConfig({
    instanceId,
    agentId: liveAgentId ?? undefined,
    surface: SCRIBE_LIVE_SURFACE,
  });
  const { status, error, micMuted, toggle, toggleMute } = useXaiVoiceSession({
    instanceId,
    agentId: liveAgentId ?? undefined,
    surface: SCRIBE_LIVE_SURFACE,
    sessionId,
  });
  usePersistVoiceTranscript({ instanceId });

  const turns = useAppSelector((s) => selectVoiceTurns(s, instanceId));
  const liveError = useAppSelector((s) => selectVoiceError(s, instanceId));
  const liveStatus = useAppSelector((s) => selectVoiceStatus(s, instanceId));
  const debugMode = useAppSelector(selectIsDebugMode);
  void status;
  void error;

  // ─── Surface scope (matrx-user/transcript-scribe-live) ──────────────────
  // Nested inside the studio shell: the deepest registered provider wins, so
  // while the Live tab is mounted ITS scope is what the header Agents panel
  // runs against. Values are read in render; `getScope` runs only on ▶.
  const scopeMicMuted = useAppSelector((s) => selectVoiceMicMuted(s, instanceId));
  const scopeConversationId = useAppSelector((s) =>
    selectVoiceConversationId(s, instanceId),
  );
  const scopeInterruptions = useAppSelector((s) =>
    selectVoiceTotalInterruptions(s, instanceId),
  );

  const getSurfaceScope = () => {
    // Durable/arrived transcript, never the audio-gated render buffer.
    const transcript = deriveVoiceTranscriptScope(turns);
    const doc = docContent.trim();
    return createTranscriptScribeLiveScope({
      session_id: sessionId,
      // The agent the mandate ACTUALLY resolved to — a user or org binding can
      // swap it, so reporting a fixed id here would be a lie. Empty while it
      // is still resolving.
      live_agent_id: liveAgentId ?? "",
      // The persisted studio_documents body is the durable truth here — the
      // spoken chatter about it is not.
      working_document_word_count: doc ? doc.split(/\s+/).length : 0,
      connection_status: liveStatus,
      mic_muted: scopeMicMuted,
      total_interruptions: scopeInterruptions,
      turn_count: transcript.turn_count,
      transcript_turns: transcript.transcript_turns,
      // Baseline `content` is the ARTIFACT (the working document), not the
      // conversation — a generic "clean this up" agent must act on the doc.
      content: doc || undefined,
      working_document_id: assistant.workingDocument?.id ?? undefined,
      working_document_content: doc || undefined,
      voice_conversation_id: scopeConversationId ?? undefined,
      connection_error: liveError ?? undefined,
      transcript_text: transcript.transcript_text,
      last_user_utterance: transcript.last_user_utterance,
      last_assistant_utterance: transcript.last_assistant_utterance,
      active_turn: transcript.active_turn,
    });
  };

  // ─── Surface write targets (working_document_content / append) ──────────
  // Closes the write half for TURN-BASED agents launched from the header
  // Agents popover: the realtime mutator tools imported above serve only the
  // voice agent inside the xAI turn loop. Both land through the same canonical
  // thunk the editor's autosave uses. See the hook for why there is
  // deliberately no live-session guard here.
  const getSurfaceWriteHandlers = useScribeLiveWriteHandlers(sessionId);

  // Keep the agent's instructions current: its own system message from the DB,
  // plus the latest working document appended as context. The orchestrator
  // reads instructions from the slice at session start (`session.update`), so
  // the next time the user taps the mic the agent sees both. Stays EMPTY until
  // the agent record resolves — never a locally-authored stand-in.
  useEffect(() => {
    dispatch(
      updateConfig({
        instanceId,
        instructions: baseInstructions
          ? withWorkingDocument(baseInstructions, docContent)
          : "",
      }),
    );
  }, [dispatch, instanceId, docContent, baseInstructions]);

  // The agent record is the only source of this surface's instructions, so a
  // failure to read it is a real dead end — say so instead of letting the mic
  // fail with a generic message.
  useEffect(() => {
    if (!agentError) return;
    toast.error("The live assistant is unavailable", {
      description: `${agentError} Live voice cannot start until it resolves.`,
    });
  }, [agentError]);

  // Surface the common, actionable failures as toasts (the inline banner
  // shows the rest). Mirrors VoiceAgentSurface's handling for the codes a
  // user actually hits first.
  useEffect(() => {
    if (!liveError) return;
    const code = liveError.code;
    if (code === "mic-permission-denied") {
      // access-errors: ok — the browser's own getUserMedia permission verdict, not a record read
      toast.error("Microphone access denied", {
        description:
          "Allow microphone access in your browser settings, then tap the mic to try again.",
      });
    } else if (code === "mic-no-microphone") {
      toast.error("No microphone detected", {
        description: "Plug in a microphone, then tap the mic to try again.",
      });
    } else if (
      code === "token-service-unavailable" ||
      code === "service-unavailable"
    ) {
      toast.error("Live voice is not configured", {
        description:
          "The voice service credentials are missing on this deployment.",
      });
    }
  }, [liveError]);

  return (
    <SurfaceRuntimeProvider
      surfaceName={SCRIBE_LIVE_SURFACE}
      getScope={getSurfaceScope}
      getWriteHandlers={getSurfaceWriteHandlers}
    >
    <div className="relative flex h-full flex-col overflow-hidden">
      <VoiceEdgeRibbon status={liveStatus} />

      {/* Live diagnostics — gated behind app-wide debug mode. */}
      {debugMode && (
        <div className="relative z-20 shrink-0 px-2 pt-2">
          <VoiceDebugPanel instanceId={instanceId} />
        </div>
      )}

      {/* Transcript — fades older content so the eye is drawn to the mic. */}
      <section
        className={cn(
          "relative z-10 min-h-0 flex-1 overflow-y-auto",
          "[mask-image:linear-gradient(to_bottom,transparent,#000_15%,#000_85%,transparent)]",
        )}
        aria-label="Live voice transcript"
        data-surface-value="transcript_text"
      >
        {turns.length === 0 ? (
          <div className="flex h-full items-center justify-center px-6">
            <p className="max-w-md text-center text-base leading-relaxed text-muted-foreground">
              Tap the mic to talk through your recordings with Grok. It can see
              your working document and help you shape it — out loud.
            </p>
          </div>
        ) : (
          <VoiceTranscriptStream turns={turns} />
        )}
      </section>

      {/* Hero: status + mic + error. The orb defaults to 260px — sized for a
          full-viewport voice surface — but here the tab sits BELOW the shared
          agent bar + working-document header, so a 260px orb makes this hero
          taller than the tab and the mic/error get clipped off the bottom. A
          smaller orb keeps the whole control cluster on-screen. */}
      <section className="relative z-10 flex shrink-0 flex-col items-center justify-end gap-3 px-4 pb-4 pb-safe">
        <div data-surface-value="connection_status">
          <VoiceStatusPill status={liveStatus} micMuted={micMuted} />
        </div>
        <div className="relative inline-flex items-center justify-center">
          <VoiceOrb status={liveStatus} size={188} />
          <div className="relative z-10">
            <VoiceControlCluster
              status={liveStatus}
              micMuted={micMuted}
              onToggleSession={toggle}
              onToggleMute={toggleMute}
            />
          </div>
        </div>
        <VoiceErrorBanner error={liveError} />
      </section>
    </div>
    </SurfaceRuntimeProvider>
  );
}
