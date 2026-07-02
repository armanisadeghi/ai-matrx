// lib/redux/moduleSchema.ts

import {AiAudioConfig, AiAudioData, AiAudioSchema, AiAudioUserPreferences} from "@/types/aiAudioTypes";
import {AiChatSchema} from "@/types/aiChatTypes";
import {ImageEditorSchema} from "@/types/imageEditorTypes";
import {
    aiAudioConfig,
} from "@/features/audio/voice/aiVoiceModuleConfig";
// Import from the cycle-free leaf module; re-export for backward compatibility.
import type { ModuleName, BaseModuleSchema } from "./baseModuleSchema";
export type { ModuleName, BaseModuleSchema };

export interface SystemComponentsSchema {
    moduleName: 'systemComponents';
    initiated: boolean;
    configs: Record<string, unknown>;
    userPreferences: Record<string, unknown>;
    data: Record<string, unknown>;
    loading: boolean;
    error: string | null;
    staleTime: number;
}

export type ModuleSchema = AiAudioSchema | AiChatSchema | ImageEditorSchema | SystemComponentsSchema;


export const moduleSystemDefaults = {
    initiated: false,
    loading: false,
    error: null,
    staleTime: 600000,
};


const aiAudioUserPreferences: AiAudioUserPreferences = {
    audio: {
        voiceId: '--156fb8d2-335b-4950-9cb3-a2d33befec77',
        language: 'en',
        speed: "normal",
        emotion: 'happy',
        microphone: true,
        speaker: true,
        wakeWord: 'Hey Matrix',
    },
    customVocab: {}
};

const aiAudioInitialData: AiAudioData = {
    availableVoices: [
        {
            id: "--156fb8d2-335b-4950-9cb3-a2d33befec77",
            name: "Ms. Matrx",
            description: "This aiAudio is friendly and conversational, designed for customer support agents and casual conversations"
        },
        {
            id: "--ee7ea9f8-c0c1-498c-9279-764d6b56d189",
            name: "Mr. Matrx",
            description: "This aiAudio is polite and conversational, with a slight accent, designed for customer support and casual conversations"
        }
    ],
    customVoices: [],
    voiceClones: [],
    transcripts: [],
    meetingNotes: [],
    savedAudio: [],
    userAudioFiles: [],
};


export const moduleSchemas: Record<ModuleName, ModuleSchema> = {
    aiAudio: {
        moduleName: "aiAudio",
        initiated: moduleSystemDefaults.initiated,
        configs: aiAudioConfig,
        userPreferences: aiAudioUserPreferences,
        data: aiAudioInitialData,
        loading: moduleSystemDefaults.loading,
        error: moduleSystemDefaults.error,
        staleTime: moduleSystemDefaults.staleTime,
    },
    aiChat: {
        moduleName: "aiChat",
        initiated: moduleSystemDefaults.initiated,
        configs: {},
        userPreferences: {},
        data: {},
        loading: moduleSystemDefaults.loading,
        error: moduleSystemDefaults.error,
        staleTime: moduleSystemDefaults.staleTime,
    },
    imageEditor: {
        moduleName: "imageEditor",
        initiated: moduleSystemDefaults.initiated,
        configs: {},
        userPreferences: {},
        data: {},
        loading: moduleSystemDefaults.loading,
        error: moduleSystemDefaults.error,
        staleTime: moduleSystemDefaults.staleTime,
    },
    systemComponents: {
        moduleName: "systemComponents",
        initiated: moduleSystemDefaults.initiated,
        configs: {},
        userPreferences: {},
        data: {},
        loading: moduleSystemDefaults.loading,
        error: moduleSystemDefaults.error,
        staleTime: moduleSystemDefaults.staleTime,
    },
};
