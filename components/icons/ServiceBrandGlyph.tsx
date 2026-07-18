import {
  AudioLines,
  Bolt,
  Boxes,
  Film,
  FlaskConical,
  Gauge,
  Layers,
  ScanSearch,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";
import { MakerBrandGlyph } from "@/components/icons/MakerBrandGlyph";
import {
  MATRX_SERVICE_COLOR,
  type MatrxServiceKind,
  resolveServiceIconKind,
} from "@/components/icons/service-brand";

const MATRX_SERVICE_ICONS: Record<
  Exclude<MatrxServiceKind, "generic">,
  LucideIcon
> = {
  lightning: Bolt,
  fast: Gauge,
  standard: Layers,
  media: Film,
  extract: ScanSearch,
  voice: AudioLines,
  hub: Boxes,
  test: FlaskConical,
};

export interface ServiceBrandGlyphProps {
  service: string | null | undefined;
  className?: string;
}

/** Inline service icon — maker logo or semantic Matrx tier glyph. */
export function ServiceBrandGlyph({
  service,
  className = "h-3.5 w-3.5",
}: ServiceBrandGlyphProps) {
  if (!service?.trim()) {
    return (
      <Layers
        className={cn(className, "shrink-0 text-muted-foreground")}
        aria-hidden
      />
    );
  }

  const kind = resolveServiceIconKind(service);

  if (kind.type === "maker") {
    return (
      <MakerBrandGlyph
        maker={kind.maker}
        colored
        className={cn(className, "shrink-0")}
      />
    );
  }

  if (kind.kind === "generic") {
    return (
      <MakerBrandGlyph
        maker="Matrx"
        colored
        className={cn(className, "shrink-0")}
      />
    );
  }

  const Icon = MATRX_SERVICE_ICONS[kind.kind];
  return (
    <Icon
      className={cn(className, "shrink-0", MATRX_SERVICE_COLOR[kind.kind])}
      aria-hidden
    />
  );
}
