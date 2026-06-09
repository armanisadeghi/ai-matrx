// app/(core)/transcripts/admin/page.tsx
//
// Per-feature admin map for the Transcripts ecosystem. Renders via
// the platform primitive `<FeatureAdminPage>` (super-admin gated,
// utilitarian). The config below is the single source of truth for
// what the Transcripts feature owns + every transcript-aware resource
// scattered across the rest of the repo (window panels in
// `components/official-candidate/`, voice pad variants, scribe screens,
// the studio's 4-column workspace, demos under `(dev)/demos/general/
// voice/`, etc.). When you add a new transcript-related route /
// window panel / overlay / module, update this file. The drift
// warnings on the rendered admin page will surface anything missed.

import FeatureAdminPage from "@/features/admin/components/FeatureAdminPage";
import type { FeatureAdminMap } from "@/features/admin/types/featureAdminMap";

const TRANSCRIPTS_ADMIN_MAP: FeatureAdminMap = {
  name: "Transcripts",
  slug: "transcripts",
  description:
    "Everything that turns audio into text and back: the canonical transcripts workspace (record / upload / browse / edit), the live 4-column Studio workspace, mobile Scribe capture, transcription cleanup, voice pads, and the audio pipeline behind them. Sister features (TTS, Voice Agent) live under the audio umbrella — see Related Features. Podcasts deliberately excluded — different concept.",
  docs: [
    { label: "Transcripts FEATURE.md", href: "/features/transcripts/FEATURE.md" },
    { label: "Transcript Studio FEATURE.md", href: "/features/transcript-studio/FEATURE.md" },
    { label: "Audio FEATURE.md", href: "/features/audio/FEATURE.md" },
  ],
  routeScanPath: "app/(core)/transcripts",

  routes: [
    {
      url: "/transcripts",
      label: "List (savior entry)",
      description:
        "Authed users see the list of all their transcripts with per-row UI pickers. Guests see the marketing landing. Replaces the forced-into-processor trap.",
      filePath: "app/(core)/transcripts/page.tsx",
      status: "Live",
      notes: [
        "Mirrors the /agents/all shape",
        "Search + sort + paginate client-side",
        "Per-row actions: Processor / Studio / Cleanup",
      ],
    },
    {
      url: "/transcripts/processor",
      label: "Processor (the original workspace)",
      description:
        "Single-transcript record / upload / browse / edit / organize UI. Reached from the list row 'Open' action. Replaces the old `/transcription/processor` URL.",
      filePath: "app/(core)/transcripts/processor/page.tsx",
      status: "Live",
    },
    {
      url: "/transcripts/new",
      label: "New transcript (picker)",
      description:
        "Server-rendered picker: upload / record / studio / cleanup / import. Mirrors `/agents/new`.",
      filePath: "app/(core)/transcripts/new/page.tsx",
      status: "Live",
    },
    {
      url: "/transcripts/studio",
      label: "Studio (live 4-column workspace)",
      description:
        "Live workspace: Column 1 raw stream → Column 2 cleaned → Column 3 concepts → Column 4 modules (tasks / flashcards / decisions). Replaces `/transcription/studio`.",
      filePath: "app/(core)/transcripts/studio/page.tsx",
      status: "Live",
    },
    {
      url: "/transcripts/scribe",
      label: "Scribe (mobile capture)",
      description:
        "Mobile-first audio-capture landing — sessions list with quick record / resume. Replaces `/transcription/scribe`.",
      filePath: "app/(core)/transcripts/scribe/page.tsx",
      status: "Live",
    },
    {
      url: "/transcripts/scribe/unsorted",
      label: "Scribe — Unsorted archive",
      description: "Catch-all session bucket for captures the user hasn't filed yet.",
      filePath: "app/(core)/transcripts/scribe/unsorted/page.tsx",
      status: "Live",
    },
    {
      url: "/transcripts/scribe/<sessionId>",
      label: "Scribe — Session workspace",
      description:
        "Individual Scribe session: big record button, live transcript strip, AI assistant panel.",
      filePath: "app/(core)/transcripts/scribe/[sessionId]/page.tsx",
      status: "Live",
    },
    {
      url: "/transcripts/cleanup",
      label: "Cleanup (standalone page)",
      description:
        "Standalone full-page version of the Transcription Cleanup tool. Powered by `features/transcription-cleanup/` (its own feature folder).",
      filePath: "app/(core)/transcripts/cleanup/page.tsx",
      status: "Live",
      notes: [
        "Deliberate, isolated rewrite of the cleanup window panel",
        "Responsive page shell, inline sidebar desktop / drawer mobile",
        "Reuses voice-pad / agent-exec Redux primitives",
      ],
    },
    {
      url: "/transcripts/admin",
      label: "Admin map (this page)",
      description: "The page you're reading — admin index of every transcripts resource.",
      filePath: "app/(core)/transcripts/admin/page.tsx",
      status: "Live",
    },
  ],

  windowPanels: [
    {
      overlayId: "transcriptStudioWindow",
      description:
        "Floating-window version of the 4-column Studio workspace. Same body as `/transcripts/studio` but draggable / resizable / persistable.",
    },
    {
      overlayId: "voicePad",
      description:
        "Compact recorder + live transcript window. Drop-in voice capture from anywhere.",
    },
    {
      overlayId: "voicePadAdvanced",
      description:
        "Expanded voice-pad variant — same Redux slice as `voicePad`, wider layout with more controls. Consolidation candidate.",
    },
    {
      overlayId: "transcriptionCleanup",
      description:
        "AI cleanup window: runs the post-process agent on a raw transcript and shows the cleaned diff.",
    },
    {
      overlayId: "aiVoiceWindow",
      description:
        "Floating AI voice workspace — primarily TTS-focused but consumes transcripts as context. Borderline ownership (lives under the Audio umbrella).",
    },
  ],

  components: [
    {
      name: "TranscriptsLayout",
      filePath: "features/transcripts/components/TranscriptsLayout.tsx",
      description: "Portal-header layout that hosts the processor + sidebar + viewer.",
      status: "Live",
      tier: "internal",
    },
    {
      name: "TranscriptViewer",
      filePath: "features/transcripts/components/TranscriptViewer.tsx",
      description: "Read / edit a saved transcript. Used by the processor workspace.",
      status: "Live",
      tier: "internal",
    },
    {
      name: "CreateTranscriptModal",
      filePath: "features/transcripts/components/CreateTranscriptModal.tsx",
      description: "Upload audio + run Whisper. Saves to the simple transcripts table.",
      status: "Live",
      tier: "internal",
    },
    {
      name: "ImportTranscriptModal",
      filePath: "features/transcripts/components/ImportTranscriptModal.tsx",
      description: "Import AI-generated transcripts (pasted or fetched).",
      status: "Live",
      tier: "internal",
    },
    {
      name: "TranscriptsSidebar",
      filePath: "features/transcripts/components/TranscriptsSidebar.tsx",
      description: "Folder + transcript browser for the processor workspace.",
      status: "Live",
      tier: "internal",
    },
    {
      name: "StudioView",
      filePath: "features/transcript-studio/components/StudioView.tsx",
      description:
        "Core config-driven 4-column workspace. Drives `/transcripts/studio` and the Studio window panel.",
      status: "Live",
      tier: "internal",
    },
    {
      name: "StudioSidebar",
      filePath: "features/transcript-studio/components/StudioSidebar.tsx",
      description: "Studio session list.",
      status: "Live",
      tier: "internal",
    },
    {
      name: "Studio columns",
      filePath: "features/transcript-studio/components/columns/",
      description:
        "RawTranscriptColumn / CleanedTranscriptColumn / ConceptsColumn / ModuleColumn — the four parallel streams.",
      status: "Live",
      tier: "internal",
    },
    {
      name: "ScribeScreen",
      filePath: "features/transcript-studio/components/scribe/ScribeScreen.tsx",
      description: "Mobile Scribe controller — switches between capture + assistant modes.",
      status: "Live",
      tier: "internal",
    },
    {
      name: "ScribeCaptureScreen",
      filePath:
        "features/transcript-studio/components/scribe/ScribeCaptureScreen.tsx",
      description: "Mobile capture UI: big record button, live transcript strip.",
      status: "Live",
      tier: "internal",
    },
    {
      name: "CleanupPad",
      filePath: "features/transcription-cleanup/components/CleanupPad.tsx",
      description:
        "Standalone-page version of the cleanup tool. Used by `/transcripts/cleanup`.",
      status: "Live",
      tier: "internal",
    },
    {
      name: "TranscriptionCleanup (legacy)",
      filePath:
        "components/official-candidate/transcription-cleanup/components/TranscriptionCleanup.tsx",
      description:
        "Original cleanup component still backing the window panel + the Scribe cleanup sheet. The `/transcripts/cleanup` page intentionally diverges via CleanupPad.",
      status: "Live",
      tier: "candidate",
    },
    {
      name: "VoicePad family",
      filePath: "components/official-candidate/voice-pad/components/",
      description:
        "VoicePad / VoicePadAdvanced / VoicePadExpanded — three UI variants on the same `voicePadSlice` state.",
      status: "Live",
      tier: "candidate",
      notes: ["Consolidation candidate", "All three share one slice"],
    },
    {
      name: "MicrophoneRecordingModal",
      filePath: "features/audio/components/MicrophoneRecordingModal.tsx",
      description: "Modal overlay for one-shot recording with live transcription progress.",
      status: "Live",
      tier: "internal",
    },
    {
      name: "AdvancedTranscriptViewer",
      filePath:
        "components/mardown-display/blocks/transcripts/AdvancedTranscriptViewer.tsx",
      description:
        "In-markdown viewer for AI-generated transcripts. Renders inside agent responses.",
      status: "Live",
      tier: "internal",
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
        "Recording, playback, voice providers. The transcripts workspace consumes Audio hooks (useRecordAndTranscribe, useChunkedRecordAndTranscribe).",
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
      name: "Knowledge",
      adminUrl: "/knowledge/admin",
      description:
        "Cleaned transcripts can be pushed into data stores for RAG. Bridge in features/transcript-studio/service/transcriptBridge.ts.",
    },
  ],
};

export default function TranscriptsAdminPage() {
  return <FeatureAdminPage map={TRANSCRIPTS_ADMIN_MAP} />;
}
