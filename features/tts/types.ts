/**
 * Text-to-Speech Feature Types
 * 
 * Type definitions for TTS functionality
 */

// Import and re-export from userPreferencesSlice for consistency
import type { GroqTtsVoice } from '@/lib/redux/preferences/userPreferencesSlice';

export type EnglishVoice = GroqTtsVoice;

// Voices attached to the catalog's default Groq Orpheus offering.
export const ENGLISH_VOICES = [
  'autumn', 'diana', 'hannah', 'austin', 'daniel', 'troy'
] as const;

export interface TTSOptions {
  voice?: EnglishVoice;
  processMarkdown?: boolean;
}

export type SpeakerVariant = 'glass' | 'transparent' | 'solid' | 'group';

// Voice metadata for UI display
export interface VoiceInfo {
  id: EnglishVoice;
  name: string; // Display name
  gender: 'male' | 'female';
  description: string;
  accent?: string;
}

// Voice information for selection UI
export const VOICE_METADATA: Record<EnglishVoice, VoiceInfo> = {
  autumn: { id: 'autumn', name: 'Autumn', gender: 'female', description: 'Warm and natural' },
  diana: { id: 'diana', name: 'Diana', gender: 'female', description: 'Clear and expressive' },
  hannah: { id: 'hannah', name: 'Hannah', gender: 'female', description: 'Friendly and conversational' },
  austin: { id: 'austin', name: 'Austin', gender: 'male', description: 'Confident and natural' },
  daniel: { id: 'daniel', name: 'Daniel', gender: 'male', description: 'Calm and articulate' },
  troy: { id: 'troy', name: 'Troy', gender: 'male', description: 'Catalog default' },
};
