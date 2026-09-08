// components/matrx/matrx-collapsible.tsx
import React from 'react';
import {Card} from '@/components/ui/card';
import {
    Collapsible,
    CollapsibleContent,
    CollapsibleTrigger,
} from "@/components/ui/collapsible";
import {ChevronDown, Loader2, AlertCircle} from 'lucide-react';
import {cn} from "@/lib/utils";

interface EnhancedMatrxCollapsibleProps {
    title: string | React.ReactNode;
    children: React.ReactNode;
    className?: string;
    contentClassName?: string;
    headerClassName?: string;
    defaultOpen?: boolean;
    disabled?: boolean;
    loading?: boolean;
    error?: boolean;
    onOpenChange?: (isOpen: boolean) => void;
    rightContent?: React.ReactNode;
    useCard?: boolean;
}

export function EnhancedMatrxCollapsible(
    {
        title,
        children,
        className = '',
        contentClassName = '',
        headerClassName = '',
        defaultOpen = true,
        disabled = false,
        loading = false,
        error = false,
        onOpenChange,
        rightContent,
        useCard = true
    }: EnhancedMatrxCollapsibleProps) {
    const content = (
        <Collapsible defaultOpen={defaultOpen} onOpenChange={onOpenChange}>
            <CollapsibleTrigger
                disabled={disabled}
                className="flex w-full items-center justify-between rounded-t-lg p-4 text-sm font-medium hover:bg-accent/50 hover:shadow-sm"
            >
                <span className="text-sm font-semibold">{title}</span>
                <div className="flex items-center gap-2">
                    {loading && <Loader2 className="h-3 w-3 animate-spin text-blue-500 dark:text-blue-400"/>}
                    {error && <AlertCircle className="h-3 w-3 text-red-500 dark:text-red-400"/>}
                    {rightContent}
                    <ChevronDown
                        className="h-4 w-4 shrink-0 text-muted-foreground transition-transform duration-200 [data-state=open]:rotate-180"/>
                </div>
            </CollapsibleTrigger>
            <CollapsibleContent
                // Animates from the package as of design-system 0.9.0, same story as
                // matrx-collapsible.tsx: the old `animate-accordion-*` classes were
                // keyed off `--radix-accordion-content-height` on a COLLAPSIBLE panel,
                // so they never animated once. `.matrx-collapsible-content` is applied
                // by default now — no `animate-*` class belongs here.
                className="text-sm">
                <div className="space-y-3 p-4">
                    {children}
                </div>
            </CollapsibleContent>
        </Collapsible>
    );

    if (useCard) {
        return (
            <Card className={cn("w-full bg-card", className)}>
                {content}
            </Card>
        );
    }

    return content;
}

export default EnhancedMatrxCollapsible;
