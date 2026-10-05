"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { Button } from "@/components/ui/button";
import { ToolUiIncidentViewer } from "@/features/tool-call-visualization/admin/ToolUiIncidentViewer";
import { pushAppHref } from "@/lib/deployment/navigate";
import { humanizeIdentifier } from "@ai-matrx/kit/text-case";

interface Props {
    toolId: string;
    toolName: string;
}

export function ToolIncidentsPage({ toolId, toolName }: Props) {
    const router = useRouter();
    const [isPending, startTransition] = useTransition();

    return (
        <div className="h-[calc(100dvh-var(--header-height))] flex flex-col overflow-hidden">
            {/* Header */}
            <div className="flex-shrink-0 flex items-center gap-3 px-6 py-3 border-b border-border">
                <Button
                    icon={<ArrowLeft />}
                    variant="quiet"
                    onClick={() => startTransition(() => pushAppHref(router, `/administration/agents/mcp-tools/${toolId}`))}
                    disabled={isPending}
                >
                    {humanizeIdentifier(toolName)}
                </Button>
                <span className="text-sm font-medium text-muted-foreground">/</span>
                <span className="text-sm font-medium">Incidents</span>
            </div>

            {/* Content */}
            <div className="flex-1 overflow-y-auto px-6 py-4">
                <ToolUiIncidentViewer toolName={toolName} />
            </div>
        </div>
    );
}
