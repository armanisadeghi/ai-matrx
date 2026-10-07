'use client'

import React, { useState, useMemo } from 'react';
import { Input, type InputProps } from "@ai-matrx/design-system/controls";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";

export interface FloatingLabelInputProps extends Omit<InputProps, "value" | "onChange"> {
    label: string;
    value?: string;
    onChange?: React.ChangeEventHandler<HTMLInputElement>;
    disabled?: boolean;
    variant?: 'default' | 'destructive' | 'success' | 'outline' | 'secondary' | 'ghost' | 'link' | 'primary';
    floatingLabel?: boolean;
}

export const FloatingLabelInput: React.FC<FloatingLabelInputProps> = ({
    id,
    label,
    value = "",
    onChange,
    disabled = false,
    variant = "default",
    floatingLabel = true,
    className,
    onFocus,
    onBlur,
    ...props
}) => {
    const [isFocused, setIsFocused] = useState(false);

    const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        onChange?.(e);
    };

    const variantStyles = {
        destructive: "border-destructive text-destructive",
        success: "border-success text-success",
        outline: "border-2",
        secondary: "bg-secondary text-secondary-foreground",
        ghost: "border-none bg-transparent",
        link: "text-primary underline-offset-4 hover:underline",
        primary: "bg-primary text-primary-foreground",
        default: "",
    }[variant];

    const labelClassName = useMemo(() =>
        `absolute left-3 transition-all duration-200 ease-in-out pointer-events-none z-20 text-sm ${
            (isFocused || value)
                ? `absolute -top-2 text-sm ${
                    disabled
                        ? '[&]:text-gray-400 dark:[&]:text-gray-400'
                        : '[&]:text-blue-500 dark:[&]:text-blue-500'
                }`
                : 'top-3 [&]:text-gray-400 dark:[&]:text-gray-400'
        }`,
        [isFocused, value, disabled]
    );

    const standardLayout = (
        <>
            <Label
                htmlFor={id}
                className={cn(
                    "block text-sm font-medium mb-1",
                    disabled ? "text-muted-foreground" : "text-foreground"
                )}
            >
                {label}
            </Label>
            <Input
                id={id}
                value={value}
                onChange={handleChange}
                disabled={disabled}
                onFocus={onFocus}
                onBlur={onBlur}
                className={className}
                {...props}
            />
        </>
    );

    const floatingLabelLayout = (
        <div className="relative mt-2">
            <Input
                id={id}
                value={value}
                onChange={handleChange}
                disabled={disabled}
                onFocus={(event) => {
                    setIsFocused(true);
                    onFocus?.(event);
                }}
                onBlur={(event) => {
                    setIsFocused(false);
                    onBlur?.(event);
                }}
                className={cn(
                    "text-md",
                    "pt-6 pb-2",
                    variantStyles,
                    disabled ? "cursor-not-allowed opacity-50 bg-muted" : "",
                    className
                )}
                {...props}
            />
            <Label
                htmlFor={id}
                className={labelClassName}
            >
                <span className="px-1 relative z-20">
                    {label}
                </span>
            </Label>
        </div>
    );

    return floatingLabel ? floatingLabelLayout : standardLayout;
};

export default FloatingLabelInput;
