'use client';

import { cn } from "@/lib/utils";
import { ComponentSize } from "@/types/componentConfigTypes";
import { cva } from "class-variance-authority";

import { forwardRef } from "react";
import { MatrxVariant } from "../types";

const spinnerVariants = cva(
    "relative inline-flex flex-col items-center justify-center gap-2",
    {
        variants: {
            size: {
                default: "h-8 w-8",
                xs: "h-4 w-4",
                sm: "h-5 w-5",
                md: "h-8 w-8",
                lg: "h-12 w-12",
                xl: "h-16 w-16",
            },
            variant: {
                default: "text-primary",
                destructive: "text-destructive",
                success: "text-success",
                outline: "text-primary",
                secondary: "text-secondary",
                ghost: "text-primary",
                link: "text-primary",
                primary: "text-primary"
            }
        },
        defaultVariants: {
            size: "default",
            variant: "primary"
        }
    }
);

const spinnerCircleVariants = cva(
    "absolute rounded-full border-2 border-solid animate-[spinner_0.8s_linear_infinite]",
    {
        variants: {
            size: {
                default: "h-8 w-8",
                xs: "h-4 w-4",
                sm: "h-5 w-5",
                md: "h-8 w-8",
                lg: "h-12 w-12",
                xl: "h-16 w-16",
            }
        },
        defaultVariants: {
            size: "default"
        }
    }
);

interface SpinnerProps extends Omit<React.HTMLAttributes<HTMLDivElement>, 'color'> {
    size?: ComponentSize;
    variant?: MatrxVariant;
    label?: string;
}

type SpinnerVariantSize = "default" | "xs" | "sm" | "md" | "lg" | "xl";

const normalizeSpinnerSize = (size: ComponentSize): SpinnerVariantSize => {
    if (size === "icon") return "sm";
    if (size === "2xl" || size === "3xl") return "xl";
    return size;
};

const Spinner = forwardRef<HTMLDivElement, SpinnerProps>(
    ({ className, size = "default", variant = "primary", label, ...props }, ref) => {
        // Normalize size to match spinnerVariants supported sizes
        const normalizedSize = normalizeSpinnerSize(size);

        return (
            <div
                ref={ref}
                role="status"
                aria-label={label || "Loading"}
                className={cn(spinnerVariants({ size: normalizedSize, variant, className }))}
                {...props}
            >
                <div className="relative">
                    <div
                        className={cn(
                            spinnerCircleVariants({ size: normalizedSize }),
                            "border-current opacity-25"
                        )}
                    />
                    <div
                        className={cn(
                            spinnerCircleVariants({ size: normalizedSize }),
                            "border-t-transparent border-l-transparent"
                        )}
                    />
                </div>
                {label && (
                    <span className="text-sm">{label}</span>
                )}
            </div>
        );
    }
);

Spinner.displayName = "Spinner";

export { Spinner };
export type { SpinnerProps };
