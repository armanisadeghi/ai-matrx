export const SOCIAL_CARD_THEMES = [
  { id: "aurora", background: "#071426", surface: "#102544", accent: "#5eead4", glow: "#2563eb", motif: "orbit" },
  { id: "cobalt", background: "#07152f", surface: "#102a5c", accent: "#60a5fa", glow: "#7c3aed", motif: "grid" },
  { id: "violet", background: "#160c2f", surface: "#2a1556", accent: "#c4b5fd", glow: "#7c3aed", motif: "rays" },
  { id: "ember", background: "#2b100d", surface: "#522017", accent: "#fdba74", glow: "#dc2626", motif: "stack" },
  { id: "forest", background: "#071d18", surface: "#103c31", accent: "#6ee7b7", glow: "#15803d", motif: "orbit" },
  { id: "midnight", background: "#070b18", surface: "#151d35", accent: "#a5b4fc", glow: "#4338ca", motif: "grid" },
  { id: "rose", background: "#2d0b20", surface: "#55143d", accent: "#f9a8d4", glow: "#be185d", motif: "rays" },
  { id: "citrus", background: "#231b05", surface: "#48380a", accent: "#fde047", glow: "#ea580c", motif: "stack" },
  { id: "lagoon", background: "#05212b", surface: "#0b4051", accent: "#67e8f9", glow: "#0891b2", motif: "orbit" },
  { id: "plum", background: "#21102b", surface: "#442052", accent: "#e9d5ff", glow: "#9333ea", motif: "grid" },
  { id: "slate", background: "#101827", surface: "#25334a", accent: "#cbd5e1", glow: "#2563eb", motif: "rays" },
  { id: "coral", background: "#301410", surface: "#5f2820", accent: "#fecaca", glow: "#f97316", motif: "stack" },
  { id: "jade", background: "#06241d", surface: "#0e493a", accent: "#a7f3d0", glow: "#0d9488", motif: "orbit" },
  { id: "indigo", background: "#10133a", surface: "#252b70", accent: "#c7d2fe", glow: "#4f46e5", motif: "grid" },
  { id: "mulberry", background: "#2a0e25", surface: "#561b4a", accent: "#f5d0fe", glow: "#c026d3", motif: "rays" },
  { id: "bronze", background: "#26170a", surface: "#513218", accent: "#fed7aa", glow: "#d97706", motif: "stack" },
  { id: "marine", background: "#071d2b", surface: "#103a53", accent: "#bae6fd", glow: "#0284c7", motif: "orbit" },
  { id: "iris", background: "#181134", surface: "#35256a", accent: "#ddd6fe", glow: "#8b5cf6", motif: "grid" },
  { id: "crimson", background: "#2d0c14", surface: "#5d1827", accent: "#fecdd3", glow: "#e11d48", motif: "rays" },
  { id: "moss", background: "#151e0a", surface: "#303f17", accent: "#d9f99d", glow: "#65a30d", motif: "stack" },
  { id: "arctic", background: "#071c24", surface: "#153a45", accent: "#cffafe", glow: "#06b6d4", motif: "orbit" },
  { id: "amethyst", background: "#1f0e36", surface: "#40206a", accent: "#e9d5ff", glow: "#a855f7", motif: "grid" },
  { id: "sand", background: "#241d13", surface: "#493b27", accent: "#fef3c7", glow: "#ca8a04", motif: "rays" },
  { id: "graphite", background: "#101316", surface: "#282e34", accent: "#e2e8f0", glow: "#475569", motif: "stack" },
] as const;

export type SocialCardTheme = (typeof SOCIAL_CARD_THEMES)[number];
export type SocialCardThemeId = SocialCardTheme["id"];

export interface SocialCardOptions {
  title: string;
  description?: string;
  eyebrow?: string;
  intent?: string;
  /** Stable, non-sensitive identity used to choose a visual treatment. */
  seed?: string;
  theme?: SocialCardThemeId;
}

export function sanitizeSocialCardText(value: string | null | undefined, maxLength: number): string {
  return (value ?? "").replace(/\s+/g, " ").trim().slice(0, maxLength);
}

function hashSeed(seed: string): number {
  let hash = 2166136261;
  for (let index = 0; index < seed.length; index += 1) {
    hash ^= seed.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

export function resolveSocialCardTheme(seed: string, requestedTheme?: string | null): SocialCardTheme {
  const requested = SOCIAL_CARD_THEMES.find((theme) => theme.id === requestedTheme);
  if (requested) return requested;
  return SOCIAL_CARD_THEMES[hashSeed(seed) % SOCIAL_CARD_THEMES.length];
}

export function buildSocialCardUrl(options: SocialCardOptions): string {
  const params = new URLSearchParams();
  params.set("title", sanitizeSocialCardText(options.title, 96) || "AI Matrx");
  const description = sanitizeSocialCardText(options.description, 180);
  const eyebrow = sanitizeSocialCardText(options.eyebrow, 36);
  const intent = sanitizeSocialCardText(options.intent, 32);
  if (description) params.set("description", description);
  if (eyebrow) params.set("eyebrow", eyebrow);
  if (intent) params.set("intent", intent);
  if (options.seed) params.set("seed", sanitizeSocialCardText(options.seed, 96));
  if (options.theme) params.set("theme", options.theme);
  return `/social-card?${params.toString()}`;
}
