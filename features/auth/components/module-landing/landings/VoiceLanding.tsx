import {
  AudioLines,
  Volume2,
  Mic,
  SlidersHorizontal,
  Globe,
  Zap,
} from "lucide-react";
import {
  ModuleLanding,
  type ModuleCapability,
  type ModuleStep,
  type ModuleSubArea,
} from "@/features/auth/components/module-landing/ModuleLanding";

const CAPABILITIES: ModuleCapability[] = [
  {
    icon: Volume2,
    title: "Production-grade text-to-speech",
    description:
      "Stream natural speech with Cartesia, Groq PlayAI, and more — tuned for chat read-aloud, long documents, and agent responses.",
  },
  {
    icon: SlidersHorizontal,
    title: "Fine-grained voice controls",
    description:
      "Speed, emotion, language, and model selection per voice. Preview changes instantly before you commit them org-wide.",
  },
  {
    icon: Mic,
    title: "Speech in, speech out",
    description:
      "Pair TTS with transcription and realtime voice chat. The same voice catalog powers read-aloud, assistants, and podcasts.",
  },
  {
    icon: Globe,
    title: "Multilingual by default",
    description:
      "Browse voices across English, Spanish, French, German, Japanese, and more — one catalog, consistent controls everywhere.",
  },
  {
    icon: Zap,
    title: "Low-latency streaming",
    description:
      "WebSocket streaming for interactive playback. Hear the first syllable fast, pause mid-sentence, resume without restarting.",
  },
];

const STEPS: ModuleStep[] = [
  {
    number: "01",
    title: "Browse the voice catalog",
    description:
      "Open the playground, filter by language and provider, and audition voices with your own sample text.",
  },
  {
    number: "02",
    title: "Tune speed, emotion, and model",
    description:
      "Dial in how the voice should sound — conversational, narrated, or expressive — then save preferences for your account.",
  },
  {
    number: "03",
    title: "Use it everywhere",
    description:
      "Your picks follow you into chat read-aloud, voice assistants, transcript playback, and podcast generation.",
  },
];

const SUB_AREAS: ModuleSubArea[] = [
  {
    title: "Voice playground",
    status: "Live",
    href: "/voice/playground",
    items: [
      "Full voice catalog",
      "Emotion + speed controls",
      "Live streaming preview",
      "Saved preferences",
    ],
  },
  {
    title: "TTS tester",
    status: "Live",
    href: "/voice/tester",
    items: [
      "Side-by-side A/B compare",
      "Buffer + model tuning",
      "Preset sample scripts",
      "Latency metrics",
    ],
  },
  {
    title: "Voice chat",
    status: "Live",
    href: "/chat/voice",
    items: [
      "Hands-free conversation",
      "Realtime transcription",
      "Agent tool calls",
      "Mobile-friendly",
    ],
  },
  {
    title: "Podcast studio",
    status: "Live",
    href: "/podcast",
    items: [
      "Multi-voice episodes",
      "Script-to-audio pipeline",
      "Show + episode library",
      "Publish-ready output",
    ],
  },
  {
    title: "Custom voice cloning",
    status: "Coming soon",
    items: [
      "Upload reference audio",
      "Org-scoped voice library",
      "Consent + audit trail",
      "Agent-callable voices",
    ],
  },
];

export default function VoiceLanding() {
  return (
    <ModuleLanding
      surfaceId="landing:voice"
      eyebrow="AI Matrx Voice"
      eyebrowIcon={AudioLines}
      headline="Voices that sound"
      headlineGradient="human, everywhere you need them."
      description="Browse, preview, and tune production TTS voices — then use them in chat, assistants, transcripts, and podcasts. One voice catalog, consistent controls, streaming playback built for real workflows."
      primaryCtaHref="/sign-up?source=voice-landing"
      primaryCtaLabel="Try Voice Free"
      workspaceHref="/voice/playground"
      workspaceLabel="Voice Playground"
      capabilitiesHeading="More than a speaker button"
      capabilitiesDescription="Five capabilities turn text-to-speech from a utility into a voice layer your whole platform shares."
      capabilities={CAPABILITIES}
      stepsDescription="From browsing voices to hearing them in production in three steps."
      steps={STEPS}
      subAreasHeading="Voice surfaces"
      subAreasDescription="Playground, tester, voice chat, podcasts — every audio output path under one roof."
      subAreas={SUB_AREAS}
      finalCtaHeading="Give your agents a voice worth listening to"
      finalCtaDescription="Preview voices, tune them to your brand, and ship them across chat, transcripts, and podcasts. Free to start, no credit card."
      relatedModules={["/transcripts", "/chat", "/agents"]}
    />
  );
}
