import React from "react";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { Button, ButtonProps } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { LucideIcon } from "lucide-react";

export interface IconButtonProps extends Omit<ButtonProps, "size"> {
  icon: LucideIcon | React.ComponentType | string;
  tooltip?: string;
  size?: "xs" | "sm" | "md" | "lg" | "xl";
  tooltipSide?: "top" | "right" | "bottom" | "left";
  tooltipAlign?: "start" | "center" | "end";
  tooltipOffset?: number;
  iconClassName?: string;
}

const sizeClasses = {
  xs: "h-11 w-11 p-0.5 sm:h-5 sm:w-5",
  sm: "h-11 w-11 p-0.5 sm:h-6 sm:w-6",
  md: "h-11 w-11 p-1 sm:h-8 sm:w-8",
  lg: "h-11 w-11 p-1.5 sm:h-10 sm:w-10",
  xl: "w-12 h-12 p-2",
};

const iconSizeClasses = {
  xs: "h-2.5 w-2.5",
  sm: "h-3 w-3",
  md: "h-4 w-4",
  lg: "h-5 w-5",
  xl: "h-6 w-6",
};

const IconButton: React.FC<IconButtonProps> = ({
  icon: Icon,
  tooltip,
  size = "sm",
  variant = "ghost",
  tooltipSide = "bottom",
  tooltipAlign = "center",
  tooltipOffset = 5,
  className,
  iconClassName,
  "aria-label": ariaLabel,
  ...props
}) => {
  const ButtonComponent = (
    <Button
      variant={variant}
      size="icon"
      aria-label={ariaLabel ?? tooltip}
      className={cn(
        sizeClasses[size],
        "focus-visible:ring-offset-0 focus-visible:ring-1",
        className,
      )}
      {...props}
    >
      <Icon className={cn(iconSizeClasses[size], iconClassName)} />
    </Button>
  );

  if (!tooltip) {
    return ButtonComponent;
  }

  return (
    <Tooltip>
      <TooltipTrigger asChild>{ButtonComponent}</TooltipTrigger>
      <TooltipContent
        side={tooltipSide}
        align={tooltipAlign}
        className="z-[9999]"
        sideOffset={tooltipOffset}
      >
        {tooltip}
      </TooltipContent>
    </Tooltip>
  );
};

export default IconButton;

// Usage example:
import { Copy } from "lucide-react";

const MyComponent = () => {
  return (
    <div>
      <IconButton
        icon={Copy}
        tooltip="Copy to clipboard"
        size="md"
        variant="outline"
        tooltipSide="top"
        onClick={() => console.log("Copied!")}
      />
    </div>
  );
};
