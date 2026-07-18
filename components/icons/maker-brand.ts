import type { ComponentType } from "react";
import type { AITapButtonProps } from "@/components/icons/ai-tap-buttons";
import {
  AnthropicTapButton,
  CerebrasTapButton,
  ClaudeTapButton,
  CpuTapButton,
  DeepSeekTapButton,
  ElevenLabsTapButton,
  FluxTapButton,
  GeminiTapButton,
  GoogleTapButton,
  GrokTapButton,
  GroqTapButton,
  HuggingFaceTapButton,
  IdeogramTapButton,
  LlamaTapButton,
  LumaTapButton,
  MetaTapButton,
  MicrosoftTapButton,
  MistralTapButton,
  MoonshotTapButton,
  NvidiaTapButton,
  OpenAITapButton,
  PerplexityTapButton,
  QwenTapButton,
  ReplicateTapButton,
  RunwayTapButton,
  TogetherTapButton,
  XaiTapButton,
} from "@/components/icons/ai-tap-buttons";
import { RobotTapButton } from "@/components/icons/tap-buttons";

/** Canonical brand ids — one tap-button / glyph per provider family. */
export type MakerBrandId =
  | "openai"
  | "anthropic"
  | "claude"
  | "google"
  | "gemini"
  | "meta"
  | "llama"
  | "xai"
  | "grok"
  | "deepseek"
  | "mistral"
  | "perplexity"
  | "elevenlabs"
  | "flux"
  | "huggingface"
  | "replicate"
  | "nvidia"
  | "groq"
  | "together"
  | "cerebras"
  | "microsoft"
  | "moonshot"
  | "qwen"
  | "ideogram"
  | "runway"
  | "luma"
  | "matrx"
  | "cpu";

type MakerTapComponent = ComponentType<AITapButtonProps>;

const MAKER_BRAND_COMPONENTS: Record<MakerBrandId, MakerTapComponent> = {
  openai: OpenAITapButton,
  anthropic: AnthropicTapButton,
  claude: ClaudeTapButton,
  google: GoogleTapButton,
  gemini: GeminiTapButton,
  meta: MetaTapButton,
  llama: LlamaTapButton,
  xai: XaiTapButton,
  grok: GrokTapButton,
  deepseek: DeepSeekTapButton,
  mistral: MistralTapButton,
  perplexity: PerplexityTapButton,
  elevenlabs: ElevenLabsTapButton,
  flux: FluxTapButton,
  huggingface: HuggingFaceTapButton,
  replicate: ReplicateTapButton,
  nvidia: NvidiaTapButton,
  groq: GroqTapButton,
  together: TogetherTapButton,
  cerebras: CerebrasTapButton,
  microsoft: MicrosoftTapButton,
  moonshot: MoonshotTapButton,
  qwen: QwenTapButton,
  ideogram: IdeogramTapButton,
  runway: RunwayTapButton,
  luma: LumaTapButton,
  matrx: RobotTapButton as MakerTapComponent,
  cpu: CpuTapButton,
};

/** Exact maker names from `ai.model_public.maker` (case-insensitive). */
const MAKER_EXACT: Record<string, MakerBrandId> = {
  openai: "openai",
  anthropic: "anthropic",
  claude: "claude",
  google: "google",
  gemini: "google",
  meta: "meta",
  llama: "meta",
  xai: "xai",
  grok: "grok",
  "deepseek ai": "deepseek",
  deepseek: "deepseek",
  mistral: "mistral",
  mixtral: "mistral",
  perplexity: "perplexity",
  elevenlabs: "elevenlabs",
  "black forest": "flux",
  "black forest labs": "flux",
  flux: "flux",
  "hugging face": "huggingface",
  huggingface: "huggingface",
  replicate: "replicate",
  nvidia: "nvidia",
  groq: "groq",
  together: "together",
  cerebras: "cerebras",
  microsoft: "microsoft",
  "moonshot ai": "moonshot",
  moonshot: "moonshot",
  qwen: "qwen",
  ideogram: "ideogram",
  runway: "runway",
  luma: "luma",
  "ai matrx": "matrx",
};

/**
 * Resolve a catalog `maker` string to the canonical brand tap-button id.
 * Unknown makers fall back to `cpu`.
 */
export function resolveMakerBrandId(
  maker: string | null | undefined,
): MakerBrandId {
  if (!maker?.trim()) return "cpu";
  const key = maker.trim().toLowerCase();
  const exact = MAKER_EXACT[key];
  if (exact) return exact;

  if (key.includes("openai")) return "openai";
  if (key.includes("anthropic") || key.includes("claude")) return "anthropic";
  if (key.includes("google") || key.includes("gemini")) return "google";
  if (key.includes("meta") || key.includes("llama")) return "meta";
  if (key.includes("xai") || key.includes("grok")) return "xai";
  if (key.includes("deepseek")) return "deepseek";
  if (key.includes("mistral") || key.includes("mixtral")) return "mistral";
  if (key.includes("perplexity")) return "perplexity";
  if (key.includes("eleven")) return "elevenlabs";
  if (key.includes("black forest") || key.includes("flux")) return "flux";
  if (key.includes("hugging")) return "huggingface";
  if (key.includes("replicate")) return "replicate";
  if (key.includes("together")) return "together";
  if (key.includes("nvidia")) return "nvidia";
  if (key.includes("groq")) return "groq";
  if (key.includes("cerebras")) return "cerebras";
  if (key.includes("microsoft")) return "microsoft";
  if (key.includes("moonshot") || key.includes("kimi")) return "moonshot";
  if (key.includes("qwen")) return "qwen";
  if (key.includes("ideogram")) return "ideogram";
  if (key.includes("runway")) return "runway";
  if (key.includes("luma")) return "luma";
  if (key.includes("matrx")) return "matrx";

  return "cpu";
}

export function getMakerBrandTapButton(
  brandId: MakerBrandId,
): MakerTapComponent {
  return MAKER_BRAND_COMPONENTS[brandId];
}
