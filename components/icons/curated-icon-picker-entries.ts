import type { ComponentType } from "react";
import type { AITapButtonProps } from "@/components/icons/ai-tap-buttons";
import {
  GoogleTapButton,
  GeminiTapButton,
  OpenAITapButton,
  AnthropicTapButton,
  ClaudeTapButton,
  XaiTapButton,
  GrokTapButton,
  MetaTapButton,
  LlamaTapButton,
  DeepSeekTapButton,
  MistralTapButton,
  PerplexityTapButton,
  FluxTapButton,
  CpuTapButton,
  PowerTapButton,
  TextGenerationTapButton,
  ImageGenerationTapButton,
  VideoGenerationTapButton,
  AudioLinesTapButton,
  CodeGenerationTapButton,
  TranscriptionTapButton,
  TranslationTapButton,
  WandSparklesTapButton,
} from "@/components/icons/ai-tap-buttons";

/** One row in the picker: real tap-target chrome + a storable IconResolver id. */
export type CuratedPickerAiTapEntry = {
  label: string;
  /** Written to the icon field — must resolve via IconResolver / validation */
  selectValue: string;
  /** Brand tiles: full color like `/demos/button-demo` provider row */
  colored?: boolean;
  Component: ComponentType<AITapButtonProps>;
};

/**
 * Same set as “Model Provider Selector (Brand Colors)” on the button demo (+ CPU).
 * selectValue is a best-effort registry/Lucide id; users can refine in the Icons tab.
 */
export const CURATED_PICKER_AI_BRANDS: CuratedPickerAiTapEntry[] = [
  {
    label: "Google",
    selectValue: "FcGoogle",
    colored: true,
    Component: GoogleTapButton,
  },
  {
    label: "Gemini",
    selectValue: "FcAssistant",
    colored: true,
    Component: GeminiTapButton,
  },
  {
    label: "OpenAI",
    selectValue: "Zap",
    colored: true,
    Component: OpenAITapButton,
  },
  {
    label: "Anthropic",
    selectValue: "FcEngineering",
    colored: true,
    Component: AnthropicTapButton,
  },
  {
    label: "Claude",
    selectValue: "FcAssistant",
    colored: true,
    Component: ClaudeTapButton,
  },
  {
    label: "xAI",
    selectValue: "Cpu",
    colored: true,
    Component: XaiTapButton,
  },
  {
    label: "Grok",
    selectValue: "MessageSquare",
    colored: true,
    Component: GrokTapButton,
  },
  {
    label: "Meta",
    selectValue: "FcBusiness",
    colored: true,
    Component: MetaTapButton,
  },
  {
    label: "Llama",
    selectValue: "FcLibrary",
    colored: true,
    Component: LlamaTapButton,
  },
  {
    label: "DeepSeek",
    selectValue: "Terminal",
    colored: true,
    Component: DeepSeekTapButton,
  },
  {
    label: "Mistral",
    selectValue: "Activity",
    colored: true,
    Component: MistralTapButton,
  },
  {
    label: "Perplexity",
    selectValue: "Search",
    colored: true,
    Component: PerplexityTapButton,
  },
  {
    label: "Flux",
    selectValue: "Image",
    colored: true,
    Component: FluxTapButton,
  },
  {
    label: "CPU",
    selectValue: "Cpu",
    colored: false,
    Component: CpuTapButton,
  },
];

/** “AI Action Tools — Lightning Family” style row from the button demo */
export const CURATED_PICKER_AI_ACTIONS: CuratedPickerAiTapEntry[] = [
  { label: "Power", selectValue: "Zap", Component: PowerTapButton },
  {
    label: "Text Gen",
    selectValue: "FileText",
    Component: TextGenerationTapButton,
  },
  {
    label: "Image Gen",
    selectValue: "Image",
    Component: ImageGenerationTapButton,
  },
  {
    label: "Video Gen",
    selectValue: "Video",
    Component: VideoGenerationTapButton,
  },
  {
    label: "Audio",
    selectValue: "Volume2",
    Component: AudioLinesTapButton,
  },
  {
    label: "Code Gen",
    selectValue: "Code",
    Component: CodeGenerationTapButton,
  },
  {
    label: "Transcribe",
    selectValue: "Mic",
    Component: TranscriptionTapButton,
  },
  {
    label: "Translate",
    selectValue: "Globe",
    Component: TranslationTapButton,
  },
  {
    label: "Workflow",
    selectValue: "Zap",
    Component: WandSparklesTapButton,
  },
  { label: "CPU", selectValue: "Cpu", Component: CpuTapButton },
];

export type CuratedPickerTabId =
  | "all"
  | "svg"
  | "icons"
  | "lucideWeb"
  | "aiBrands"
  | "aiActions";

export const CURATED_PICKER_TABS: {
  id: CuratedPickerTabId;
  label: string;
}[] = [
  { id: "all", label: "All" },
  { id: "svg", label: "Matrx SVG" },
  { id: "icons", label: "Icons" },
  { id: "lucideWeb", label: "Lucide.dev" },
  { id: "aiBrands", label: "AI brands" },
  { id: "aiActions", label: "AI actions" },
];
