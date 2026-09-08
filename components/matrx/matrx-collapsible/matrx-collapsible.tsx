// components/ui/custom-collapsible.tsx
import React from 'react';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import {ChevronDown} from "lucide-react";
import {cn} from "@/lib/utils";

interface MatrxCollapsibleProps {
    title: string;
    children: React.ReactNode;
    className?: string;
    triggerClassName?: string;
    contentClassName?: string;
    defaultOpen?: boolean;
    onOpenChange?: (open: boolean) => void;
}

export function MatrxCollapsible(
    {
        title,
        children,
        className,
        triggerClassName,
        contentClassName,
        defaultOpen,
        onOpenChange
    }: MatrxCollapsibleProps) {
    return (
        <Collapsible
            defaultOpen={defaultOpen}
            onOpenChange={onOpenChange}
            className={className}
        >
            <CollapsibleTrigger
                className={cn(
                    "flex w-full items-center justify-between rounded-t-lg p-4 text-sm font-medium hover:bg-accent/50 hover:shadow-sm",
                    triggerClassName
                )}
            >
                <span>{title}</span>
                <ChevronDown
                    className="h-4 w-4 shrink-0 text-muted-foreground transition-transform duration-200 [data-state=open]:rotate-180"
                />
            </CollapsibleTrigger>
            <CollapsibleContent
                className={cn(
                    // NO open/close animation, and there never was one: this used
                    // `animate-accordion-up/-down`, keyframes that interpolate to
                    // `--radix-accordion-content-height`. Radix Collapsible publishes
                    // `--radix-COLLAPSIBLE-content-height`, so the target height was
                    // always an undefined var. The dead classes went with the host
                    // keyframes (design-system 0.8.0); a real Collapsible transition
                    // belongs in the package, not back here.
                    "overflow-hidden text-sm",
                    contentClassName
                )}
            >
                {children}
            </CollapsibleContent>
        </Collapsible>
    );
}

export default MatrxCollapsible;
