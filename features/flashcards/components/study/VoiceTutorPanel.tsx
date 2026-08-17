"use client";

// features/flashcards/components/study/VoiceTutorPanel.tsx
//
// VISION §4 — "the student taps 'I'm confused' and immediately enters a voice
// conversation." A compact, INLINE realtime voice-tutor session for the card
// the learner is studying, mounted in the study deck's under-card stack (page
// only grows downward — no window, no navigation, the card never moves).
//
// Follows the ScribeLiveScreen composition exactly (the second consumer of the
// voice hooks with purpose-built UI — this is the established pattern, not a
// fork of VoiceAgentSurface):
//   useMandateAgentInstructions("education.voice_tutor") → agentId + the
//   agent's OWN system message (nothing here may substitute for it) →
//   useVoiceAgentInstance (playground preset so updateConfig may refresh the
//   injected card context) → updateConfig appends the CURRENT CARD as a
//   <study_context> block → useRealtimeAgentConfig + useXaiVoiceSession →
//   VoiceMicButton / VoiceStatusPill / VoiceTranscriptStream.
//
// 🚨 The tutor's persona lives in the DATABASE (agent
// 00000000-0000-4000-8000-000000000003 behind the education.voice_tutor
// mandate). This file appends session CONTEXT — the card — never instructions.
//
// Ephemeral (persist=false): the study session is the system of record; a
// 30-second "explain this card" call is not a chat the learner wants in their
// history. Mount with key={cardId} so a card change starts a fresh instance
// with fresh context.

import { useEffect } from "react";
import { useAppDispatch, useAppSelector } from "@/lib/redux/hooks";
import { useMandateAgentInstructions } from "@/features/voice-agent/agentInstructions";
import { useVoiceAgentInstance } from "@/features/voice-agent/hooks/useVoiceAgentInstance";
import { useRealtimeAgentConfig } from "@/features/voice-agent/hooks/useRealtimeAgentConfig";
import { useXaiVoiceSession } from "@/features/voice-agent/hooks/useXaiVoiceSession";
import { updateConfig } from "@/features/voice-agent/state/voiceAgentSlice";
import {
  selectVoiceTurns,
  selectVoiceError,
} from "@/features/voice-agent/state/selectors";
import { VoiceMicButton } from "@/features/voice-agent/components/VoiceMicButton";
import { VoiceStatusPill } from "@/features/voice-agent/components/VoiceStatusPill";
import { VoiceTranscriptStream } from "@/features/voice-agent/components/VoiceTranscriptStream";

export const EDUCATION_VOICE_TUTOR_MANDATE = "education.voice_tutor";

/** The DB surface tool-resolution runs against (the study deck's surface). */
const FLASHCARDS_SURFACE = "matrx-user/education-flashcards";

export interface VoiceTutorCardContext {
  front: string;
  back: string;
  topic?: string | null;
  /** True once the learner has revealed the answer this visit. */
  revealed: boolean;
}

/** The card as a labeled context block appended AFTER the agent's own prompt. */
function withStudyContext(
  base: string,
  card: VoiceTutorCardContext,
): string {
  const lines = [
    `The learner is on this flashcard:`,
    `Question (front): ${card.front}`,
    `Answer (back): ${card.back}`,
  ];
  if (card.topic) lines.push(`Topic: ${card.topic}`);
  lines.push(
    card.revealed
      ? "They have already revealed the answer — help them truly understand and retain it."
      : "They have NOT revealed the answer yet — guide their thinking without giving it away unless they ask.",
  );
  return `${base}\n\n<study_context>\n${lines.join("\n")}\n</study_context>`;
}

export function VoiceTutorPanel({
  card,
  className,
}: {
  card: VoiceTutorCardContext;
  className?: string;
}) {
  const dispatch = useAppDispatch();

  // The agent — and its instructions — come from the mandate. `agentId` drives
  // the realtime tool resolve; `baseInstructions` is the agent record's own
  // system message, which nothing in this repo may substitute for.
  const {
    agentId,
    instructions: baseInstructions,
    error: agentError,
  } = useMandateAgentInstructions(EDUCATION_VOICE_TUTOR_MANDATE);

  const instanceId = useVoiceAgentInstance({
    // Playground preset → `updateConfig` is permitted, so the card context can
    // refresh. Empty until the agent resolves: `useXaiVoiceSession.start()`
    // refuses to open a session on empty instructions, so the mic reports the
    // real problem instead of running a persona this file made up.
    preset: "playground",
    instructions: "",
    tools: [
      {
        name: "web_search",
        description: "Search the web.",
        parameters: {},
        execution: "builtin",
      },
    ],
    persist: false,
  });

  useRealtimeAgentConfig({
    instanceId,
    agentId: agentId ?? undefined,
    surface: FLASHCARDS_SURFACE,
  });
  const { status, micMuted, toggle } = useXaiVoiceSession({
    instanceId,
    agentId: agentId ?? undefined,
    surface: FLASHCARDS_SURFACE,
  });

  const turns = useAppSelector((s) => selectVoiceTurns(s, instanceId));
  const liveError = useAppSelector((s) => selectVoiceError(s, instanceId));

  // Keep the agent's instructions current: its own system message from the DB
  // plus THIS card as context. The orchestrator reads instructions from the
  // slice at session start (`session.update`), so the next mic tap sees both.
  const { front, back, topic, revealed } = card;
  useEffect(() => {
    dispatch(
      updateConfig({
        instanceId,
        instructions: baseInstructions
          ? withStudyContext(baseInstructions, {
              front,
              back,
              topic,
              revealed,
            })
          : "",
      }),
    );
  }, [dispatch, instanceId, baseInstructions, front, back, topic, revealed]);

  return (
    <div
      className={
        className ??
        "rounded-lg border border-border bg-muted/30 p-3"
      }
    >
      <div className="flex items-center gap-3">
        <VoiceMicButton status={status} onToggle={toggle} size={48} />
        <div className="min-w-0 flex-1">
          <VoiceStatusPill status={status} micMuted={micMuted} />
          <p className="mt-0.5 text-[11px] text-muted-foreground">
            Talk this card through out loud — the tutor already knows which
            card you&apos;re on.
          </p>
        </div>
      </div>

      {agentError && (
        <p className="mt-2 text-xs text-muted-foreground">
          The voice tutor is unavailable right now — its agent could not be
          loaded. Please try again shortly.
        </p>
      )}
      {liveError && !agentError && (
        <p className="mt-2 text-xs text-muted-foreground">
          {liveError.message ?? "The voice session hit a problem — tap the mic to try again."}
        </p>
      )}

      {turns.length > 0 && (
        <VoiceTranscriptStream
          turns={turns}
          className="mt-2 max-h-48 overflow-y-auto"
        />
      )}
    </div>
  );
}
