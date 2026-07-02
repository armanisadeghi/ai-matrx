// components/matrx/AnimatedForm/AnimatedButton.tsx

'use client';
import React from "react";
import { motion, MotionProps } from "motion/react";
import { cn } from "@/styles/themes/utils"; // Import cn utility

type AnimatedButtonSize = "sm" | "default" | "lg";

const sizeClasses: Record<AnimatedButtonSize, string> = {
    sm: "px-3 py-1 text-sm",
    default: "px-4 py-2",
    lg: "px-6 py-3 text-lg",
};

const AnimatedButton: React.FC<
    React.ButtonHTMLAttributes<HTMLButtonElement> & MotionProps & { disabled?: boolean; size?: AnimatedButtonSize }
> = (
    {
        children,
        className,
        disabled = false, // Add disabled prop
        size = "default",
        ...props
    }) => (
    <motion.button
        whileHover={disabled ? undefined : { scale: 1.05 }} // Disable hover effect when disabled
        whileTap={disabled ? undefined : { scale: 0.95 }} // Disable tap effect when disabled
        disabled={disabled} // Apply disabled to button
        className={cn(
            "bg-primary text-primary-foreground rounded-md focus:outline-none focus:ring-2 focus:ring-primary focus:ring-opacity-50",
            sizeClasses[size],
            disabled ? "opacity-50 cursor-not-allowed" : "",
            className // Combine classNames
        )}
        {...props}
    >
        {children}
    </motion.button>
);

export default AnimatedButton;
