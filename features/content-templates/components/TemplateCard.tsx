"use client";

import { ContentTemplateDB } from "@/features/content-templates/types/content-templates-db";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { FileText, Globe, Lock } from "lucide-react";
import { ShareButton } from "@/features/sharing";
import { useAppSelector } from "@/lib/redux/hooks";
import { selectUserId } from "@/lib/redux/selectors/userSelectors";

interface TemplateCardProps {
    template: ContentTemplateDB;
    onClick: (template: ContentTemplateDB) => void;
    isDisabled?: boolean;
}

const ROLE_COLORS: Record<string, string> = {
    system: "bg-purple-500/10 text-purple-600 dark:text-purple-400 border-purple-500/20",
    user: "bg-blue-500/10 text-blue-600 dark:text-blue-400 border-blue-500/20",
    assistant: "bg-green-500/10 text-green-600 dark:text-green-400 border-green-500/20",
    tool: "bg-orange-500/10 text-orange-600 dark:text-orange-400 border-orange-500/20",
};

export function TemplateCard({ template, onClick, isDisabled }: TemplateCardProps) {
    const currentUserId = useAppSelector(selectUserId);
    const isOwner = Boolean(currentUserId && template.user_id === currentUserId);
    return (
        <Card
            onClick={() => !isDisabled && onClick(template)}
            className={`relative flex flex-col gap-2 p-3 border border-border transition-all duration-200 overflow-hidden ${
                isDisabled
                    ? "opacity-60 cursor-not-allowed"
                    : "hover:shadow-md hover:shadow-primary/10 hover:border-primary/30 cursor-pointer hover:scale-[1.01] group"
            }`}
        >
            {/* Top row: icon + label + visibility */}
            <div className="flex items-start gap-2 min-w-0">
                <div className="flex-shrink-0 w-6 h-6 rounded-md bg-primary/10 flex items-center justify-center mt-0.5">
                    <FileText className="w-3.5 h-3.5 text-primary" />
                </div>
                {isOwner && (
                    <div
                        className="absolute top-2 right-2 opacity-0 group-hover:opacity-100 transition-opacity"
                        onClick={(e) => e.stopPropagation()}
                    >
                        <ShareButton
                            resourceType="content_template"
                            resourceId={template.id}
                            resourceName={template.label ?? "Template"}
                            isOwner={true}
                            variant="ghost"
                            size="icon"
                            showStatus={false}
                        />
                    </div>
                )}
                <div className="flex-1 min-w-0">
                    <p className={`text-sm font-semibold leading-tight truncate transition-colors duration-200 ${!isDisabled && "group-hover:text-primary"}`}>
                        {template.label || "Untitled"}
                    </p>
                    <div className="flex items-center gap-1.5 mt-0.5">
                        <span className={`inline-flex items-center px-1.5 py-0 text-[10px] font-medium rounded border ${ROLE_COLORS[template.role ?? "user"] ?? ROLE_COLORS.user}`}>
                            {template.role}
                        </span>
                        {template.is_public ? (
                            <span className="inline-flex items-center gap-0.5 text-[10px] text-green-600 dark:text-green-400">
                                <Globe className="w-2.5 h-2.5" />
                                Public
                            </span>
                        ) : (
                            <span className="inline-flex items-center gap-0.5 text-[10px] text-muted-foreground">
                                <Lock className="w-2.5 h-2.5" />
                                Private
                            </span>
                        )}
                    </div>
                </div>
            </div>

            {/* Content preview */}
            {template.content && (
                <p className="text-xs text-muted-foreground line-clamp-2 leading-relaxed">
                    {template.content}
                </p>
            )}

            {/* Tags */}
            {template.tags && template.tags.length > 0 && (
                <div className="flex flex-wrap gap-1">
                    {template.tags.slice(0, 3).map((tag) => (
                        <Badge
                            key={tag}
                            variant="secondary"
                            className="text-[10px] px-1.5 py-0 h-4"
                        >
                            {tag}
                        </Badge>
                    ))}
                    {template.tags.length > 3 && (
                        <span className="text-[10px] text-muted-foreground self-center">
                            +{template.tags.length - 3}
                        </span>
                    )}
                </div>
            )}
        </Card>
    );
}
