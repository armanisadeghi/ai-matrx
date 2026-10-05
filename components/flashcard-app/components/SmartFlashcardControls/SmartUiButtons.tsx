import React from "react";
import {AArrowDown, AArrowUp} from "lucide-react";
import { Button } from "@/components/ui/button";
import {SmartButtonProps} from "./types";

export const FontSizeButton: React.FC<SmartButtonProps & { type: 'increase' | 'decrease' }> = (
    {
        flashcardHook,
        type,
        className
    }) => {
    const config = {
        decrease: {
            icon: AArrowDown,
            action: () => flashcardHook.setFontSize((prev) => Math.max(18, prev - 2)),
            title: 'Decrease font size'
        },
        increase: {
            icon: AArrowUp,
            action: () => flashcardHook.setFontSize((prev) => Math.min(36, prev + 2)),
            title: 'Increase font size'
        }
    }[type];
    const Icon = config.icon;

    return (
        <Button
            icon={<Icon/>} aria-label={config.title}
            onClick={config.action}
            variant="outline"
            className={`w-10 h-10 hover:scale-105 transition-transform bg-card ${className || ''}`}
            title={config.title}
        />
    );
};

export default FontSizeButton;
