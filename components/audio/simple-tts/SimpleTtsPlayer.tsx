"use client";
import VoiceConfigSelects from "@/components/audio/VoiceConfigSelects";
import { Button } from "@/components/ui/button";
import useSimpleCartesia from "@/hooks/tts/simple/useSimpleCartesia";

export default function SimpleTtsPlayer() {

    const {
        connectionState,
        playerState,
        speak,
        handleScriptChange,
        handleVoiceChange,
        handleEmotionsChange,
        handleLanguageChange,
        handleSpeedChange,
        handleModelChange,
        script,
    } = useSimpleCartesia();


    return (
        <div className="flex flex-col items-center justify-center h-full gap-4 max-w-screen-sm mx-auto">
            <div className="w-full h-8 flex justify-left items-center gap-2">
                <div className="px-1 text-gray-700 dark:text-gray-300">
                    {connectionState === "connecting" && "Connecting audio stream..."}
                    {connectionState === "ready" && "Ready!"}
                    {connectionState === "disconnected" && "Disconnected - Cartesia disconnects websockets after 5 min of inactivity"}
                </div>
            </div>
            <div className="w-full">
                <textarea
                    className="w-full bg-zinc-100 dark:bg-zinc-800 border-1 border-gray-400 dark:border-gray-600 rounded-md p-2"
                    value={script}
                    onChange={(e) => handleScriptChange(e.target.value)}
                />
                <div className="w-full flex flex-col gap-2 mt-2">
                    <Button disabled={connectionState !== "ready" || playerState === "playing"} onClick={speak}>
                        Speak
                    </Button>
                    <VoiceConfigSelects
                        isPlaying={playerState === "playing"}
                        onVoiceChange={(voiceId) => handleVoiceChange(voiceId)}
                        onEmotionsChange={(emotions) => handleEmotionsChange(emotions)} 
                        onSpeedChange={(speed) => handleSpeedChange(speed)}
                        onLanguageChange={(language) => handleLanguageChange(language)}
                        onModelChange={(modelId) => handleModelChange(modelId)}
                    />
                </div>
            </div>
        </div>
    );
}