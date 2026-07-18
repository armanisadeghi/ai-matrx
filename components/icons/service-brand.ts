import { resolveMakerBrandId } from "@/components/icons/maker-brand";

/** Semantic Matrx serving-tier families (`served_via` branded names). */
export type MatrxServiceKind =
  | "lightning"
  | "fast"
  | "standard"
  | "media"
  | "extract"
  | "voice"
  | "hub"
  | "test"
  | "generic";

export type ServiceIconKind =
  { type: "maker"; maker: string } | { type: "matrx"; kind: MatrxServiceKind };

function resolveMatrxServiceKind(service: string): MatrxServiceKind {
  const key = service.trim().toLowerCase();
  if (key.includes("lightning")) return "lightning";
  if (key.includes("fast")) return "fast";
  if (key.includes("media")) return "media";
  if (key.includes("extract")) return "extract";
  if (key.includes("voice")) return "voice";
  if (key.includes("hub")) return "hub";
  if (key.includes("test")) return "test";
  if (key.includes("standard")) return "standard";
  return "generic";
}

/**
 * Map a catalog `served_via` label to either a maker logo (OpenAI, Google, …)
 * or a semantic Matrx tier icon (Lightning, Fast, Media, …).
 */
export function resolveServiceIconKind(service: string): ServiceIconKind {
  const trimmed = service.trim();
  const key = trimmed.toLowerCase();

  if (key.startsWith("matrx")) {
    return { type: "matrx", kind: resolveMatrxServiceKind(trimmed) };
  }

  const makerId = resolveMakerBrandId(trimmed);
  if (makerId !== "cpu") {
    return { type: "maker", maker: trimmed };
  }

  return { type: "matrx", kind: resolveMatrxServiceKind(trimmed) };
}

/** Tailwind color classes for Matrx tier glyphs in filter chips / rows. */
export const MATRX_SERVICE_COLOR: Record<MatrxServiceKind, string> = {
  lightning: "text-amber-500",
  fast: "text-primary",
  standard: "text-muted-foreground",
  media: "text-secondary",
  extract: "text-info",
  voice: "text-accent-2",
  hub: "text-primary/80",
  test: "text-muted-foreground/70",
  generic: "text-primary",
};
