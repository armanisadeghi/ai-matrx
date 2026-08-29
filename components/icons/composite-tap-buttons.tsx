import {
  SaveTapButton,
  LoadingTapButton,
} from "@ai-matrx/tap-target/buttons";

type Variant = "glass" | "transparent" | "solid" | "group";

interface CompositeButtonBaseProps {
  variant?: Variant;
  onClick?: () => void;
  as?: "button" | "label";
  htmlFor?: string;
  ariaLabel?: string;
  disabled?: boolean;
  className?: string;
  strokeWidth?: number;
  bgColor?: string;
  iconColor?: string;
  hoverBgColor?: string;
  activeBgColor?: string;
  // Link support — see tap-buttons.tsx for full semantics.
  href?: string;
  target?: "_blank" | "_self" | "_parent" | "_top";
  rel?: string;
  prefetch?: boolean | null;
}

// ---------------------------------------------------------------------------
// SaveOrLoadingTapButton
// Renders SaveTapButton when idle, LoadingTapButton (animated) when loading.
// ---------------------------------------------------------------------------

interface SaveOrLoadingTapButtonProps extends CompositeButtonBaseProps {
  isLoading?: boolean;
}

export function SaveOrLoadingTapButton({
  isLoading = false,
  ...props
}: SaveOrLoadingTapButtonProps) {
  if (isLoading) {
    return <LoadingTapButton {...props} disabled ariaLabel="Saving…" />;
  }
  return <SaveTapButton {...props} />;
}
