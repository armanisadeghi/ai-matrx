"use client";
import VoiceConfigSelects from "@/components/audio/VoiceConfigSelects";
import { Button } from "@/components/ui/button";
import useCartesiaControls from "@/hooks/tts/simple/useCartesiaControls";
import { Play, Pause, RotateCcw, StopCircle } from "lucide-react";

export default function TtsPlayerWithControls() {
    const {
        connectionState,
        playerState,
        speak,
        pause,
        resume,
        stop,
        handleScriptChange,
        handleVoiceChange,
        handleEmotionsChange,
        handleLanguageChange,
        handleSpeedChange,
        handleModelChange,
        script,
    } = useCartesiaControls();

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
                <div className="w-full flex gap-2 mt-2">
                    {/* Play/Resume button */}
                    <Button
                        icon={<Play size={16} />}
                        variant="primary" 
                        disabled={connectionState !== "ready" || playerState === "playing"} 
                        onClick={() => playerState === "paused" ? resume() : speak()}
                        className="flex"
                    >
                        {playerState === "paused" ? "Resume" : "Speak"}
                    </Button>
                    
                    {/* Pause button */}
                    <Button
                        icon={<Pause size={16} />} 
                        disabled={playerState !== "playing"} 
                        onClick={pause}
                        variant="outline"
                        className="flex"
                    >
                        Pause
                    </Button>
                    
                    {/* Stop button */}
                    <Button
                        icon={<StopCircle size={16} />} 
                        disabled={playerState === "idle"} 
                        onClick={stop}
                        variant="outline"
                        className="flex"
                    >
                        Stop
                    </Button>
                    
                    {/* Reset/Reload button to handle disconnections */}
                    {connectionState === "disconnected" && (
                        <Button
                            icon={<RotateCcw size={16} />} 
                            onClick={() => window.location.reload()}
                            variant="danger"
                            className="flex"
                        >
                            Reconnect
                        </Button>
                    )}
                </div>
                
                <div className="w-full mt-4">
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