"use client";

import React, { useState, useEffect, useMemo } from "react";
import { motion } from "motion/react";
import { useCartesia } from "@/hooks/tts/useCartesia";
import { availableVoices } from "@/lib/cartesia/voices";
import { Button } from "@/components/ui/button";
import { Input } from "@ai-matrx/design-system";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Slider } from "@/components/ui/slider";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { Loader2, RefreshCw, Play, Pause, Square } from "lucide-react";
import { Emotion, EmotionName, EmotionLevel, VoiceSpeed, Language, ModelId, VoiceOptions } from "@/lib/cartesia/cartesia.types";

const emotions: Emotion[] = ["anger", "sadness", "positivity", "curiosity", "surprise"];

const languageNames: Record<Language, string> = {
    [Language.EN]: "English",
    [Language.DE]: "German",
    [Language.ES]: "Spanish",
    [Language.FR]: "French",
    [Language.JA]: "Japanese",
    [Language.PT]: "Portuguese",
    [Language.ZH]: "Chinese",
    [Language.HI]: "Hindi",
    [Language.IT]: "Italian",
    [Language.KO]: "Korean",
    [Language.NL]: "Dutch",
    [Language.PL]: "Polish",
    [Language.RU]: "Russian",
    [Language.SV]: "Swedish",
    [Language.TR]: "Turkish",
};

interface EmotionControl {
    active: boolean;
    intensity: EmotionLevel;
}

export default function PlaygroundPage() {
    const { sendMessage, isConnected, error, pausePlayback, resumePlayback, stopPlayback, updateConfigs } = useCartesia();
    const [text, setText] = useState(
        "Hi. This is A.I. Matrix, and I'm really happy to have you here. Take a look around the Playground and try the cool emotions controls!"
    );

    const orderedVoices = useMemo(() => {
        return availableVoices.sort((a, b) => a.name.localeCompare(b.name));
    }, [availableVoices]);

    const [voice, setVoice] = useState(orderedVoices[8]?.id || "");
    const [hasPlayed, setHasPlayed] = useState(false);
    const [language, setLanguage] = useState<Language>(Language.EN);
    const [speed, setSpeed] = useState<VoiceSpeed>(VoiceSpeed.NORMAL);
    const [emotionControls, setEmotionControls] = useState<Record<Emotion, EmotionControl>>(
        emotions.reduce(
            (acc, emotion) => ({ ...acc, [emotion]: { active: false, intensity: EmotionLevel.MEDIUM } }),
            {} as Record<Emotion, EmotionControl>
        )
    );
    const [isPlaying, setIsPlaying] = useState(false);

    useEffect(() => {
        setHasPlayed(false);
        setIsPlaying(false);
    }, [text, voice, language, speed, emotionControls]);

    useEffect(() => {
        const voiceOptions: VoiceOptions = { mode: "id", id: voice };

        updateConfigs({ voice: voiceOptions, language });
    }, [voice, language, updateConfigs]);

    const handleSendMessage = async () => {
        setHasPlayed(true);
        const activeEmotions = Object.entries(emotionControls)
            .filter(([, control]) => control.active)
            .map(([emotion, control]) => ({
                emotion: emotion as EmotionName,
                intensity: control.intensity,
            }));

        const voiceOptions: VoiceOptions = { mode: "id", id: voice };

        try {
            setIsPlaying(true);
            await sendMessage(text, speed, voiceOptions, activeEmotions);
            setIsPlaying(false);
        } catch (err) {
            console.error("Error sending message:", err);
        }
    };

    const handleEmotionChange = (emotion: Emotion, field: "active" | "intensity", value: boolean | EmotionLevel) => {
        setEmotionControls((prev) => ({
            ...prev,
            [emotion]: { ...prev[emotion], [field]: value },
        }));
    };

    const handlePlayPause = () => {
        if (isPlaying) {
            pausePlayback();
        } else {
            if (!hasPlayed) {
                handleSendMessage();
            }
            resumePlayback();
        }
        setIsPlaying(!isPlaying);
    };

    const handleStop = () => {
        stopPlayback();
        setIsPlaying(false);
        setHasPlayed(false);
    };

    return (
        <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ duration: 0.5 }}
            className="container mx-auto p-6 space-y-6"
        >
            <div className="space-y-4">
                <div>
                    <Label htmlFor="text" className="sr-only">
                        Text to Speak
                    </Label>
                    <Input id="text" value={text} onChange={(e) => setText(e.target.value)} placeholder="Enter text to speak..." />
                </div>
                <div className="flex space-x-4 items-end">
                    <div className="flex-1">
                        <Label htmlFor="voice">Voice</Label>
                        <div className="flex">
                            <Select value={voice} onValueChange={(value: string) => setVoice(value)}>
                                <SelectTrigger id="voice">
                                    <SelectValue placeholder="Select voice" />
                                </SelectTrigger>
                                <SelectContent>
                                    {availableVoices.map((v) => (
                                        <SelectItem key={v.id} value={v.id}>
                                            {v.name}
                                        </SelectItem>
                                    ))}
                                </SelectContent>
                            </Select>
                            <Button variant="outline" size="icon" className="ml-2">
                                <RefreshCw className="h-4 w-4" />
                            </Button>
                        </div>
                    </div>
                </div>
                <div className="flex space-x-4">
                    <div className="flex-1">
                        <Label htmlFor="language">Language</Label>
                        <Select value={language} onValueChange={(value: Language) => setLanguage(value)}>
                            <SelectTrigger id="language">
                                <SelectValue placeholder="Select language" />
                            </SelectTrigger>
                            <SelectContent>
                                {Object.entries(languageNames).map(([key, value]) => (
                                    <SelectItem key={key} value={key as Language}>
                                        {value}
                                    </SelectItem>
                                ))}
                            </SelectContent>
                        </Select>
                    </div>
                    <div className="flex-1">
                        <Label htmlFor="speed">Speed</Label>
                        <Select value={speed} onValueChange={(value: VoiceSpeed) => setSpeed(value)}>
                            <SelectTrigger id="speed">
                                <SelectValue placeholder="Select speed" />
                            </SelectTrigger>
                            <SelectContent>
                                {Object.entries(VoiceSpeed).map(([key, value]) => (
                                    <SelectItem key={key} value={value}>
                                        {key}
                                    </SelectItem>
                                ))}
                            </SelectContent>
                        </Select>
                    </div>
                </div>
                <div className="space-y-2">
                    <Label>Emotions</Label>
                    {emotions.map((emotion) => (
                        <div key={emotion} className="flex items-center space-x-4">
                            <Checkbox
                                id={`${emotion}-checkbox`}
                                checked={emotionControls[emotion].active}
                                onCheckedChange={(checked) => handleEmotionChange(emotion, "active", checked as boolean)}
                            />
                            <Label htmlFor={`${emotion}-checkbox`} className="w-24">
                                {emotion}
                            </Label>
                            <Slider
                                value={[Object.values(EmotionLevel).indexOf(emotionControls[emotion].intensity)]}
                                onValueChange={([value]) =>
                                    handleEmotionChange(emotion, "intensity", Object.values(EmotionLevel)[value] as EmotionLevel)
                                }
                                min={0}
                                max={4}
                                step={1}
                                disabled={!emotionControls[emotion].active}
                                className={`w-64 ${!emotionControls[emotion].active ? "opacity-30" : ""}`}
                            />
                        </div>
                    ))}
                </div>
                <div className="flex justify-between items-center">
                    <div className="space-x-2">
                        <Button
                            onClick={() => {
                                if (!hasPlayed) {
                                    // First time playing - start the process
                                    handleSendMessage();
                                } else {
                                    // Already played before - toggle play/pause
                                    handlePlayPause();
                                }
                            }}
                            disabled={!isConnected}
                        >
                            {!hasPlayed ? (
                                <Play className="h-4 w-4" />
                            ) : isPlaying ? (
                                <Pause className="h-4 w-4" />
                            ) : (
                                <Play className="h-4 w-4" />
                            )}
                        </Button>
                        <Button onClick={handleStop} disabled={!isConnected}>
                            <Square className="h-4 w-4" />
                        </Button>
                    </div>
                </div>
                {error && <p className="text-red-500">{error.message}</p>}
            </div>

            <motion.div
                className="w-full h-16 bg-gray-200 rounded-lg overflow-hidden"
                initial={{ scaleY: 0 }}
                animate={{ scaleY: 1 }}
                transition={{ duration: 0.5 }}
            >
                {/* Audio visualization placeholder */}
                <div className="w-full h-full bg-gradient-to-r from-blue-400 to-purple-500 animate-pulse" />
            </motion.div>
        </motion.div>
    );
}
