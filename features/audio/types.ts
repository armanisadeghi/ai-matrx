/**
 * Audio Feature Types
 * 
 * Type definitions for audio recording and transcription
 */

export interface TranscriptionResult {
  success: boolean;
  text: string;
  language?: string;
  duration?: number;
  segments?: TranscriptionSegment[];
  error?: string;
  details?: string;
}

export interface TranscriptionSegment {
  id: number;
  seek: number;
  start: number;
  end: number;
  text: string;
  tokens: number[];
  temperature: number;
  avg_logprob: number;
  compression_ratio: number;
  no_speech_prob: number;
}

export interface TranscriptionOptions {
  language?: string; // ISO-639-1 language code (e.g., 'en', 'es')
  prompt?: string; // Provide context or guide spelling
  /**
   * Opt a surface into Custom Dictionary keyterm biasing. When set (and `prompt`
   * is not explicitly provided), the recording hooks resolve the user's active
   * dictionary for this surface and pass it as the Whisper `prompt`. An explicit
   * `prompt` always wins. See features/dictionary/sttBridge.ts.
   */
  dictionarySurfaceKey?: string;
}

export interface AudioRecordingState {
  isRecording: boolean;
  isPaused: boolean;
  duration: number;
  audioBlob: Blob | null;
  error: string | null;
}

export interface UseAudioTranscriptionProps {
  onTranscriptionComplete?: (result: TranscriptionResult) => void;
  onTranscriptionError?: (error: string) => void;
  autoSubmit?: boolean; // Automatically start transcription when recording stops
  options?: TranscriptionOptions;
}

