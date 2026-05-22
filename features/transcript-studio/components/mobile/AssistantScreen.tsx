"use client";

import { useState } from "react";
import { Loader2, Send, Volume2, VolumeX } from "lucide-react";
import { cn } from "@/lib/utils";
import { useAppDispatch, useAppSelector } from "@/lib/redux/hooks";
import { AgentConversationDisplay } from "@/features/agents/components/messages-display/AgentConversationDisplay";
import { AgentMicrophoneButton } from "@/features/agents/components/inputs/smart-input/AgentMicrophoneButton";
import { selectUserInputText } from "@/features/agents/redux/execution-system/instance-user-input/instance-user-input.selectors";
import { setUserInputText } from "@/features/agents/redux/execution-system/instance-user-input/instance-user-input.slice";
import { useCartesia } from "@/hooks/tts/useCartesia";
import { useStudioAssistant } from "../../hooks/useStudioAssistant";

interface AssistantScreenProps {
  sessionId: string;
}

export function AssistantScreen({ sessionId }: AssistantScreenProps) {
  const dispatch = useAppDispatch();
  const assistant = useStudioAssistant(sessionId);
  const conversationId = assistant.conversationId;

  const inputText = useAppSelector(
    conversationId ? selectUserInputText(conversationId) : () => "",
  );
  const [sending, setSending] = useState(false);

  const tts = useCartesia();
  const [reading, setReading] = useState(false);

  const workingDoc = assistant.workingDocument;
  const docContent = workingDoc?.content ?? "";

  const handleSend = async () => {
    if (!conversationId || !inputText.trim() || sending) return;
    setSending(true);
    try {
      await assistant.send();
      dispatch(setUserInputText({ conversationId, text: "" }));
    } finally {
      setSending(false);
    }
  };

  // Audio-first: speaking auto-sends on speech end (no extra tap).
  const handleSpoken = (text: string) => {
    if (!conversationId || !text.trim() || sending) return;
    setSending(true);
    void assistant
      .send(text)
      .finally(() => {
        dispatch(setUserInputText({ conversationId, text: "" }));
        setSending(false);
      });
  };

  const handleReadAloud = async () => {
    if (!docContent.trim()) return;
    if (reading) {
      await tts.stopPlayback();
      setReading(false);
      return;
    }
    if (!tts.isAudioInitialized) await tts.initializeAudio();
    setReading(true);
    try {
      await tts.sendMessage(docContent);
    } finally {
      // Playback runs async; reset the toggle when the user stops or it ends.
      setReading(false);
    }
  };

  if (!conversationId) {
    return (
      <div className="flex h-full items-center justify-center">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="flex h-full flex-col overflow-hidden">
      {/* Working document panel */}
      <div className="shrink-0 border-b border-border bg-muted/30">
        <div className="flex items-center justify-between px-4 py-2">
          <span className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
            Working document
          </span>
          <button
            type="button"
            onClick={handleReadAloud}
            disabled={!docContent.trim()}
            className={cn(
              "flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-medium",
              docContent.trim()
                ? "bg-accent text-accent-foreground active:bg-accent/70"
                : "bg-muted text-muted-foreground",
            )}
          >
            {reading ? (
              <VolumeX className="h-3.5 w-3.5" />
            ) : (
              <Volume2 className="h-3.5 w-3.5" />
            )}
            {reading ? "Stop" : "Read aloud"}
          </button>
        </div>
        <div className="max-h-[28dvh] overflow-y-auto px-4 pb-3">
          <p className="whitespace-pre-wrap text-sm leading-relaxed text-foreground">
            {docContent || (
              <span className="italic text-muted-foreground">
                Empty. Ask the assistant to draft, splice, or rework your
                recordings — it builds the document here.
              </span>
            )}
          </p>
        </div>
      </div>

      {/* Conversation */}
      <div className="flex-1 overflow-y-auto">
        <AgentConversationDisplay
          conversationId={conversationId}
          surfaceKey={`studio-assistant:${sessionId}`}
          compact
        />
      </div>

      {/* Audio-first input — mic, field, and send share one container */}
      <div className="shrink-0 border-t border-border bg-card/95 px-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] pt-2 backdrop-blur">
        <div className="flex items-end gap-1.5 rounded-3xl border border-border bg-background py-1.5 pl-1.5 pr-1.5 focus-within:border-primary">
          <AgentMicrophoneButton
            conversationId={conversationId}
            size="md"
            variant="icon-only"
            onTranscribed={handleSpoken}
          />
          <textarea
            value={inputText}
            onChange={(e) =>
              dispatch(
                setUserInputText({ conversationId, text: e.target.value }),
              )
            }
            placeholder="Speak or type…"
            rows={1}
            className="max-h-32 min-h-[36px] flex-1 resize-none border-0 bg-transparent px-1 py-2 text-base text-foreground outline-none placeholder:text-muted-foreground"
          />
          <button
            type="button"
            onClick={handleSend}
            disabled={!inputText.trim() || sending}
            aria-label="Send"
            className={cn(
              "flex h-9 w-9 shrink-0 items-center justify-center rounded-full transition-colors",
              inputText.trim() && !sending
                ? "bg-primary text-primary-foreground active:bg-primary/90"
                : "bg-muted text-muted-foreground",
            )}
          >
            {sending ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Send className="h-4 w-4" />
            )}
          </button>
        </div>
        <p className="mt-1 px-2 text-center text-[11px] text-muted-foreground">
          Tap the mic and speak — it sends automatically.
        </p>
      </div>
    </div>
  );
}
