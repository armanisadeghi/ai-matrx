import type { AITapButtonProps } from "@/components/icons/ai-tap-buttons";
import {
  getMakerBrandTapButton,
  resolveMakerBrandId,
} from "@/components/icons/maker-brand";

export type MakerTapButtonProps = Omit<AITapButtonProps, "ariaLabel"> & {
  maker: string;
  /** Defaults to the maker name. */
  ariaLabel?: string;
};

/**
 * Provider tap button for a catalog `maker` string.
 * Tap-target hygiene: never wrap in padding/margin/gap — the 40×40 outer ring
 * is the spacing.
 */
export function MakerTapButton({
  maker,
  ariaLabel,
  colored = true,
  variant = "transparent",
  tooltip,
  ...props
}: MakerTapButtonProps) {
  const brand = resolveMakerBrandId(maker);
  const Component = getMakerBrandTapButton(brand);
  const label = ariaLabel ?? maker;

  return (
    <Component
      variant={variant}
      colored={colored}
      ariaLabel={label}
      tooltip={tooltip ?? label}
      {...props}
    />
  );
}
