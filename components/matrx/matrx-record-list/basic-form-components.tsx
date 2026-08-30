'use client';

import React from 'react';
import { cn } from '@/lib/utils';
import { ComponentSize } from '@/types/componentConfigTypes';
import { ProTextarea } from "@/components/official/ProTextarea";

interface BaseInputProps {
    value: string;
    onChange?: (value: string) => void;
    size?: ComponentSize;
    className?: string;
    disabled?: boolean;
}

export function MatrxBasicInput({ value, onChange, size = 'xs', className, disabled }: BaseInputProps) {
    return (
        <input
            type="text"
            value={value}
            onChange={e => onChange?.(e.target.value)}
            disabled={disabled}
            className={cn(
                "w-full px-2 py-1 bg-background border border-input rounded-sm",
                "focus:outline-none focus:ring-1 focus:ring-ring",
                size === 'xs' && "text-xs",
                size === 'sm' && "text-sm",
                size === 'md' && "text-base",
                size === 'lg' && "text-lg",
                size === 'xl' && "text-xl",
                className
            )}
        />
    );
}

export function MatrxBasicTextarea({ value, onChange, size = 'xs', className, disabled }: BaseInputProps) {
    return (
        <ProTextarea
            value={value}
            onChange={e => onChange?.(e.target.value)}
            disabled={disabled}
            rows={3}
            className={cn(
                "w-full px-2 py-1 bg-background border border-input rounded-sm resize-none",
                "focus:outline-none focus:ring-1 focus:ring-ring",
                size === 'xs' && "text-xs",
                size === 'sm' && "text-sm",
                size === 'md' && "text-base",
                size === 'lg' && "text-lg",
                size === 'xl' && "text-xl",
                className
            )}
        />
    );
}
