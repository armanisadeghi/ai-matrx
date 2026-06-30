// components/MatrxCheckbox.tsx

'use client';

import React from "react";
import { motion } from "motion/react";
import {cn} from "@/utils/cn";
import { AnimatedCheckboxProps } from "@/types/componentConfigTypes";
import {densityConfig, getComponentStyles, useComponentAnimation } from "@/config/ui/FlexConfig";
import * as RadixCheckbox from "@radix-ui/react-checkbox";
import {Check} from "lucide-react";


const MatrxCheckbox: React.FC<AnimatedCheckboxProps> = (
    {
        field,
        checked,
        onChange,
        className,
        disabled = false,
        size = 'md',
        density = 'normal',
        variant = 'default',
        animation = 'subtle',
        disableAnimation = false,
        error,
        hint,
        state = disabled ? 'disabled' : error ? 'error' : 'idle',
        ...props
    }) => {
    const animationProps = useComponentAnimation(animation, disableAnimation);
    const densityStyles = densityConfig[density];

    const checkboxSize = {
        xs: 'h-3 w-3',
        sm: 'h-4 w-4',
        md: 'h-5 w-5',
        lg: 'h-6 w-6',
        xl: 'h-7 w-7'
    }[size];

    const iconSize = {
        xs: 12,
        sm: 14,
        md: 16,
        lg: 18,
        xl: 20
    }[size];

    if (!field) {
        return null;
    }

    return (
        <motion.div
            className={cn(
                densityStyles.spacing,
                "flex flex-col",
                className
            )}
            {...animationProps}
            {...props}
        >
            <motion.div
                className="flex items-center gap-2"
                whileHover={disabled ? undefined : {x: 5}}
            >
                <RadixCheckbox.Root
                    id={field.name}
                    checked={checked}
                    onCheckedChange={!disabled ? onChange : undefined}
                    disabled={disabled}
                    className={cn(
                        getComponentStyles({
                            size,
                            density,
                            variant,
                            state,
                            disabled
                        }),
                        checkboxSize,
                        "flex appearance-none items-center justify-center rounded",
                        "border-2 border-input",
                        "data-[state=checked]:bg-primary data-[state=checked]:border-primary",
                        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary",
                        error && "border-destructive",
                    )}
                >
                    <RadixCheckbox.Indicator>
                        <motion.div
                            initial={{scale: 0}}
                            animate={{scale: 1}}
                            exit={{scale: 0}}
                            transition={{type: "spring", stiffness: 300, damping: 20}}
                        >
                            <Check
                                className="text-primary-foreground"
                                size={iconSize}
                            />
                        </motion.div>
                    </RadixCheckbox.Indicator>
                </RadixCheckbox.Root>

                <label
                    htmlFor={field.name}
                    className={cn(
                        "text-sm font-medium select-none",
                        disabled ? "text-muted cursor-not-allowed" : "text-foreground cursor-pointer",
                        densityStyles.fontSize
                    )}
                >
                    {field.label}
                </label>
            </motion.div>

            {error && (
                <motion.span
                    initial={{opacity: 0, y: -10}}
                    animate={{opacity: 1, y: 0}}
                    exit={{opacity: 0, y: -10}}
                    className="text-sm text-destructive mt-1"
                >
                    {error}
                </motion.span>
            )}

            {hint && !error && (
                <span className="text-sm text-muted-foreground mt-1">
                    {hint}
                </span>
            )}
        </motion.div>
    );
};

export default MatrxCheckbox;
