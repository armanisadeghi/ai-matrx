'use client'

import React, {TextareaHTMLAttributes, useMemo, useState} from "react";
import {cn} from "@/styles/themes/utils";
import {Label} from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";



interface FloatingLabelTextAreaProps extends React.TextareaHTMLAttributes<HTMLTextAreaElement> {
    label: string;
    value?: string;
    onChange?: React.ChangeEventHandler<HTMLTextAreaElement>;
    disabled?: boolean;
    variant?: 'default' | 'destructive' | 'success' | 'outline' | 'secondary' | 'ghost' | 'link' | 'primary';
    floatingLabel?: boolean;
}

export const FloatingLabelTextArea: React.FC<FloatingLabelTextAreaProps> = ({
    id,
    label,
    value = "",
    onChange,
    disabled = false,
    variant = "default",
    floatingLabel = true,
    className,
    rows = 3,
    ...props
}) => {
    const [isFocused, setIsFocused] = useState(false);

    const handleChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
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
            <Textarea
                id={id}
                value={value}
                onChange={handleChange}
                disabled={disabled}
                rows={rows}
                className={cn(
                    "text-md",
                    "h-auto",
                    variantStyles,
                    disabled ? "cursor-not-allowed opacity-50 bg-muted" : "",
                    className
                )}
                {...props}
            />
        </>
    );

    const floatingLabelLayout = (
        <div className="relative mt-2">
            <Textarea
                id={id}
                value={value}
                onChange={handleChange}
                disabled={disabled}
                onFocus={() => setIsFocused(true)}
                onBlur={() => setIsFocused(false)}
                rows={rows}
                className={cn(
                    "text-md",
                    "pt-6 pb-2",
                    "h-auto",
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

export default FloatingLabelTextArea;
