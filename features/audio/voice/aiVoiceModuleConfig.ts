// modules/aiVoice/aiVoiceModuleConfig.ts

import {AiAudioConfig, AiAudioData, AiAudioSchema, AiAudioUserPreferences} from "@/types/aiAudioTypes";
import {
    ASSISTANT_VOICE_ID,
    READING_VOICE_ID,
    TTS_MODEL_ID,
} from "@/lib/cartesia/config";

export const aiAudioConfig: AiAudioConfig = {
    model_id: TTS_MODEL_ID,
    voice: {
        mode: "id",
        id: ASSISTANT_VOICE_ID,
        __experimental_controls: {
            speed: "normal",
            emotion: [
                "positivity:high",
                "curiosity"
            ]
        },
    },
    transcript: "text",
    defaultVoices: [
        {
            id: READING_VOICE_ID,
            name: "Ms. Matrx",
            description: "This aiAudio is friendly and conversational, designed for customer support agents and casual conversations"
        },
        {
            id: ASSISTANT_VOICE_ID,
            name: "Mr. Matrx",
            description: "This aiAudio is polite and conversational, with a slight accent, designed for customer support and casual conversations"
        }
    ],
};

export const aiAudioUserPreferences: AiAudioUserPreferences = {
    audio: {
        voiceId: ASSISTANT_VOICE_ID,
        language: 'en',
        speed: "normal",
        emotion: 'happy',
        microphone: true,
        speaker: true,
        wakeWord: 'Hey Matrix',
    },
    customVocab: {}
};

export const aiAudioInitialData: AiAudioData = {
    availableVoices: aiAudioConfig.defaultVoices,
    customVoices: [],
    voiceClones: [],
    transcripts: [],
    meetingNotes: [],
    savedAudio: [],
    userAudioFiles: [],
};

export const aiAudioInitialState: AiAudioSchema = {
    moduleName: "aiAudio",
    initiated: false,
    configs: aiAudioConfig,
    userPreferences: aiAudioUserPreferences,
    data: aiAudioInitialData,
    loading: false,
    error: null,
    staleTime: 600000,
};
