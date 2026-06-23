# TTS/Audio System — Full Reference

## Consumer Map

Every file that imports from the TTS/audio system, organized by which hook/component they use.

### Tier 1: Speaker* Components (Cartesia, lazy, production)

| File | Component | Text Source |
|------|-----------|-------------|
| `features/cx-conversation/AssistantActionBar.tsx` | `SpeakerButton` | Raw assistant message content |
| `app/(dev)/demos/speaker-demo/page.tsx` | All three variants | Static test strings |
| `app/(public)/demos/feature-tests/speaker-button/page.tsx` | All three variants | Static test strings |
| `components/admin/MarkdownTester.tsx` | `SpeakerGroup` | Dynamic rendered content |

### Tier 2: useCartesiaWithPreferences (connect-on-mount)

| File | Text Source | Error Handling |
|------|-------------|---------------|
| `features/cx-conversation/MessageOptionsMenu.tsx` | Message content | `toast.error` via `onError` |
| `features/chat/components/response/assistant-message/MessageOptionsMenu.tsx` | Message content | `toast.error` via `onError` |
| `components/admin/AudioTestModal.tsx` | Pre-processed markdown | `toast.error`, connection banner |

### Tier 3: useCartesiaControls (connect-on-mount, full controls)

| File | Text Source |
|------|-------------|
| `features/chat/components/response/ResponseColumn.tsx` | Creates shared instance for all messages |
| `features/chat/components/response/MessageItem.tsx` | Pass-through |
| `features/chat/components/response/assistant-message/AssistantMessage.tsx` | Cleaned message content |
| `components/audio/simple-tts/TtsPlayerWithControls.tsx` | User textarea input |

### Tier 4: useSimpleCartesia (connect-on-mount, minimal)

| File | Text Source |
|------|-------------|
| `components/audio/simple-tts/SimpleTtsPlayer.tsx` | User textarea input |

### Tier 5: useCartesia (legacy, direct API key)

| File | Text Source |
|------|-------------|
| `features/audio/voice/VoiceModal.tsx` | Voice sample transcript |
| `features/audio/voice/VoicePlayground.tsx` | User input with full emotion controls |
| `features/audio/voice/components/VoiceSelectionModal.tsx` | Voice description |

### Tier 6: usePlayer (raw PCM stream)

| File | Text Source |
|------|-------------|
| `components/voice/voice-assistant-ui/Assistant.tsx` | Server response stream |
| `hooks/tts/useVoiceChatWithAutoSleep.ts` | AI response stream |

### Tier 7: AudioModal System

| File | Role |
|------|------|
| `providers/AudioModalProvider.tsx` | Global provider |
| `app/Providers.tsx` | Registers provider |
| `providers/packs/MediaPack.tsx` | Alternative provider pack |
| `hooks/tts/useAudioExplanation.ts` | Convenience wrapper |
| `components/audio/AudioModal.tsx` | Modal UI |
| `components/audio/QuickAudioHelp.tsx` | Predefined help messages |
| `components/audio/example-usage.tsx` | Integration examples |

### Tier 8: Browser speechSynthesis (fallback)

| File | Note |
|------|------|
| `features/public-chat/components/PublicMessageOptionsMenu.tsx` | No Cartesia — uses native browser API |

---

## Markdown-to-Speech Pipeline

`utils/markdown-processors/parse-markdown-for-speech.ts` converts markdown to TTS-friendly text:

1. Mermaid diagrams → "Please see the diagram provided."
2. Code blocks → "Please see the [language] code provided."
3. Tables → "There is a table with N rows of data provided for [headers]."
4. Inline code → stripped to plain text
5. Numeric ranges (0-2) → "zero to two"
6. Headers → "Section: [title]"
7. Bold/italic/strikethrough → stripped
8. Links → "[text]. Link provided."
9. Images → "[alt]. Image provided."
10. Emojis → word descriptions (32 mappings)
11. Abbreviations → expanded (44 mappings, e.g., "API" → "Application Programming Interface")
12. Measurement units → expanded (33 mappings)
13. Currency/dates/times → formatted
14. Special symbols (©, ®, ™, arrows) → words
15. Numbers (0-999) → word form

---

## WebSocket Lifecycle (Cartesia)

```
1. User clicks Speaker button
2. Shell sets engaged=true → lazy-loads Core
3. Core mounts → autoStart triggers speak(text)
4. speak() calls ensureConnection()
5. ensureConnection():
   a. Fetch token from GET /api/cartesia
   b. Create CartesiaClient (no API key needed — token auth)
   c. Open WebSocket (raw, pcm_f32le, 44100Hz)
   d. Connect with access token
   e. Register close handler → nullify ref, reset phase
6. speak() sends transcript to WebSocket:
   - modelId: 'sonic-3'
   - voice: { mode: 'id', id: <UUID from Redux>, experimentalControls: { speed, emotion } }
   - language: from Redux
   - transcript: processed text
7. WebPlayer.play(response.source) → streams PCM to speakers
8. On completion → phase resets to 'idle'
```

---

## Error Logging (Transcription)

Server-side errors logged to `audio_transcription_errors` table via `features/audio/services/audioErrorLogger.ts`:

```typescript
interface TranscriptionErrorLog {
  userId: string;
  errorCode: string;      // e.g. "HTTP_429", "SDK_ERROR"
  errorMessage: string;   // Truncated to 2000 chars
  fileSizeBytes: number;
  chunkIndex?: number;
  attemptNumber: number;
  apiRoute: string;       // e.g. "/api/audio/transcribe"
  metadata?: Record<string, unknown>;
}
```

Uses `createAdminClient()` (bypasses RLS). Fails silently to prevent cascading errors.

Client-side errors can be reported via `POST /api/audio/log-error`.

---

## Voice Preference Architecture

Two separate preference systems in Redux (`lib/redux/slices/userPreferencesSlice.ts`):

**Cartesia voice preferences** (`state.userPreferences.voice`):
- `voice`: Cartesia voice UUID (default: `156fb8d2-335b-4950-9cb3-a2d33befec77`)
- `language`: ISO code (default: `"en"`)
- `speed`: Number, 0 = normal
- `emotion`: String
- `microphone`: Boolean
- `speaker`: Boolean
- `wakeWord`: String

**Groq TTS preferences** (`state.userPreferences.textToSpeech`):
- `preferredVoice`: PlayAI voice name (default: `"Cheyenne-PlayAI"`)
- `autoPlay`: Boolean
- `processMarkdown`: Boolean

These are intentionally separate because they serve different providers with different capabilities.

---

## Environment Variables

| Variable | Used By | Side |
|----------|---------|------|
| `CARTESIA_API_KEY` | `/api/cartesia` | Server only |
| `NEXT_PUBLIC_CARTESIA_API_KEY` | `lib/cartesia/client.ts` (legacy) | Client (leaked) |
| `GROQ_API_KEY` | `/api/audio/text-to-speech`, `/api/audio/transcribe*` | Server only |
| `NEXT_PUBLIC_SUPABASE_URL` | Auth resolution, URL validation | Both |
| `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` | Auth resolution | Both |
| `NEXT_PUBLIC_PICOVOICE_ACCESS_KEY` | Wake word detection | Client |
