/**
 * Text-to-Speech Feature Types
 * 
 * Type definitions for TTS functionality
 */

// Import and re-export from userPreferencesSlice for consistency
import type { GroqTtsVoice } from '@/lib/redux/preferences/userPreferencesSlice';

export type EnglishVoice = GroqTtsVoice;

// Available English voices for playai-tts
export const ENGLISH_VOICES = [
  'Arista-PlayAI',
  'Atlas-PlayAI',
  'Basil-PlayAI',
  'Briggs-PlayAI',
  'Calum-PlayAI',
  'Celeste-PlayAI',
  'Cheyenne-PlayAI', // Default
  'Chip-PlayAI',
  'Cillian-PlayAI',
  'Deedee-PlayAI',
  'Fritz-PlayAI',
  'Gail-PlayAI',
  'Indigo-PlayAI',
  'Mamaw-PlayAI',
  'Mason-PlayAI',
  'Mikail-PlayAI',
  'Mitch-PlayAI',
  'Quinn-PlayAI',
  'Thunder-PlayAI'
] as const;

export interface TTSOptions {
  voice?: EnglishVoice;
  model?: 'playai-tts' | 'playai-tts-arabic';
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
  'Arista-PlayAI': { id: 'Arista-PlayAI', name: 'Arista', gender: 'female', description: 'Warm and professional' },
  'Atlas-PlayAI': { id: 'Atlas-PlayAI', name: 'Atlas', gender: 'male', description: 'Deep and authoritative' },
  'Basil-PlayAI': { id: 'Basil-PlayAI', name: 'Basil', gender: 'male', description: 'Clear and articulate' },
  'Briggs-PlayAI': { id: 'Briggs-PlayAI', name: 'Briggs', gender: 'male', description: 'Strong and confident' },
  'Calum-PlayAI': { id: 'Calum-PlayAI', name: 'Calum', gender: 'male', description: 'Friendly and approachable' },
  'Celeste-PlayAI': { id: 'Celeste-PlayAI', name: 'Celeste', gender: 'female', description: 'Elegant and sophisticated' },
  'Cheyenne-PlayAI': { id: 'Cheyenne-PlayAI', name: 'Cheyenne', gender: 'female', description: 'Natural and engaging (default)' },
  'Chip-PlayAI': { id: 'Chip-PlayAI', name: 'Chip', gender: 'male', description: 'Energetic and upbeat' },
  'Cillian-PlayAI': { id: 'Cillian-PlayAI', name: 'Cillian', gender: 'male', description: 'Smooth and calm' },
  'Deedee-PlayAI': { id: 'Deedee-PlayAI', name: 'Deedee', gender: 'female', description: 'Cheerful and bright' },
  'Fritz-PlayAI': { id: 'Fritz-PlayAI', name: 'Fritz', gender: 'male', description: 'Technical and precise' },
  'Gail-PlayAI': { id: 'Gail-PlayAI', name: 'Gail', gender: 'female', description: 'Mature and trustworthy' },
  'Indigo-PlayAI': { id: 'Indigo-PlayAI', name: 'Indigo', gender: 'female', description: 'Modern and versatile' },
  'Mamaw-PlayAI': { id: 'Mamaw-PlayAI', name: 'Mamaw', gender: 'female', description: 'Warm and nurturing' },
  'Mason-PlayAI': { id: 'Mason-PlayAI', name: 'Mason', gender: 'male', description: 'Professional and reliable' },
  'Mikail-PlayAI': { id: 'Mikail-PlayAI', name: 'Mikail', gender: 'male', description: 'Rich and expressive' },
  'Mitch-PlayAI': { id: 'Mitch-PlayAI', name: 'Mitch', gender: 'male', description: 'Casual and relatable' },
  'Quinn-PlayAI': { id: 'Quinn-PlayAI', name: 'Quinn', gender: 'female', description: 'Dynamic and confident' },
  'Thunder-PlayAI': { id: 'Thunder-PlayAI', name: 'Thunder', gender: 'male', description: 'Powerful and commanding' }
};

