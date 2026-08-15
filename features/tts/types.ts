/**
 * Text-to-Speech Feature Types
 * 
 * Type definitions for TTS functionality
 */

// The voice list has ONE declaration — CATALOG_VOICES in the AV engine registry
// (features/audio/service/engines.ts). Import it from there; this module keeps
// only the type alias, never a second copy of the values.
import type { CatalogTtsVoice } from '@/lib/redux/preferences/userPreferencesSlice';

export type EnglishVoice = CatalogTtsVoice;

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
