// Function to list all voices
import cartesia from "@/lib/cartesia/client";
import { CARTESIA_API_VERSION } from "@/lib/cartesia/config";
import {
    OutputContainer,
    AudioEncoding,
    ModelId,
    VoiceOptions,
    Language,
    VoiceSpeed,
    Emotion,
    Intensity,
    EmotionName,
    EmotionLevel
} from '@/lib/cartesia/cartesia.types';

/**
 * A voice as returned on the wire by GET /voices/ under API version
 * 2025-04-16+ (paginated envelope, snake_case, no embedding). The installed
 * SDK (@cartesia/cartesia-js 2.x) predates this shape — its voices.list()
 * expects a bare array and throws `ParseError: Expected list. Received
 * object.` — so listVoices calls the endpoint directly and unwraps the
 * envelope. Revisit when the SDK is bumped to 3.x.
 */
export interface CartesiaVoiceSummary {
    id: string;
    name: string;
    description: string;
    is_public?: boolean;
    language?: string;
    created_at?: string;
}

interface CartesiaVoicesPage {
    data: CartesiaVoiceSummary[];
    has_more: boolean;
    next_page?: string | null;
}

const CARTESIA_BASE_URL = "https://api.cartesia.ai";

export const listVoices = async (): Promise<CartesiaVoiceSummary[]> => {
    const apiKey = process.env.NEXT_PUBLIC_CARTESIA_API_KEY;
    if (!apiKey) {
        throw new Error("Cartesia API key is not configured (NEXT_PUBLIC_CARTESIA_API_KEY).");
    }
    const voices: CartesiaVoiceSummary[] = [];
    let startingAfter: string | null = null;
    try {
        do {
            const params = new URLSearchParams({ limit: "100" });
            if (startingAfter) params.set("starting_after", startingAfter);
            const res = await fetch(`${CARTESIA_BASE_URL}/voices/?${params.toString()}`, {
                headers: {
                    "X-API-Key": apiKey,
                    "Cartesia-Version": CARTESIA_API_VERSION,
                },
            });
            if (!res.ok) {
                const body = await res.text().catch(() => "");
                throw new Error(`Cartesia voices request failed (${res.status} ${res.statusText})${body ? `: ${body.slice(0, 300)}` : ""}`);
            }
            const page = (await res.json()) as CartesiaVoicesPage;
            if (!Array.isArray(page.data)) {
                throw new Error("Cartesia voices response missing expected `data` array — API contract changed again.");
            }
            voices.push(...page.data);
            const lastId = page.data.length > 0 ? page.data[page.data.length - 1].id : null;
            startingAfter = page.has_more ? (page.next_page ?? lastId) : null;
        } while (startingAfter);
        return voices;
    } catch (error) {
        console.error("Error listing voices:", error);
        throw error;
    }
};

// Function to get a specific aiAudio by ID
export const getVoice = async (voiceId: string) => {
    try {
        const voice = await cartesia.voices.get(voiceId);
        return voice;
    } catch (error) {
        console.error(`Error getting voice with ID ${voiceId}:`, error);
        throw error;
    }
};

interface CloneVoiceOptions {
    name: string;
    description?: string;
    mode?: "similarity" | "stability";
    language?: Language;
    enhance?: boolean;
    transcript?: string;
}

// Function to clone a aiAudio from a file (takes a File or Blob object as input)
export const cloneVoiceFromFile = async (
    file: File | Blob, 
    options: CloneVoiceOptions
) => {
    try {
        const clonedVoiceEmbedding = await cartesia.voices.clone(
            file as File,
            {
                name: options.name,
                description: options.description,
                mode: options.mode || "similarity",
                language: options.language || Language.EN,
                enhance: options.enhance !== undefined ? options.enhance : false,
                ...(options.transcript && { transcript: options.transcript })
            }
        );
        return clonedVoiceEmbedding;
    } catch (error) {
        console.error("Error cloning aiAudio from file:", error);
        throw error;
    }
};

// Function to mix voices together
export const mixVoices = async (voices: { id: string; weight: number }[]) => {
    try {
        const mixedVoiceEmbedding = await cartesia.voices.mix({ voices });
        return mixedVoiceEmbedding;
    } catch (error) {
        console.error("Error mixing voices:", error);
        throw error;
    }
};


// Function to create a new aiAudio
export const createVoice = async (name: string, description: string, embedding: number[]) => {
    try {
        const newVoice = await cartesia.voices.create({
            name,
            description,
            embedding,
        });
        return newVoice;
    } catch (error) {
        console.error("Error creating aiAudio:", error);
        throw error;
    }
};












