'use client';

import React, { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { Loader2, LucideIcon } from 'lucide-react';
import { Button, ButtonProps } from "@ai-matrx/design-system";
import { cn } from '@/lib/utils';

type ComponentSize = 'default' | 'xs' | 'sm' | 'md' | 'lg' | 'xl' | '2xl' | '3xl' | 'icon' | 'roundIcon';

const sizeToIconMap: Record<ComponentSize, number> = {
    'xs': 12,
    'sm': 14,
    'default': 16,
    'md': 18,
    'lg': 20,
    'xl': 22,
    '2xl': 24,
    '3xl': 28,
    'icon': 18,
    'roundIcon': 18
};

const sizeToTextMap: Record<ComponentSize, string> = {
    'xs': 'text-xs',
    'sm': 'text-sm',
    'default': 'text-base',
    'md': 'text-md',
    'lg': 'text-lg',
    'xl': 'text-xl',
    '2xl': 'text-2xl',
    '3xl': 'text-3xl',
    'icon': 'text-base',
    'roundIcon': 'text-base'
};

interface NavigationButtonProps extends Omit<React.ButtonHTMLAttributes<HTMLButtonElement>, 'onClick'> {
    variant?: ButtonProps['variant'];
    size?: ComponentSize;
    icon?: LucideIcon;
    href: string;
    loadingText?: string;
    spinnerClassName?: string;
    iconClassName?: string;
}

/**
 * NavigationButton - A button that provides visual feedback during navigation
 * 
 * Uses Next.js router with useTransition for smooth navigation with loading state.
 * Automatically shows a loading spinner during route transition.
 */
const NavigationButton = ({
    children,
    variant = 'default',
    size = 'default',
    icon: Icon,
    href,
    loadingText,
    className,
    spinnerClassName,
    iconClassName,
    disabled,
    ...props
}: NavigationButtonProps) => {
    const router = useRouter();
    const [isPending, startTransition] = useTransition();
    const [isNavigating, setIsNavigating] = useState(false);

    const iconSize = sizeToIconMap[size];
    const textSize = sizeToTextMap[size];
    const isIconOnly = size === 'icon' || size === 'roundIcon';
    const isLoading = isPending || isNavigating;

    const handleClick = (e: React.MouseEvent<HTMLButtonElement>) => {
        e.preventDefault();
        if (isLoading || disabled) return;

        setIsNavigating(true);
        startTransition(() => {
            router.push(href);
        });
    };

    const renderChildren = () => {
        if (isIconOnly) {
            const iconElement = React.Children.toArray(children).find(child =>
                React.isValidElement(child) &&
                typeof child.type !== 'string'
            );
            return iconElement || (Icon && <Icon className={cn(iconClassName)} size={iconSize} />);
        }

        return (
            <>
                {Icon && <Icon className={cn(iconClassName)} size={iconSize} />}
                {isLoading && loadingText ? loadingText : children}
            </>
        );
    };

    return (
        <Button
            variant={variant}
            onClick={handleClick}
            disabled={disabled || isLoading}
            className={cn(
                'flex items-center justify-center',
                {
                    'h-8 w-8 p-0': isIconOnly,
                    'rounded-full': size === 'roundIcon',
                    'gap-2': !isIconOnly,
                },
                textSize,
                className
            )}
            {...props}
        >
            {isLoading ? (
                <Loader2
                    className={cn('animate-spin', spinnerClassName)}
                    size={iconSize}
                />
            ) : renderChildren()}
        </Button>
    );
};

export default NavigationButton;

