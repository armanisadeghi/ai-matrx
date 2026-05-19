/*
import React, { useState, useEffect } from 'react';
import { useDispatch, useSelector } from 'react-redux';
import CartesiaTTSService from '@/lib/cartesia/tts-service';
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Slider } from "@/components/ui/slider";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { setModulePreferences } from '@/lib/redux/preferences/userPreferencesSlice';
import type { RootState } from "@/lib/redux/store";
import {Language} from "@/lib/cartesia/cartesia.types";

// Redux action to update user preferences
const updateUserPreferences = (preferences) => ({
    type: 'UPDATE_USER_PREFERENCES',
    payload: preferences,
});

// Sub-components
const VoiceSelector = ({ voices, selectedVoice, onVoiceChange }) => (
    <Select value={selectedVoice} onValueChange={onVoiceChange}>
        <SelectTrigger>
            <SelectValue placeholder="Select voice" />
        </SelectTrigger>
        <SelectContent>
            {voices.map((voice) => (
                <SelectItem key={voice.id} value={voice.id}>
                    {voice.name}
                </SelectItem>
            ))}
        </SelectContent>
    </Select>
);

const LanguageSelector = ({ languages, selectedLanguage, onLanguageChange }) => (
    <Select value={selectedLanguage} onValueChange={onLanguageChange}>
        <SelectTrigger>
            <SelectValue placeholder="Select language" />
        </SelectTrigger>
        <SelectContent>
            {languages.map((lang) => (
                <SelectItem key={lang.code} value={lang.code}>
                    {lang.name}
                </SelectItem>
            ))}
        </SelectContent>
    </Select>
);

const SpeedControl = ({ speed, onSpeedChange }) => (
    <Slider
        min={0.5}
        max={2}
        step={0.1}
        value={[speed]}
        onValueChange={([value]) => onSpeedChange(value)}
    />
);

const EmotionSelector = ({ emotions, selectedEmotion, onEmotionChange }) => (
    <Select value={selectedEmotion} onValueChange={onEmotionChange}>
        <SelectTrigger>
            <SelectValue placeholder="Select emotion" />
        </SelectTrigger>
        <SelectContent>
            {emotions.map((emotion) => (
                <SelectItem key={emotion} value={emotion}>
                    {emotion}
                </SelectItem>
            ))}
        </SelectContent>
    </Select>
);

const AudioPlayground = () => {
    const dispatch = useDispatch();
    const voicePreferences = useSelector((state: RootState) => state.userPreferences.voice);

    const [text, setText] = useState('');
    const [isPlaying, setIsPlaying] = useState(false);
    const [voices] = useState([
        { id: 'voice1', name: 'Voice 1' },
        { id: 'voice2', name: 'Voice 2' },
        // Add more voices as needed
    ]);

    const [emotions] = useState(['Happy', 'Sad', 'Excited', 'Calm']);

    const [settings, setSettings] = useState({
        voice: voicePreferences.voice || voices[0].id,
        language: (voicePreferences.language: Language) || 'en',
        speed: voicePreferences.speed || 1,
        emotion: voicePreferences.emotion || emotions[0],
        microphone: voicePreferences.microphone || false,
        speaker: voicePreferences.speaker || false,
        wakeWord: voicePreferences.wakeWord || "Hey Matrix",
    });

    const tts = CartesiaTTSService({
        apiKey: process.env.NEXT_PUBLIC_CARTESIA_API_KEY,
        voiceId: settings.voice,
    });

    useEffect(() => {
        // Update TTS service when settings change
        tts.setVoice(settings.voice);
        tts.setLanguage(settings.language);
        tts.setSpeed(settings.speed);
        tts.setEmotion([settings.emotion]);

        // Update user preferences in Redux store
        dispatch(setModulePreferences({
            module: 'voice',
            preferences: settings
        }));
    }, [settings, tts, dispatch]);

    const handlePlay = async () => {
        setIsPlaying(true);
        await tts.runTTS(text);
        setIsPlaying(false);
    };

    const handleStop = () => {
        tts.flushAudio();
        setIsPlaying(false);
    };

    const updateSetting = (key: string, value: any) => {
        setSettings(prev => ({ ...prev, [key]: value }));
    };

    return (
        <Card className="w-full max-w-3xl mx-auto">
            <CardHeader>
                <CardTitle>Audio Playground</CardTitle>
            </CardHeader>
            <CardContent>
                <div className="space-y-4">
                    <Input
                        placeholder="Enter text to speak"
                        value={text}
                        onChange={(e) => setText(e.target.value)}
                    />
                    <div className="grid grid-cols-2 gap-4">
                        <div>
                            <label>Voice</label>
                            <VoiceSelector
                                voices={voices}
                                selectedVoice={settings.voice}
                                onVoiceChange={(voice) => updateSetting('voice', voice)}
                            />
                        </div>
                        <div>
                            <label>Language</label>
                            <LanguageSelector
                                languages={languages}
                                selectedLanguage={settings.language}
                                onLanguageChange={(language) => updateSetting('language', language)}
                            />
                        </div>
                        <div>
                            <label>Speed</label>
                            <SpeedControl
                                speed={settings.speed}
                                onSpeedChange={(speed) => updateSetting('speed', speed)}
                            />
                        </div>
                        <div>
                            <label>Emotion</label>
                            <EmotionSelector
                                emotions={emotions}
                                selectedEmotion={settings.emotion}
                                onEmotionChange={(emotion) => updateSetting('emotion', emotion)}
                            />
                        </div>
                    </div>
                    <div className="flex justify-center space-x-4">
                        <Button onClick={handlePlay} disabled={isPlaying}>
                            {isPlaying ? 'Playing...' : 'Play'}
                        </Button>
                        <Button onClick={handleStop} disabled={!isPlaying}>
                            Stop
                        </Button>
                    </div>
                </div>
            </CardContent>
        </Card>
    );
};

export default AudioPlayground;*/
