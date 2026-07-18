import { BrandGlyph } from "@/components/icons/brand-glyphs";
import { resolveMakerBrandId } from "@/components/icons/maker-brand";

export interface MakerBrandGlyphProps {
  maker: string | null | undefined;
  colored?: boolean;
  className?: string;
}

/** Inline maker logo — display-only (safe inside other buttons/rows). */
export function MakerBrandGlyph({
  maker,
  colored = false,
  className = "h-3.5 w-3.5",
}: MakerBrandGlyphProps) {
  const brand = resolveMakerBrandId(maker);
  return <BrandGlyph brand={brand} colored={colored} className={className} />;
}
