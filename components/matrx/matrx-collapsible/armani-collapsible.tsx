'use client';
import React, {useState} from 'react';
import { Button } from "@/components/ui/button";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import {ChevronDown, ChevronRight, Minimize2, Maximize2} from "lucide-react";
import {cn} from "@/lib/utils";

interface ArmaniCollapsibleProps {
    title?: string | React.ReactNode;
    children: React.ReactNode;
    level?: number;
    icon?: React.ReactNode;
    collapsibleToChip?: boolean;
    id?: string;
    defaultExpanded?: boolean;
    className?: string;
    triggerClassName?: string;
    contentClassName?: string;
    titleFontSize?: string;
}

export function ArmaniCollapsible(
    {
        title = 'See Details',
        children,
        level = 0,
        icon,
        collapsibleToChip = false,
        id,
        defaultExpanded = false,
        className,
        triggerClassName,
        contentClassName,
        titleFontSize = 'text-sm'
    }: ArmaniCollapsibleProps) {
    const [isChip, setIsChip] = useState(false);
    const [isSelecting, setIsSelecting] = useState(false);

    // Handle mouse events to detect text selection
    const handleMouseDown = () => {
        setIsSelecting(false);
    };

    const handleMouseMove = (e: React.MouseEvent) => {
        if (e.buttons === 1) { // Left mouse button is pressed during movement
            setIsSelecting(true);
        }
    };

    const handleClick = (e: React.MouseEvent) => {
        // Only trigger collapse/expand if user is not selecting text
        if (isSelecting || window.getSelection()?.toString()) {
            e.stopPropagation(); // Prevent triggering collapsible when text is selected
        }
    };

    if (isChip) {
        return (
            <Button
                variant="secondary"
                size="sm"
                className={cn("mr-2 mb-2 inline-flex items-center gap-2 select-text", className)}
                onClick={(e) => {
                    if (!isSelecting && !window.getSelection()?.toString()) {
                        setIsChip(false);
                    } else {
                        e.stopPropagation();
                    }
                }}
                onMouseDown={handleMouseDown}
                onMouseMove={handleMouseMove}
                key={`chip-${id}`}
            >
                <Maximize2 className="h-4 w-4 text-primary pointer-events-none"/>
                <span className={cn(titleFontSize, "select-text")}>{title}</span>
            </Button>
        );
    }

    return (
        <Collapsible
            className={cn("py-1", className)}
            key={`collapsible-${id}`}
            defaultOpen={defaultExpanded}
        >
            <CollapsibleTrigger
                className={cn(
                    "relative flex w-full items-center rounded-t-lg py-1 px-2 font-medium select-text",
                    titleFontSize,
                    level === 0
                    ? "hover:bg-accent/50 hover:shadow-sm"
                    : "before:absolute before:inset-0 before:-left-4 before:rounded-t-lg hover:before:bg-accent/50 hover:shadow-sm before:-z-10",
                    triggerClassName
                )}
                onMouseDown={handleMouseDown}
                onMouseMove={handleMouseMove}
                onClick={handleClick}
            >
                <div className="flex items-center gap-1 select-text">
                    {level > 0 && (
                        <div className="-ml-5 pointer-events-none">
                            {icon || <ChevronRight className="h-4 w-4"/>}
                        </div>
                    )}
                    <span className="select-text">{title}</span>
                </div>
                <div className="ml-auto flex items-center gap-2">
                    {level === 0 && collapsibleToChip && (
                        <div
                            role="button"
                            tabIndex={0}
                            onClick={(e) => {
                                e.stopPropagation();
                                if (!isSelecting && !window.getSelection()?.toString()) {
                                    setIsChip(true);
                                }
                            }}
                            onKeyDown={(e) => {
                                if (e.key === 'Enter' || e.key === ' ') {
                                    e.preventDefault();
                                    e.stopPropagation();
                                    setIsChip(true);
                                }
                            }}
                            className="p-1 hover:bg-accent/50 rounded-sm cursor-pointer"
                            aria-label="Minimize section"
                        >
                            <Minimize2 className="h-4 w-4 text-primary pointer-events-none"/>
                        </div>
                    )}
                    <ChevronDown
                        className="h-4 w-4 shrink-0 text-muted-foreground transition-transform duration-200 [data-state=open]:rotate-180 pointer-events-none"/>
                </div>
            </CollapsibleTrigger>
            <CollapsibleContent
                className={cn(
                    "overflow-hidden data-[state=open]:animate-slide-down data-[state=closed]:animate-slide-up select-text",
                    contentClassName
                )}
            >
                {children}
            </CollapsibleContent>
        </Collapsible>
    );
}

export default ArmaniCollapsible;