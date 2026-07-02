'use client';

import React, { useState, forwardRef } from 'react';
import { cn } from "@/lib/utils";
import { noErrors } from '@/utils/utils';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";

const defaultSizes = {
    width: 'w-48',
    height: 'h-16',
} as const;

interface MultiSwitchToggleState<T> {
    label?: string;
    icon?: React.ReactNode;
    value: T;
}

interface MultiSwitchToggleProps<T = unknown> {
    variant?: 'rounded' | 'geometric' | string;
    defaultValue?: number;
    value?: T;
    states: Array<MultiSwitchToggleState<T>>;
    onChange?: (value: T) => void;
    width?: string;
    height?: string;
    disabled?: boolean;
    className?: string;
}

const MultiSwitchToggleInner = <T,>({
    variant = 'geometric',
    defaultValue = 0,
    value,
    states,
    onChange,
    width,
    height,
    disabled = false,
    className,
}: MultiSwitchToggleProps<T>, ref: React.ForwardedRef<HTMLDivElement>) => {
    const [internalState, setInternalState] = useState(defaultValue);
    const validVariant = noErrors(variant, 'rounded', ['rounded', 'geometric']);

    const activeState = value !== undefined 
        ? states.findIndex(state => state.value === value)
        : internalState;

    const handleToggle = (index: number) => {
        if (disabled) return;
        if (value === undefined) {
            setInternalState(index);
        }
        onChange?.(states[index].value);
    };

    const singleButtonWidth = width || defaultSizes.width;
    const numericWidth = parseInt(singleButtonWidth.replace('w-', ''));
    const containerWidth = `w-[${numericWidth * states.length}]`;

    const containerClasses = cn(
        "relative flex bg-muted shadow-inner overflow-hidden",
        containerWidth,
        height || defaultSizes.height,
        validVariant === 'rounded' && "rounded-full",
        disabled && "opacity-50 cursor-not-allowed",
        className
    );

    const buttonBaseClasses = "relative h-full transition-all duration-300";

    return (
        <TooltipProvider>
            <div className="flex items-center justify-center">
                <div ref={ref} className={containerClasses}>
                    {states.map((state, index) => {
                        const button = (
                            <button
                                key={index}
                                type="button"
                                onClick={() => handleToggle(index)}
                                disabled={disabled}
                                style={{
                                    zIndex: activeState === index ? 20 : 10
                                }}
                                className={cn(
                                    buttonBaseClasses,
                                    width || defaultSizes.width,
                                    activeState === index ? "bg-primary transform text-sm" : "transform -translate-y-0.5 text-xs"
                                )}
                            >
                                <div
                                    className={cn(
                                        "absolute inset-0",
                                        validVariant === 'rounded' && index === 0 && "rounded-l-full",
                                        validVariant === 'rounded' && index === states.length - 1 && "rounded-r-full",
                                        activeState === index 
                                            ? "bg-gradient-to-br from-primary/90 via-primary to-primary/90" 
                                            : "bg-gradient-to-br from-background via-background/90 to-background/80"
                                    )}
                                />
                                <span
                                    className={cn(
                                        "relative z-30 font-medium text-xs flex items-center justify-center h-full",
                                        activeState === index 
                                            ? "text-primary-foreground" 
                                            : "text-muted-foreground"
                                    )}
                                >
                                    {state.icon ? (
                                        <div className="flex items-center justify-center w-full h-full">
                                            {state.icon}
                                        </div>
                                    ) : (
                                        <div className="truncate px-2">
                                            {state.label}
                                        </div>
                                    )}
                                </span>
                            </button>
                        );

                        return state.icon && state.label ? (
                            <Tooltip key={index}>
                                <TooltipTrigger asChild>
                                    {button}
                                </TooltipTrigger>
                                <TooltipContent>
                                    {state.label}
                                </TooltipContent>
                            </Tooltip>
                        ) : (
                            button
                        );
                    })}

                    {/* Divider Lines */}
                    {Array.from({ length: states.length - 1 }).map((_, idx) => (
                        <div 
                            key={idx}
                            style={{
                                left: `${(idx + 1) * (100 / states.length)}%`
                            }}
                            className="absolute top-0 bottom-0 w-px bg-border transform -translate-x-1/2 z-0"
                        />
                    ))}
                </div>
            </div>
        </TooltipProvider>
    );
};

MultiSwitchToggleInner.displayName = 'MultiSwitchToggle';

// React.forwardRef's type declaration cannot express a generic-over-T component,
// so the forwarded component is re-typed here as a generic function accepting a
// ref, preserving full type safety for `states`/`value`/`onChange` at every call
// site instead of erasing them to `any`.
const MultiSwitchToggle = forwardRef(MultiSwitchToggleInner) as <T>(
    props: MultiSwitchToggleProps<T> & { ref?: React.ForwardedRef<HTMLDivElement> },
) => ReturnType<typeof MultiSwitchToggleInner>;

export default MultiSwitchToggle;