'use client';

import React from "react";
import { motion } from "motion/react";
import {cn} from "@/styles/themes/utils";
import { Input } from "@ai-matrx/design-system";
import {Label} from "@/components/ui/label";
import { FormField } from "@/types/AnimatedFormTypes";

interface AnimatedInputProps extends Omit<React.InputHTMLAttributes<HTMLInputElement>, 'onChange'> {
    field: FormField;
    value: string;
    onChange: (value: string) => void;
    className?: string;
}

const AnimatedInput: React.FC<AnimatedInputProps> = (
    {
        field,
        value,
        onChange,
        className,
        disabled = false,
        ...props
    }) => {
    const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        onChange(e.target.value);
    };

    return (
        <motion.div
            initial={{opacity: 0, y: 20}}
            animate={{opacity: 1, y: 0}}
            exit={{opacity: 0, y: -20}}
            transition={{duration: 0.3}}
            className={cn("mb-4", className)}
        >
            <Label
                htmlFor={field.name}
                className={cn(
                    "block text-sm font-medium mb-1",
                    disabled ? "text-muted-foreground" : "text-foreground"
                )}
            >
                {field.label}
            </Label>
            <Input
                id={field.name}
                type={field.type}
                value={value}
                onChange={handleChange}
                placeholder={field.placeholder}
                required={field.required}
                disabled={disabled}
                className={cn(
                    "text-md",
                    disabled ? "bg-muted cursor-not-allowed opacity-50" : ""
                )}
                {...props}
            />
        </motion.div>
    );
};

export default AnimatedInput;
