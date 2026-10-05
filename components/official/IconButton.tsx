import React from "react";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { Button, type GlyphTone } from "@ai-matrx/design-system/controls";
import { LucideIcon } from "lucide-react";

/**
 * A door onto THE control: an icon-only controls `Button` (the 28px circle) with an optional
 * tooltip. It has no size and no colour of its own — a glyph whose colour carries meaning says
 * so with `glyphTone`; `className` places it (margin, position, flex), never restyles it.
 */
export interface IconButtonProps
  extends Omit<React.ButtonHTMLAttributes<HTMLButtonElement>, "children"> {
  icon: LucideIcon | React.ComponentType;
  tooltip?: string;
  /** Legacy tone words map onto the control's variants: ghost → quiet, default → primary,
   *  destructive → danger. */
  variant?: "ghost" | "outline" | "default" | "secondary" | "destructive" | "link";
  /** The glyph's own status ink when its colour carries meaning. */
  glyphTone?: GlyphTone;
  /** Work in flight: the glyph turns (a refresh, a duplicate, an export). */
  spinning?: boolean;
  tooltipSide?: "top" | "right" | "bottom" | "left";
  tooltipAlign?: "start" | "center" | "end";
  tooltipOffset?: number;
}

const VARIANT = {
  ghost: "quiet",
  outline: "outline",
  secondary: "outline",
  default: "primary",
  destructive: "danger",
  link: "link",
} as const;

const IconButton: React.FC<IconButtonProps> = ({
  icon: Icon,
  tooltip,
  variant = "ghost",
  glyphTone,
  spinning = false,
  tooltipSide = "bottom",
  tooltipAlign = "center",
  tooltipOffset = 5,
  "aria-label": ariaLabel,
  ...props
}) => {
  const control = (
    <Button
      variant={VARIANT[variant]}
      icon={spinning ? <Icon className="animate-spin" /> : <Icon />}
      glyphTone={glyphTone}
      aria-label={ariaLabel ?? tooltip ?? "Action"}
      {...props}
    />
  );
  if (!tooltip) return control;
  return (
    <Tooltip>
      <TooltipTrigger asChild>{control}</TooltipTrigger>
      <TooltipContent side={tooltipSide} align={tooltipAlign} className="z-[9999]" sideOffset={tooltipOffset}>
        {tooltip}
      </TooltipContent>
    </Tooltip>
  );
};

export default IconButton;
