import { useState } from "react";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Slider } from "@/components/ui/slider";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import {
    AUDIO_ENCODINGS,
    AUDIO_ENCODING_OPTIONS,
    LANGUAGES,
    LANGUAGE_OPTIONS,
    MODEL_IDS,
    MODEL_ID_OPTIONS
} from "@/lib/cartesia/data";
import type { AudioEncoding, Language, ModelId } from "@/lib/cartesia/cartesia.types";
import { allVoices } from "@/lib/cartesia/voices";
// Using the Emotion type directly from Cartesia library
export type Emotion = "anger:lowest" | "anger:low" | "anger" | "anger:high" | "anger:highest" |
    "positivity:lowest" | "positivity:low" | "positivity" | "positivity:high" | "positivity:highest" |
    "surprise:lowest" | "surprise:low" | "surprise" | "surprise:high" | "surprise:highest" |
    "sadness:lowest" | "sadness:low" | "sadness" | "sadness:high" | "sadness:highest" |
    "curiosity:lowest" | "curiosity:low" | "curiosity" | "curiosity:high" | "curiosity:highest";
// Basic emotion types without intensity
type BaseEmotion = "anger" | "positivity" | "surprise" | "sadness" | "curiosity";
// Emotion definitions for UI
const EMOTION_DISPLAY_NAMES: Record<BaseEmotion, string> = {
    anger: "Anger",
    positivity: "Positivity",
    surprise: "Surprise",
    sadness: "Sadness",
    curiosity: "Curiosity"
};
// Intensity definitions for UI
const INTENSITY_DISPLAY_NAMES: Record<string, string> = {
    "lowest": "Lowest",
    "low": "Low",
    "medium": "Medium", // Changed from empty string to "medium"
    "high": "High",
    "highest": "Highest"
};
// All base emotions for iteration
const BASE_EMOTIONS: BaseEmotion[] = ["anger", "positivity", "surprise", "sadness", "curiosity"];
interface VoiceConfigSelectsProps {
    isPlaying?: boolean;
    onVoiceChange?: (voiceId: string) => void;
    onEmotionsChange?: (emotions: Emotion[]) => void;
    onSpeedChange?: (speed: number) => void; // Number between -1.0 and 1.0
    onEncodingChange?: (encoding: AudioEncoding) => void;
    onLanguageChange?: (language: Language) => void;
    onModelChange?: (modelId: ModelId) => void; // New prop for model change
}
// Default values for internal state
const DEFAULT_VOICE = "156fb8d2-335b-4950-9cb3-a2d33befec77";
const DEFAULT_EMOTIONS: Emotion[] = []; // Start with no emotions selected
const DEFAULT_SPEED = 0; // Normal speed (0)
const DEFAULT_ENCODING = AUDIO_ENCODINGS.PCM_F32LE.value;
const DEFAULT_LANGUAGE = LANGUAGES.EN.value;
const DEFAULT_MODEL = MODEL_IDS.SONIC_ENGLISH.value; // Default model ID

export function VoiceConfigSelects({
    isPlaying = false,
    onVoiceChange,
    onEmotionsChange,
    onSpeedChange,
    onEncodingChange,
    onLanguageChange,
    onModelChange, // Add the new callback prop
}: VoiceConfigSelectsProps) {
    // Internal state
    const [selectedVoice, setSelectedVoice] = useState<string>(DEFAULT_VOICE);
    const [selectedEmotions, setSelectedEmotions] = useState<Emotion[]>(DEFAULT_EMOTIONS);
    const [selectedSpeed, setSelectedSpeed] = useState<number>(DEFAULT_SPEED);
    const [selectedEncoding, setSelectedEncoding] = useState<AudioEncoding>(DEFAULT_ENCODING);
    const [selectedLanguage, setSelectedLanguage] = useState<Language>(DEFAULT_LANGUAGE);
    const [selectedModel, setSelectedModel] = useState<ModelId>(DEFAULT_MODEL); // New state for model

    // Handlers that update state and call parent handlers
    const handleVoiceChange = (value: string) => {
        setSelectedVoice(value);
        onVoiceChange?.(value);
    };

    // New handler for model change
    const handleModelChange = (value: string) => {
        const modelId = value as ModelId;
        setSelectedModel(modelId);
        onModelChange?.(modelId);
    };

    // Helper to extract base emotion and intensity from a combined emotion string
    const parseEmotion = (emotion: Emotion): { base: BaseEmotion, intensity: string } => {
        const parts = emotion.split(":");
        return {
            base: parts[0] as BaseEmotion,
            intensity: parts.length > 1 ? parts[1] : "medium" // Changed from "" to "medium"
        };
    };
    // Helper to create an emotion string from base and intensity
    const createEmotionString = (base: BaseEmotion, intensity: string): Emotion => {
        if (intensity === "medium") return base as Emotion; // No suffix for medium intensity
        return `${base}:${intensity}` as Emotion;
    };
    // Check if a base emotion is selected
    const isEmotionSelected = (baseEmotion: BaseEmotion): boolean => {
        return selectedEmotions.some(emotion => parseEmotion(emotion).base === baseEmotion);
    };
    // Get the intensity for a base emotion
    const getEmotionIntensity = (baseEmotion: BaseEmotion): string => {
        const emotion = selectedEmotions.find(emotion => parseEmotion(emotion).base === baseEmotion);
        return emotion ? parseEmotion(emotion).intensity : "medium";
    };
    // Handle toggling an emotion on/off
    const handleEmotionToggle = (baseEmotion: BaseEmotion, checked: boolean) => {
        let newSelectedEmotions;

        if (checked) {
            // Add emotion with default intensity (medium)
            const newEmotion = createEmotionString(baseEmotion, "medium");
            newSelectedEmotions = [...selectedEmotions, newEmotion];
        } else {
            // Remove any emotions with this base
            newSelectedEmotions = selectedEmotions.filter(
                emotion => parseEmotion(emotion).base !== baseEmotion
            );
        }

        setSelectedEmotions(newSelectedEmotions);
        onEmotionsChange?.(newSelectedEmotions);
    };
    // Handle changing intensity of an emotion
    const handleIntensityChange = (baseEmotion: BaseEmotion, intensity: string) => {
        // Remove any existing emotions with this base
        const filteredEmotions = selectedEmotions.filter(
            emotion => parseEmotion(emotion).base !== baseEmotion
        );

        // Add new emotion with selected intensity
        const newEmotion = createEmotionString(baseEmotion, intensity);
        const newSelectedEmotions = [...filteredEmotions, newEmotion];

        setSelectedEmotions(newSelectedEmotions);
        onEmotionsChange?.(newSelectedEmotions);
    };
    const handleSpeedChange = (value: number[]) => {
        const speed = value[0]; // Slider returns an array, we only need the first value
        setSelectedSpeed(speed);
        onSpeedChange?.(speed);
    };
    const handleEncodingChange = (value: string) => {
        const encoding = value as AudioEncoding;
        setSelectedEncoding(encoding);
        onEncodingChange?.(encoding);
    };
    const handleLanguageChange = (value: string) => {
        const language = value as Language;
        setSelectedLanguage(language);
        onLanguageChange?.(language);
    };
    // Format the speed value for display
    const formatSpeedLabel = (speed: number) => {
        if (speed === 0) return "Normal";
        if (speed < 0) return `Slower (${speed.toFixed(1)})`;
        return `Faster (+${speed.toFixed(1)})`;
    };
    return (
        <div className="space-y-6 w-full">
            {/* canonical-model-picker-exempt: Cartesia wire-model enum, not an ai.model_definition id */}
            {/* Model Selection - New section */}
            <div className="space-y-2">
                <Label>Model</Label>
                <Select value={selectedModel} onValueChange={handleModelChange} disabled={isPlaying}>
                    <SelectTrigger>
                        <SelectValue placeholder="Select model" />
                    </SelectTrigger>
                    <SelectContent>
                        {MODEL_ID_OPTIONS.map((model) => (
                            <SelectItem key={model.value} value={model.value}>
                                {model.displayName}
                            </SelectItem>
                        ))}
                    </SelectContent>
                </Select>
            </div>

            {/* Voice */}
            <div className="space-y-2">
                <Label>Voice</Label>
                <Select value={selectedVoice} onValueChange={handleVoiceChange} disabled={isPlaying}>
                    <SelectTrigger>
                        <SelectValue placeholder="Select voice" />
                    </SelectTrigger>
                    <SelectContent>
                        {allVoices.map((voice) => (
                            <SelectItem key={voice.id} value={voice.id}>
                                {voice.name}
                            </SelectItem>
                        ))}
                    </SelectContent>
                </Select>
            </div>
            {/* Speed Slider */}
            <div className="space-y-2">
                <div className="flex justify-between">
                    <Label>Speed: {formatSpeedLabel(selectedSpeed)}</Label>
                </div>
                <Slider
                    value={[selectedSpeed]}
                    min={-1.0}
                    max={1.0}
                    step={0.1}
                    onValueChange={handleSpeedChange}
                    disabled={isPlaying}
                    className="py-4"
                />
                <div className="flex justify-between text-xs text-gray-500">
                    <span>Slowest (-1.0)</span>
                    <span>Normal (0)</span>
                    <span>Fastest (+1.0)</span>
                </div>
            </div>
            {/* Emotions with Intensity */}
            <div className="space-y-4">
                <Label>Emotions</Label>
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                    {BASE_EMOTIONS.map((baseEmotion) => (
                        <div key={baseEmotion} className="space-y-2 border p-3 rounded">
                            <div className="flex items-center space-x-2">
                                <Checkbox
                                    id={`emotion-${baseEmotion}`}
                                    checked={isEmotionSelected(baseEmotion)}
                                    onCheckedChange={(checked) =>
                                        handleEmotionToggle(baseEmotion, checked as boolean)
                                    }
                                    disabled={isPlaying}
                                />
                                <Label htmlFor={`emotion-${baseEmotion}`}>
                                    {EMOTION_DISPLAY_NAMES[baseEmotion]}
                                </Label>
                            </div>

                            {isEmotionSelected(baseEmotion) && (
                                <Select
                                    value={getEmotionIntensity(baseEmotion)}
                                    onValueChange={(intensity) => handleIntensityChange(baseEmotion, intensity)}
                                    disabled={isPlaying}
                                >
                                    <SelectTrigger className="h-8">
                                        <SelectValue placeholder="Select intensity" />
                                    </SelectTrigger>
                                    <SelectContent>
                                        {Object.entries(INTENSITY_DISPLAY_NAMES).map(([value, name]) => (
                                            <SelectItem key={`${baseEmotion}-${value}`} value={value}>
                                                Intensity: {name}
                                            </SelectItem>
                                        ))}
                                    </SelectContent>
                                </Select>
                            )}
                        </div>
                    ))}
                </div>
            </div>
            {/* Encoding, Language and Model in a grid layout */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                {/* Encoding */}
                <div className="space-y-2">
                    <Label>Encoding</Label>
                    <Select value={selectedEncoding} onValueChange={handleEncodingChange} disabled={isPlaying}>
                        <SelectTrigger>
                            <SelectValue placeholder="Select encoding" />
                        </SelectTrigger>
                        <SelectContent>
                            {AUDIO_ENCODING_OPTIONS.map((encoding) => (
                                <SelectItem key={encoding.value} value={encoding.value}>
                                    {encoding.displayName}
                                </SelectItem>
                            ))}
                        </SelectContent>
                    </Select>
                </div>
                {/* Language */}
                <div className="space-y-2">
                    <Label>Language</Label>
                    <Select value={selectedLanguage} onValueChange={handleLanguageChange} disabled={isPlaying}>
                        <SelectTrigger>
                            <SelectValue placeholder="Select language" />
                        </SelectTrigger>
                        <SelectContent>
                            {LANGUAGE_OPTIONS.map((language) => (
                                <SelectItem key={language.value} value={language.value}>
                                    {language.displayName}
                                </SelectItem>
                            ))}
                        </SelectContent>
                    </Select>
                </div>
            </div>
        </div>
    );
}
export default VoiceConfigSelects;
