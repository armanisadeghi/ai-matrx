# Audio Transcription System

Real-time streaming transcription via Groq Whisper. All recordings are chunked into 10-second segments, transcribed as they arrive, and persisted to IndexedDB for crash safety.

## Components (use directly, no setup)

| Component | Import | When to use |
|---|---|---|
| `VoiceTextarea` | `@/components/official/VoiceTextarea` | Textarea with built-in mic icon, live text appears while speaking |
| `VoiceInputButton` | `@/components/official/VoiceInputButton` | Standalone button or inline icon, returns final text string |
| `MicrophoneIconButton` | `@/features/audio/components` | Three variants: `icon-only`, `inline-expand`, `modal-controls` |

## Hooks (for custom UI)

| Hook | Import | Notes |
|---|---|---|
| `useRecordAndTranscribe` | `@/features/audio/hooks` | Wrapper with `streaming` option (default `true`). Returns `liveTranscript`, `failedChunkCount`, all controls |
| `useChunkedRecordAndTranscribe` | `@/features/audio/hooks` | Low-level chunked hook with `onChunkTranscribed`, `onChunkError` callbacks |

## Architecture

```
Browser: MediaRecorder → 10s chunks (~160KB) → /api/audio/transcribe → Groq Whisper
         ↓                                      ↓ (on failure)
     IndexedDB safety store              Supabase upload → /api/audio/transcribe-url (up to 100MB)
         ↓ (on crash)
     AudioRecoveryProvider → Toast → Modal (play/download/re-transcribe)
```

## Limits (Groq Developer + Vercel Pro)

- **Chunk size:** ~160 KB per 10s (well under Vercel 4.5 MB body limit)
- **Direct upload:** 25 MB max (4.5 MB through Vercel)
- **URL upload:** 100 MB max (fallback path via Supabase Storage)
- **Rate:** 20 RPM, 7,200 audio seconds/hour
- **API timeout:** 120s (chunks), 300s (URL-based)

## Auth

API routes accept both cookie-based Supabase sessions and `Authorization: Bearer <token>` headers.
