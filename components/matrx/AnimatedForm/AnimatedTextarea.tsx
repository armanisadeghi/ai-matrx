// components/matrx/AnimatedForm/AnimatedTextarea.tsx

'use client';

import React from "react";
import { motion } from "motion/react";
import {cn} from "@/styles/themes/utils";
import {Textarea} from "@/components/ui/textarea";
import {Label} from "@/components/ui/label";
import { FormField } from "@/types/AnimatedFormTypes";

interface AnimatedTextareaProps extends Omit<React.TextareaHTMLAttributes<HTMLTextAreaElement>, 'onChange'> {
    field: FormField;
    value: string;
    onChange: (value: string) => void;
    className?: string;
}

const AnimatedTextarea: React.FC<AnimatedTextareaProps> = (
    {
        field,
        value,
        onChange,
        className,
        disabled = false,
        ...props
    }) => {
    const handleChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
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
            <Textarea
                id={field.name}
                value={value}
                onChange={handleChange}
                placeholder={field.placeholder}
                required={field.required}
                disabled={disabled}
                className={cn(
                    "text-md",
                    "min-h-[132px]",
                    disabled ? "cursor-not-allowed opacity-50 bg-muted" : ""
                )}
                {...props}
            />
        </motion.div>
    );
};

export default AnimatedTextarea;
