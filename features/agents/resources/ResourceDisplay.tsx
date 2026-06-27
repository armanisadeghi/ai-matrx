"use client";

/**
 * Resource Display Components — render resources in chat messages.
 *
 * Canonical home: features/agents/resources/ResourceDisplay.tsx
 * Moved here from features/prompts/components/resource-display/ResourceDisplay.tsx
 * so the prompts feature can be deleted without breaking live agent/chat code.
 */

import React, { useState } from "react";
import {
    StickyNote,
    CheckSquare,
    Table2,
    Globe,
    File,
    FolderKanban,
    FileText,
    Youtube,
    Image,
    Mic,
    ChevronDown,
    ChevronRight,
    ExternalLink,
} from "lucide-react";
import { ParsedResource } from "./types";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

interface ResourceDisplayProps {
    resource: ParsedResource;
    className?: string;
}

function getResourceDisplayInfo(type: string) {
    switch (type) {
        case "note":
            return { icon: StickyNote, color: "text-orange-600 dark:text-orange-400", bgColor: "bg-orange-50 dark:bg-orange-950/20", borderColor: "border-orange-300 dark:border-orange-800", label: "Note" };
        case "task":
            return { icon: CheckSquare, color: "text-blue-600 dark:text-blue-400", bgColor: "bg-blue-50 dark:bg-blue-950/20", borderColor: "border-blue-300 dark:border-blue-800", label: "Task" };
        case "project":
            return { icon: FolderKanban, color: "text-purple-600 dark:text-purple-400", bgColor: "bg-purple-50 dark:bg-purple-950/20", borderColor: "border-purple-300 dark:border-purple-800", label: "Project" };
        case "table":
            return { icon: Table2, color: "text-green-600 dark:text-green-400", bgColor: "bg-green-50 dark:bg-green-950/20", borderColor: "border-green-300 dark:border-green-800", label: "Table" };
        case "file":
            return { icon: File, color: "text-gray-600 dark:text-gray-400", bgColor: "bg-gray-50 dark:bg-gray-950/20", borderColor: "border-gray-300 dark:border-gray-800", label: "File" };
        case "webpage":
            return { icon: Globe, color: "text-teal-600 dark:text-teal-400", bgColor: "bg-teal-50 dark:bg-teal-950/20", borderColor: "border-teal-300 dark:border-teal-800", label: "Webpage" };
        case "youtube":
            return { icon: Youtube, color: "text-red-600 dark:text-red-400", bgColor: "bg-red-50 dark:bg-red-950/20", borderColor: "border-red-300 dark:border-red-800", label: "YouTube" };
        case "image_url":
            return { icon: Image, color: "text-blue-600 dark:text-blue-400", bgColor: "bg-blue-50 dark:bg-blue-950/20", borderColor: "border-blue-300 dark:border-blue-800", label: "Image" };
        case "file_url":
            return { icon: FileText, color: "text-purple-600 dark:text-purple-400", bgColor: "bg-purple-50 dark:bg-purple-950/20", borderColor: "border-purple-300 dark:border-purple-800", label: "File URL" };
        case "audio":
            return { icon: Mic, color: "text-pink-600 dark:text-pink-400", bgColor: "bg-pink-50 dark:bg-pink-950/20", borderColor: "border-pink-300 dark:border-pink-800", label: "Audio" };
        default:
            return { icon: File, color: "text-gray-600 dark:text-gray-400", bgColor: "bg-gray-50 dark:bg-gray-950/20", borderColor: "border-gray-300 dark:border-gray-800", label: "Resource" };
    }
}

function formatContent(content: string, maxLength: number = 500): { display: string; isTruncated: boolean } {
    if (!content) {
        return { display: '', isTruncated: false };
    }
    const trimmed = content.trim();
    if (trimmed.length <= maxLength) {
        return { display: trimmed, isTruncated: false };
    }
    return { display: trimmed.substring(0, maxLength) + '...', isTruncated: true };
}

export function ResourceDisplay({ resource, className }: ResourceDisplayProps) {
    const [isExpanded, setIsExpanded] = useState(false);
    const displayInfo = getResourceDisplayInfo(resource.type);
    const Icon = displayInfo.icon;

    const title = resource.metadata.title
        || resource.metadata.label
        || resource.metadata.name
        || resource.metadata.filename
        || `${displayInfo.label} ${resource.id}`;

    const { display: contentDisplay, isTruncated } = formatContent(resource.content, isExpanded ? 10000 : 500);
    const hasContent = !!resource.content;
    const url = resource.metadata.url;

    return (
        <div className={cn(
            "rounded-lg border overflow-hidden my-2",
            displayInfo.bgColor,
            displayInfo.borderColor,
            className
        )}>
            <div
                className={cn(
                    "flex items-center gap-2 px-3 py-2",
                    hasContent && "cursor-pointer hover:bg-black/5 dark:hover:bg-white/5 transition-colors"
                )}
                onClick={() => hasContent && setIsExpanded(!isExpanded)}
            >
                <Icon className={cn("w-4 h-4 flex-shrink-0", displayInfo.color)} />
                <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                        <span className={cn("text-sm font-medium", displayInfo.color)}>
                            {title}
                        </span>
                        {resource.metadata.status && (
                            <Badge variant="outline" className="text-[10px] px-1 py-0 h-4">
                                {resource.metadata.status}
                            </Badge>
                        )}
                    </div>
                    {(resource.metadata.folder || resource.metadata.project) && (
                        <div className="text-xs text-muted-foreground">
                            {resource.metadata.folder && `In: ${resource.metadata.folder}`}
                            {resource.metadata.project && ` | Project`}
                        </div>
                    )}
                </div>
                {url && (
                    <Button
                        variant="ghost"
                        size="sm"
                        className="h-6 w-6 p-0"
                        onClick={(e) => {
                            e.stopPropagation();
                            window.open(url, '_blank');
                        }}
                    >
                        <ExternalLink className="w-3 h-3" />
                    </Button>
                )}
                {hasContent && (
                    <div className="flex-shrink-0">
                        {isExpanded ? (
                            <ChevronDown className="w-4 h-4 text-muted-foreground" />
                        ) : (
                            <ChevronRight className="w-4 h-4 text-muted-foreground" />
                        )}
                    </div>
                )}
            </div>
            {hasContent && isExpanded && (
                <div className="px-3 py-2 border-t border-current/10">
                    <div className="text-xs text-foreground/80 whitespace-pre-wrap break-words font-mono">
                        {contentDisplay}
                    </div>
                    {isTruncated && (
                        <button
                            onClick={(e) => {
                                e.stopPropagation();
                                setIsExpanded(false);
                            }}
                            className="text-xs text-muted-foreground hover:text-foreground mt-1 underline"
                        >
                            Show less
                        </button>
                    )}
                </div>
            )}
        </div>
    );
}

interface ResourcesContainerProps {
    resources: ParsedResource[];
    className?: string;
}

export function ResourcesContainer({ resources, className }: ResourcesContainerProps) {
    if (resources.length === 0) {
        return null;
    }
    return (
        <div className={cn("space-y-2", className)}>
            {resources.map((resource, index) => (
                <ResourceDisplay key={`${resource.type}-${resource.id}-${index}`} resource={resource} />
            ))}
        </div>
    );
}
