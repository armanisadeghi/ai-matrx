import * as React from "react";
import { VariantProps, cva } from "class-variance-authority";
import { Button } from "@ai-matrx/design-system";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";

export interface IconButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement>,
    VariantProps<typeof iconButtonVariants> {
  tooltip?: string;
  icon: React.ReactNode;
  showTooltipOnDisabled?: boolean;
  disabledTooltip?: string; // Optional different tooltip text when disabled
}

const iconButtonVariants = cva(
  "inline-flex items-center justify-center rounded-full",
  {
    variants: {
      variant: {
        default: "bg-primary text-primary-foreground hover:bg-primary/90",
        destructive: "bg-destructive text-destructive-foreground hover:bg-destructive/90",
        outline: "border border-input bg-transparent hover:bg-accent hover:text-accent-foreground",
        secondary: "bg-secondary text-secondary-foreground hover:bg-secondary/80",
        ghost: "hover:bg-accent hover:text-accent-foreground",
        link: "text-primary underline-offset-4 hover:underline",
      },
      size: {
        default: "h-9 w-9",
        sm: "h-7 w-7",
        lg: "h-11 w-11",
      },
    },
    defaultVariants: {
      variant: "default",
      size: "default",
    },
  }
);

const IconButton = React.forwardRef<HTMLButtonElement, IconButtonProps>(
  ({ 
    className, 
    variant, 
    size, 
    tooltip, 
    disabledTooltip,
    icon, 
    showTooltipOnDisabled = true,
    disabled,
    ...props 
  }, ref) => {
    // Create base button
    const button = (
      <Button
        ref={disabled && showTooltipOnDisabled ? undefined : ref}
        variant={variant}
        size={size}
        className={cn(
          iconButtonVariants({ variant, size, className }),
          disabled && "opacity-50 cursor-not-allowed"
        )}
        disabled={disabled}
        {...props}
      >
        {icon}
      </Button>
    );

    // If no tooltip, just return the button
    if (!tooltip) {
      return button;
    }

    // Use different tooltip text for disabled state if provided
    const tooltipText = disabled && disabledTooltip ? disabledTooltip : tooltip;

    // If disabled and we want to show tooltip, wrap in a span to make tooltip work
    const triggerElement = disabled && showTooltipOnDisabled ? (
      <span className="inline-block" aria-disabled={true}>{button}</span>
    ) : button;

    return (
      <TooltipProvider>
        <Tooltip delayDuration={300}>
          <TooltipTrigger asChild disabled={false}>
            {triggerElement}
          </TooltipTrigger>
          <TooltipContent 
            className={cn(
              disabled && showTooltipOnDisabled && "bg-zinc-400 dark:bg-zinc-700 text-zinc-100"
            )}
            sideOffset={5}
          >
            {tooltipText}
          </TooltipContent>
        </Tooltip>
      </TooltipProvider>
    );
  }
);

IconButton.displayName = "IconButton";

export { IconButton, iconButtonVariants }; 