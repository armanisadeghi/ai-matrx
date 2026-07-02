"use client";
import React, { useState, ReactNode } from "react";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { ChevronDown } from "lucide-react";

interface ChatCollapsibleWrapperProps {
    icon: ReactNode;
    title: ReactNode;
    controls?: ReactNode; // Optional controls that render outside the trigger
    initialOpen?: boolean;
    onStateChange?: (state: boolean) => void;
    children: ReactNode;
    className?: string;
    maxWidth?: string;
}

const ChatCollapsibleWrapper: React.FC<ChatCollapsibleWrapperProps> = ({
    icon,
    title,
    controls,
    initialOpen = true,
    onStateChange,
    children,
    className = "",
    maxWidth = "max-w-5xl",
}) => {
    const [isOpen, setIsOpen] = useState(initialOpen);

    const handleOpenChange = (open: boolean) => {
        setIsOpen(open);
        if (onStateChange) {
            onStateChange(open);
        }
    };

    return (
        <Collapsible
            open={isOpen}
            onOpenChange={handleOpenChange}
            className={`border-2 border-zinc-200 dark:border-zinc-700 rounded-3xl shadow-sm my-1 w-full ${maxWidth} mx-auto hover:bg-accent/50 hover:shadow-sm ${className}`}
        >
            <div className="relative flex w-full items-center justify-between rounded-t-lg hover:bg-accent/50 hover:shadow-sm">
                <CollapsibleTrigger className="flex-1 flex items-center gap-2 py-1 pl-4 pr-1 font-medium hover:bg-accent/50 hover:shadow-sm">
                    {icon}
                    {typeof title === 'string' ? <span>{title}</span> : title}
                    <ChevronDown
                        className={`h-4 w-4 shrink-0 text-muted-foreground transition-transform duration-200 ml-auto ${isOpen ? "rotate-180" : ""}`}
                    />
                </CollapsibleTrigger>
                {controls && (
                    <div className="flex items-center gap-1 pr-4" onClick={(e) => e.stopPropagation()}>
                        {controls}
                    </div>
                )}
            </div>
            <CollapsibleContent className="bg-transparent dark:bg-transparent overflow-hidden data-[state=open]:animate-slide-down data-[state=closed]:animate-slide-up border-none">
                <div className="relative p-0 border-none">
                    <div className="absolute top-0 left-8 right-8 h-px bg-zinc-200 dark:bg-zinc-700"></div>
                    {children}
                </div>
            </CollapsibleContent>
        </Collapsible>
    );
};

export default ChatCollapsibleWrapper;