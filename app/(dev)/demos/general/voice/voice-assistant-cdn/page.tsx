"use client";
import React from "react";
import MessagesDisplay from "@/components/voice/voice-assistant-ui/MessagesDisplay";
import SpeechHaloEffect from "@/components/voice/voice-assistant-ui/SpeechHaloEffect";
import { useVoiceChatCdn } from "@/hooks/tts/useVoiceChatCdn";
import CollapsibleSidebar from "@/components/voice/voice-assistant-ui/extras/CollapsibleSidebar";
import { CollapsibleStatus } from "@/components/voice/voice-assistant-ui/extras/VoiceAssistantStatus";
import VoiceInputBar from "@/components/voice/voice-assistant-ui/extras/VoiceInputBar";

export default function Page() {
    const voiceChatHook = useVoiceChatCdn();
    const {
        processState,
        vad,
        getCurrentConversation,
    } = voiceChatHook;

    const currentConversation = getCurrentConversation();
    const messages = currentConversation?.messages || [];

    return (
        <>
            <div className="fixed top-4 right-4 z-50">
                <CollapsibleStatus voiceChatHook={voiceChatHook} />
            </div>

            <div className="h-full flex relative">
                <CollapsibleSidebar voiceChatHook={voiceChatHook} />

                <div className="flex-1 relative flex flex-col h-full">
                    <div className="absolute inset-0 bottom-[60px] overflow-y-auto px-4">
                        <MessagesDisplay messages={messages} />
                    </div>

                    {(processState.recording && vad.listening) && (
                        <SpeechHaloEffect />
                    )}

                    <VoiceInputBar voiceChatHook={voiceChatHook} />
                </div>
            </div>
        </>
    );
}
