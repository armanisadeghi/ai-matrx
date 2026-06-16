'use client';

import React, { useState } from 'react';
import { MoreHorizontal, LucideIcon } from 'lucide-react';
import { useIsMobile } from '@/hooks/use-mobile';
import IconButton from '@/components/official/IconButton';
import { MatrxDynamicPanelHost } from '@/components/matrx/resizable/MatrxDynamicPanelHost';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

export interface IconButtonConfig {
    /** Unique identifier for the button */
    id: string;
    /** Icon component (required for standard buttons) */
    icon?: LucideIcon;
    /** Tooltip text (required for standard buttons) */
    tooltip?: string;
    /** Label for mobile menu (defaults to tooltip) */
    mobileLabel?: string;
    /** Click handler */
    onClick?: (e?: React.MouseEvent<HTMLButtonElement>) => void;
    /** Mouse down handler (for preventing focus loss) */
    onMouseDown?: (e: React.MouseEvent) => void;
    /** Button variant */
    variant?: 'default' | 'destructive' | 'outline' | 'secondary' | 'ghost' | 'link';
    /** Custom className */
    className?: string;
    /** Icon className */
    iconClassName?: string;
    /** Whether the button is disabled */
    disabled?: boolean;
    /** Hide the button */
    hidden?: boolean;
    /** Custom component to render instead of button (e.g., Variable popover, TemplateSelector) */
    component?: React.ReactNode;
    /** Custom render function for full control (receives isMobile) */
    render?: (isMobile: boolean) => React.ReactNode;
    /** Tooltip side (default: 'top') */
    tooltipSide?: 'top' | 'right' | 'bottom' | 'left';
}

export interface ResponsiveIconButtonGroupProps {
    /** Array of button configurations */
    buttons: IconButtonConfig[];
    /** Custom className for the container */
    className?: string;
    /** Sheet title for mobile menu */
    sheetTitle?: string;
    /** Size for IconButtons */
    size?: 'xs' | 'sm' | 'md' | 'lg' | 'xl';
    /** Always show in mobile mode (for testing) */
    forceMobile?: boolean;
    /** Custom trigger button for mobile (replaces default "..." button) */
    mobileTrigger?: React.ReactNode;
    /** Tooltip side for all buttons (default: 'top') */
    tooltipSide?: 'top' | 'right' | 'bottom' | 'left';
}

export function ResponsiveIconButtonGroup({
    buttons,
    className,
    sheetTitle = 'Actions',
    size = 'sm',
    forceMobile = false,
    mobileTrigger,
    tooltipSide = 'top',
}: ResponsiveIconButtonGroupProps) {
    const isMobileDetected = useIsMobile();
    const isMobile = forceMobile || isMobileDetected;
    const [sheetOpen, setSheetOpen] = useState(false);

    // Filter out hidden buttons
    const visibleButtons = buttons.filter(button => !button.hidden);

    // Desktop mode: render all buttons in a row
    if (!isMobile) {
        return (
            <div className={cn('flex items-center gap-1', className)}>
                {visibleButtons.map((button) => {
                    // Custom render function takes precedence
                    if (button.render) {
                        return <React.Fragment key={button.id}>{button.render(false)}</React.Fragment>;
                    }

                    // Custom component (like Variable popover or TemplateSelector)
                    if (button.component) {
                        return <React.Fragment key={button.id}>{button.component}</React.Fragment>;
                    }

                    // Standard icon button
                    if (!button.icon) {
                        console.warn(`Button ${button.id} has no icon, component, or render function`);
                        return null;
                    }

                    return (
                        <IconButton
                            key={button.id}
                            icon={button.icon}
                            tooltip={button.tooltip}
                            size={size}
                            variant={button.variant || 'ghost'}
                            className={button.className}
                            iconClassName={button.iconClassName}
                            onClick={(e) => {
                                e?.stopPropagation();
                                button.onClick?.(e);
                            }}
                            onMouseDown={(e) => {
                                e.stopPropagation();
                                button.onMouseDown?.(e);
                            }}
                            disabled={button.disabled}
                            tooltipSide={button.tooltipSide || tooltipSide}
                        />
                    );
                })}
            </div>
        );
    }

    // Mobile mode: render "..." button that opens a sheet menu
    return (
        <>
            {mobileTrigger || (
                <IconButton
                    icon={MoreHorizontal}
                    tooltip="More actions"
                    size={size}
                    variant="ghost"
                    onClick={() => setSheetOpen(true)}
                    className={className}
                />
            )}

            <MatrxDynamicPanelHost
                open={sheetOpen}
                onOpenChange={setSheetOpen}
                title={sheetTitle}
                position="bottom"
                defaultSize={50}
                contentClassName="pb-8"
            >
                <div className="space-y-2 max-h-[60dvh] overflow-y-auto">
                        {visibleButtons.map((button) => {
                            // Custom render function for mobile
                            if (button.render) {
                                return (
                                    <div key={button.id} className="w-full" onClick={() => setSheetOpen(false)}>
                                        {button.render(true)}
                                    </div>
                                );
                            }

                            // Custom component in mobile (show as button if it has icon/tooltip, otherwise render as-is)
                            if (button.component) {
                                // If the button has an icon and label, render as a mobile button
                                if (button.icon && (button.mobileLabel || button.tooltip)) {
                                    const Icon = button.icon;
                                    const label = button.mobileLabel || button.tooltip;
                                    
                                    return (
                                        <div key={button.id} className="w-full" onClick={() => setSheetOpen(false)}>
                                            {button.component}
                                        </div>
                                    );
                                }
                                
                                // Otherwise render the component as-is
                                return (
                                    <div key={button.id} className="w-full flex justify-center py-1">
                                        {button.component}
                                    </div>
                                );
                            }

                            // Standard button for mobile
                            if (!button.icon || !button.tooltip) {
                                return null;
                            }

                            const Icon = button.icon;
                            const label = button.mobileLabel || button.tooltip;

                            return (
                                <Button
                                    key={button.id}
                                    variant="ghost"
                                    className={cn(
                                        'w-full h-14 flex items-center justify-start gap-4 text-base rounded-xl hover:bg-accent/50',
                                        button.className
                                    )}
                                    onClick={(e) => {
                                        e.stopPropagation();
                                        button.onClick?.(e);
                                        setSheetOpen(false);
                                    }}
                                    onMouseDown={(e) => {
                                        e.stopPropagation();
                                        button.onMouseDown?.(e);
                                    }}
                                    disabled={button.disabled}
                                >
                                    <Icon className={cn('w-5 h-5', button.iconClassName)} />
                                    <span className="flex-1 text-left">{label}</span>
                                </Button>
                            );
                        })}
                </div>
            </MatrxDynamicPanelHost>
        </>
    );
}

