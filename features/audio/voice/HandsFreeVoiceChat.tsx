"use client";

import { Mic, MicOff, Moon, Volume2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useVoiceChat, type VoiceChatPhase } from "@/hooks/tts/useVoiceChat";
import { SurfaceRuntimeProvider } from "@/features/surfaces/runtime/SurfaceRuntimeContext";
import { createVoiceChatScope, VOICE_CHAT_SURFACE } from "@/features/surfaces/manifests/voice-chat.manifest";

const PHASE_COPY: Record<VoiceChatPhase, string> = {
  starting: "Getting the microphone ready", listening: "Listening — just speak",
  hearing: "I hear you", thinking: "Thinking about what you said", speaking: "Answering aloud",
  sleeping: "Asleep — tap to wake", paused: "Paused while this tab is away", error: "Voice chat needs attention",
};

export function HandsFreeVoiceChat() {
  const chat = useVoiceChat();
  const canStart = chat.phase === "sleeping" || chat.phase === "paused" || chat.phase === "error" || !chat.isListening;
  const getScope = () => {
    const last = chat.turns.at(-1);
    return createVoiceChatScope({
      phase: chat.phase,
      microphone_listening: chat.isListening,
      turn_count: chat.turns.length,
      transcript_turns: chat.turns.map(({ user, assistant }) => ({ user, assistant })),
      content: chat.turns.map((turn) => `User: ${turn.user}\nAssistant: ${turn.assistant}`).join("\n\n"),
      last_user_utterance: last?.user,
      last_assistant_utterance: last?.assistant,
    });
  };
  return (
    <SurfaceRuntimeProvider surfaceName={VOICE_CHAT_SURFACE} getScope={getScope}>
    <section className="mx-auto flex max-w-3xl flex-col gap-6" aria-live="polite">
      <div className="rounded-2xl border bg-card p-6 shadow-sm">
        <div className="flex flex-col gap-5 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-center gap-4">
            <div className={`grid h-14 w-14 place-items-center rounded-full ${chat.phase === "hearing" ? "bg-emerald-500 text-white" : chat.phase === "speaking" ? "bg-violet-500 text-white" : "bg-muted"}`}>
              {chat.phase === "speaking" ? <Volume2 /> : chat.phase === "sleeping" || chat.phase === "paused" ? <MicOff /> : <Mic />}
            </div>
            <div><p className="text-lg font-semibold">{PHASE_COPY[chat.phase]}</p><p className="text-sm text-muted-foreground">It sleeps after one quiet minute. Speaking over a reply stops it immediately.</p></div>
          </div>
          {canStart ? <Button size="lg" onClick={() => void chat.start()}><Mic className="mr-2 h-4 w-4" /> Start listening</Button> : <Button size="lg" variant="outline" onClick={() => void chat.sleep()}><Moon className="mr-2 h-4 w-4" /> Sleep now</Button>}
        </div>
        {chat.error ? <p className="mt-4 rounded-lg bg-destructive/10 p-3 text-sm text-destructive">{chat.error}</p> : null}
        <p className="mt-4 text-xs text-muted-foreground">On iPhone and iPad, the first tap also unlocks microphone and audio playback. Returning from another tab requires another tap.</p>
      </div>
      <div className="space-y-4" aria-label="Voice conversation">
        {chat.turns.length === 0 ? <div className="rounded-xl border border-dashed p-8 text-center text-sm text-muted-foreground">Your conversation will appear here as you speak.</div> : chat.turns.map((turn) => <article key={turn.id} className="space-y-2 rounded-xl border bg-card p-4"><p><span className="font-medium">You:</span> {turn.user}</p><p><span className="font-medium">Assistant:</span> {turn.assistant}</p></article>)}
      </div>
    </section>
    </SurfaceRuntimeProvider>
  );
}
