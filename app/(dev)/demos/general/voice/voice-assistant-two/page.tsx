"use client";
import React from "react";
import MessagesDisplay from "@/components/voice/voice-assistant-ui/MessagesDisplay";
import SpeechHaloEffect from "@/components/voice/voice-assistant-ui/SpeechHaloEffect";
import { Header } from "@/components/voice/voice-assistant-ui/header";
import { Sidebar } from "@/components/voice/voice-assistant-ui/Sidebar";
import { Footer } from "@/components/voice/voice-assistant-ui/Footer";
import { useVoiceChat } from "@/hooks/tts/useVoiceChat";
import { NestedResizableWithHeaderFooter } from "@/components/matrx/resizable/NestedResizableWithHeaderFooter";
import CollapsibleSidebar from "@/components/voice/voice-assistant-ui/extras/CollapsibleSidebar";
import { useMicrophonePermission } from "@/hooks/useMicrophonePermission";
import { MicrophonePermissionModal } from "@/components/audio/MicrophonePermissionModal";

export default function Page() {
  const voiceChatHook = useVoiceChat();
  const {
    input,
    setInput,
    processState,
    vad,
    handleSubmit,
    getCurrentConversation,
  } = voiceChatHook;

  const currentConversation = getCurrentConversation();
  const messages = currentConversation?.messages || [];

  const {
    showConsentModal,
    isDenied,
    handleConsentAccepted,
    handleConsentDismissed,
  } = useMicrophonePermission();

  const layout = {
    type: "nested" as const,
    direction: "horizontal" as const,
    sections: [
      {
        type: "content" as const,
        content: <CollapsibleSidebar voiceChatHook={voiceChatHook} />,
        defaultSize: 10,
        minSize: 0,
        maxSize: 20,
        collapsible: true,
      },
      {
        type: "nested" as const,
        direction: "vertical" as const,
        sections: [
          {
            type: "content" as const,
            content: <Header voiceChatHook={voiceChatHook} />,
            defaultSize: 10,
          },
          {
            type: "content" as const,
            content: (
              <div className="relative h-full">
                <div className="absolute inset-0 overflow-y-auto px-4">
                  <MessagesDisplay messages={messages} />
                </div>
                {processState.recording && vad.listening && (
                  <SpeechHaloEffect />
                )}
              </div>
            ),
            defaultSize: 90,
          },
          {
            type: "content" as const,
            content: (
              <Footer
                input={input}
                onInputChange={setInput}
                onSubmit={handleSubmit}
                isListening={vad.listening}
                onToggleMic={() => (vad.listening ? vad.pause() : vad.start())}
              />
            ),
            defaultSize: 4,
          },
        ],
      },
    ],
  };

  return (
    <>
      <MicrophonePermissionModal
        isOpen={showConsentModal}
        onAccept={handleConsentAccepted}
        onDismiss={handleConsentDismissed}
        isDenied={isDenied}
      />
      <NestedResizableWithHeaderFooter layout={layout} />
    </>
  );
}
