// app/(core)/transcription/admin/page.tsx
//
// Per-feature admin map for the transcription ecosystem. Renders via
// the platform primitive `<FeatureAdminPage>` (super-admin gated,
// utilitarian). The config below is the single source of truth for
// what the transcription feature owns + every transcription-aware
// resource scattered across the rest of the repo (window panels in
// `components/official-candidate/`, voice pad variants, scribe screens,
// the studio's 4-column workspace, demos under `(dev)/demos/general/
// voice/`, etc.). When you add a new transcript-related route /
// window panel / overlay / module, update this file. The drift
// warnings on the rendered admin page will surface anything missed.

import FeatureAdminPage from "@/features/admin/components/FeatureAdminPage";
import type { FeatureAdminMap } from "@/features/admin/types/featureAdminMap";

const TRANSCRIPTION_ADMIN_MAP: FeatureAdminMap = {
  name: "Transcription",
  slug: "transcription",
  description:
    "Everything that turns audio into text and back: simple-CRUD transcripts, the live 4-column Studio workspace, mobile Scribe capture, transcription cleanup, voice pads, and the audio pipeline behind them. Sister features (TTS, Voice Agent, Podcasts) live under the audio umbrella — see Related Features.",
  docs: [
    { label: "Transcripts FEATURE.md", href: "/features/transcripts/FEATURE.md" },
    { label: "Transcript Studio FEATURE.md", href: "/features/transcript-studio/FEATURE.md" },
    { label: "Audio FEATURE.md", href: "/features/audio/FEATURE.md" },
  ],
  routeScanPath: "app/(core)/transcription",

  routes: [
    {
      url: "/transcription",
      label: "Hub",
      description:
        "Top-level landing for the transcription ecosystem — links into Processor, Studio, Scribe.",
      filePath: "app/(core)/transcription/page.tsx",
      status: "Live",
    },
    {
      url: "/transcription/processor",
      label: "Processor",
      description:
        "Canonical transcript CRUD: upload audio, transcribe via Groq Whisper, view, edit, organize into folders.",
      filePath: "app/(core)/transcription/processor/page.tsx",
      status: "Live",
    },
    {
      url: "/transcription/studio",
      label: "Studio (live 4-column workspace)",
      description:
        "Live workspace: Column 1 raw stream → Column 2 cleaned → Column 3 concepts → Column 4 modules (tasks / flashcards / decisions).",
      filePath: "app/(core)/transcription/studio/page.tsx",
      status: "Live",
    },
    {
      url: "/transcription/scribe",
      label: "Scribe (mobile capture)",
      description:
        "Mobile-first audio-capture landing — sessions list with quick record / resume.",
      filePath: "app/(core)/transcription/scribe/page.tsx",
      status: "Live",
    },
    {
      url: "/transcription/scribe/unsorted",
      label: "Scribe — Unsorted archive",
      description: "Catch-all session bucket for captures the user hasn't filed yet.",
      filePath: "app/(core)/transcription/scribe/unsorted/page.tsx",
      status: "Live",
    },
    {
      url: "/transcription/scribe/<sessionId>",
      label: "Scribe — Session workspace",
      description:
        "Individual Scribe session: big record button, live transcript strip, AI assistant panel.",
      filePath: "app/(core)/transcription/scribe/[sessionId]/page.tsx",
      status: "Live",
    },
  ],

  windowPanels: [
    {
      overlayId: "transcriptStudioWindow",
      description:
        "Floating-window version of the 4-column Studio workspace. Same body as `/transcription/studio` but draggable / resizable / persistable.",
    },
    {
      overlayId: "voicePad",
      description:
        "Compact recorder + live transcript window. Drop-in voice capture from anywhere.",
    },
    {
      overlayId: "voicePadAdvanced",
      description:
        "Expanded voice-pad variant — same Redux slice as `voicePad`, wider layout with more controls.",
    },
    {
      overlayId: "transcriptionCleanup",
      description:
        "AI cleanup window: runs the post-process agent on a raw transcript and shows the cleaned diff.",
    },
    {
      overlayId: "aiVoiceWindow",
      description:
        "Floating AI voice workspace — primarily TTS-focused, but consumes transcripts as context. (Lives under the Audio umbrella.)",
    },
  ],

  components: [
    {
      name: "TranscriptsLayout",
      filePath: "features/transcripts/components/TranscriptsLayout.tsx",
      description: "Portal-header layout that hosts Processor + sidebar + viewer.",
      status: "Live",
    },
    {
      name: "TranscriptViewer",
      filePath: "features/transcripts/components/TranscriptViewer.tsx",
      description: "Read / edit a saved transcript. Used by Processor.",
      status: "Live",
    },
    {
      name: "CreateTranscriptModal",
      filePath: "features/transcripts/components/CreateTranscriptModal.tsx",
      description: "Upload audio + run Whisper. Saves to the simple transcripts table.",
      status: "Live",
    },
    {
      name: "ImportTranscriptModal",
      filePath: "features/transcripts/components/ImportTranscriptModal.tsx",
      description: "Import AI-generated transcripts (pasted or fetched).",
      status: "Live",
    },
    {
      name: "TranscriptsSidebar",
      filePath: "features/transcripts/components/TranscriptsSidebar.tsx",
      description: "Folder + transcript browser for the Processor.",
      status: "Live",
    },
    {
      name: "StudioView",
      filePath: "features/transcript-studio/components/StudioView.tsx",
      description:
        "Core config-driven 4-column workspace. Drives `/transcription/studio` and the Studio window.",
      status: "Live",
    },
    {
      name: "StudioSidebar",
      filePath: "features/transcript-studio/components/StudioSidebar.tsx",
      description: "Studio session list.",
      status: "Live",
    },
    {
      name: "Studio columns",
      filePath: "features/transcript-studio/components/columns/",
      description:
        "RawTranscriptColumn / CleanedTranscriptColumn / ConceptsColumn / ModuleColumn — the four parallel streams.",
      status: "Live",
    },
    {
      name: "ScribeScreen",
      filePath: "features/transcript-studio/components/scribe/ScribeScreen.tsx",
      description: "Mobile Scribe controller — switches between capture + assistant modes.",
      status: "Live",
    },
    {
      name: "ScribeCaptureScreen",
      filePath:
        "features/transcript-studio/components/scribe/ScribeCaptureScreen.tsx",
      description: "Mobile capture UI: big record button, live transcript strip.",
      status: "Live",
    },
    {
      name: "TranscriptionCleanup",
      filePath:
        "components/official-candidate/transcription-cleanup/components/TranscriptionCleanup.tsx",
      description:
        "Official-candidate AI cleanup module. Powers the cleanup window panel AND the Scribe cleanup sheet.",
      status: "Live",
    },
    {
      name: "VoicePad family",
      filePath: "components/official-candidate/voice-pad/components/",
      description:
        "VoicePad / VoicePadAdvanced / VoicePadExpanded — three UI variants on the same `voicePadSlice` state. Consolidation candidate.",
      status: "Live",
    },
    {
      name: "MicrophoneRecordingModal",
      filePath: "features/audio/components/MicrophoneRecordingModal.tsx",
      description: "Modal overlay for one-shot recording with live transcription progress.",
      status: "Live",
    },
    {
      name: "AdvancedTranscriptViewer",
      filePath:
        "components/mardown-display/blocks/transcripts/AdvancedTranscriptViewer.tsx",
      description:
        "In-markdown viewer for AI-generated transcripts. Renders inside agent responses.",
      status: "Live",
    },
  ],

  apiRoutes: [
    {
      url: "/api/audio/transcribe",
      method: "POST",
      description: "Upload an audio file → Groq Whisper STT.",
      filePath: "app/api/audio/transcribe/route.ts",
    },
    {
      url: "/api/audio/transcribe-url",
      method: "POST",
      description: "Transcribe an audio URL (no upload).",
      filePath: "app/api/audio/transcribe-url/route.ts",
    },
    {
      url: "/api/audio/log-error",
      method: "POST",
      description: "Client-side audio error logging endpoint.",
      filePath: "app/api/audio/log-error/route.ts",
    },
    {
      url: "/api/voice-agent/token",
      method: "POST",
      description:
        "Mint short-lived xAI Realtime API token for the live voice agent (transcribes as it talks).",
      filePath: "app/api/voice-agent/token/route.ts",
    },
  ],

  reduxSlices: [
    {
      name: "voicePadSlice",
      filePath: "lib/redux/slices/voicePadSlice.ts",
      description:
        "State for the voice-pad family (recording status, partial / final transcript, UI mode). Shared across VoicePad / VoicePadAdvanced / VoicePadExpanded.",
    },
    {
      name: "transcript-studio slice",
      filePath: "features/transcript-studio/redux/slice.ts",
      description:
        "Studio sessions and the four-column segment streams (raw / cleaned / concepts / module output).",
    },
  ],

  demoRoutes: [
    {
      url: "/demos/general/voice/voice-assistant",
      label: "Voice Assistant demo",
      description: "Basic voice assistant playground.",
      filePath: "app/(dev)/demos/general/voice/voice-assistant/page.dev.tsx",
    },
    {
      url: "/demos/general/voice/voice-assistant-two",
      label: "Voice Assistant (alt)",
      description: "Second voice-assistant variant.",
      filePath: "app/(dev)/demos/general/voice/voice-assistant-two/page.dev.tsx",
    },
    {
      url: "/demos/general/voice/voice-assistant-cdn",
      label: "Voice Assistant — CDN build",
      description: "CDN-based voice-assistant variant.",
      filePath: "app/(dev)/demos/general/voice/voice-assistant-cdn/page.dev.tsx",
    },
    {
      url: "/demos/general/voice/voice-manager",
      label: "Voice manager test",
      description: "Internal voice-manager test surface.",
      filePath: "app/(dev)/demos/general/voice/voice-manager/page.dev.tsx",
    },
    {
      url: "/demos/general/voice/debate-assistant",
      label: "Debate / discussion agent",
      description: "Multi-speaker debate demo.",
      filePath: "app/(dev)/demos/general/voice/debate-assistant/page.dev.tsx",
    },
    {
      url: "/demos/general/voice/wake-word-debug",
      label: "Wake-word debug",
      description: "Wake-word detection tuning surface.",
      filePath: "app/(dev)/demos/general/voice/wake-word-debug/page.dev.tsx",
    },
    {
      url: "/demos/general/voice/server-token",
      label: "Server-token test",
      description: "xAI Realtime token issuance test.",
      filePath: "app/(dev)/demos/general/voice/server-token/page.dev.tsx",
    },
    {
      url: "/demos/general/voice/tts-with-controls",
      label: "TTS with controls",
      description: "TTS playground (Audio umbrella, but lives in voice demos).",
      filePath: "app/(dev)/demos/general/voice/tts-with-controls/page.dev.tsx",
    },
    {
      url: "/demos/tests/audio-recorder-test",
      label: "Audio recorder test suite",
      description: "Multiple recording test routes under audio-recorder-test/*.",
      filePath: "app/(dev)/demos/tests/audio-recorder-test/",
    },
    {
      url: "/demos/public/feature-tests/microphone-icon-button",
      label: "Microphone icon button",
      description: "Public UI test for the mic button.",
      filePath:
        "app/(public-demos)/demos/public/feature-tests/microphone-icon-button/page.tsx",
    },
    {
      url: "/demos/public/feature-tests/speaker-button",
      label: "Speaker button",
      description: "Public UI test for the speaker button.",
      filePath:
        "app/(public-demos)/demos/public/feature-tests/speaker-button/page.tsx",
    },
    {
      url: "/demos/ssr/speaker-demo",
      label: "SSR speaker demo",
      description: "SSR-shell speaker demo.",
      filePath: "app/(ssr)/demos/ssr/speaker-demo/page.tsx",
    },
  ],

  relatedFeatures: [
    {
      name: "Audio",
      adminUrl: "/voice/admin",
      description:
        "Recording, playback, voice providers. The transcription routes consume Audio hooks (useRecordAndTranscribe, useChunkedRecordAndTranscribe).",
    },
    {
      name: "TTS",
      description:
        "Text-to-speech (Cartesia, Eleven Labs). Lives under the Audio umbrella; powers the aiVoiceWindow.",
    },
    {
      name: "Voice Agent",
      description:
        "xAI Realtime agent. Produces transcripts as a byproduct (see voiceTranscriptWriter).",
    },
    {
      name: "Podcasts",
      description: "Generation + management under the Audio umbrella. Shares the TTS pipeline.",
    },
    {
      name: "Knowledge",
      adminUrl: "/knowledge/admin",
      description:
        "Cleaned transcripts can be pushed into data stores for RAG. Bridge in features/transcript-studio/service/transcriptBridge.ts.",
    },
  ],
};

export default function TranscriptionAdminPage() {
  return <FeatureAdminPage map={TRANSCRIPTION_ADMIN_MAP} />;
}
