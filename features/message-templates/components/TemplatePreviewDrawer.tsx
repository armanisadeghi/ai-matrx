"use client";

import { useIsMobile } from "@/hooks/use-mobile";
import { ContentTemplateDB } from "@/features/content-templates/types/content-templates-db";
import {
    Dialog,
    DialogContent,
    DialogHeader,
    DialogTitle,
} from "@/components/ui/dialog";
import {
    Drawer,
    DrawerContent,
    DrawerTitle,
} from "@/components/ui/drawer";
import { Button } from "@/components/ui/button";
import { Copy, Pencil, Globe, Lock } from "lucide-react";

interface TemplatePreviewDrawerProps {
    template: ContentTemplateDB | null;
    isOpen: boolean;
    onClose: () => void;
    canEdit: boolean;
    onEdit: (template: ContentTemplateDB) => void;
    onCopyContent: (content: string) => void;
}

const ROLE_COLORS: Record<string, string> = {
    system: "text-purple-600 dark:text-purple-400",
    user: "text-blue-600 dark:text-blue-400",
    assistant: "text-green-600 dark:text-green-400",
    tool: "text-orange-600 dark:text-orange-400",
};

function PreviewContent({
    template,
    canEdit,
    onEdit,
    onCopyContent,
    onClose,
}: Omit<TemplatePreviewDrawerProps, "isOpen"> & { onClose: () => void }) {
    if (!template) return null;

    return (
        <div className="flex flex-col h-full">
            {/* Header */}
            <div className="flex items-start justify-between gap-2 px-4 pt-4 pb-3 border-b border-border flex-shrink-0">
                <div className="flex-1 min-w-0">
                    <p className="text-sm font-semibold">{template.label}</p>
                    <div className="flex items-center gap-2 mt-0.5">
                        <span className={`text-xs font-medium ${ROLE_COLORS[template.role ?? "user"] ?? ""}`}>
                            {template.role}
                        </span>
                        <span className="text-muted-foreground">·</span>
                        {template.is_public ? (
                            <span className="inline-flex items-center gap-0.5 text-xs text-green-600 dark:text-green-400">
                                <Globe className="w-3 h-3" />
                                Public
                            </span>
                        ) : (
                            <span className="inline-flex items-center gap-0.5 text-xs text-muted-foreground">
                                <Lock className="w-3 h-3" />
                                Private
                            </span>
                        )}
                    </div>
                </div>
                <Button
                    variant="ghost"
                    size="icon"
                    className="h-8 w-8 flex-shrink-0"
                    onClick={() => onCopyContent(template.content ?? "")}
                    title="Copy content"
                >
                    <Copy className="w-3.5 h-3.5" />
                </Button>
            </div>

            {/* Content area */}
            <div className="flex-1 overflow-y-auto overscroll-contain px-4 py-3">
                <pre className="text-sm text-foreground whitespace-pre-wrap font-mono leading-relaxed break-words">
                    {template.content || ""}
                </pre>
            </div>

            {/* Footer actions */}
            {canEdit && (
                <div className="flex-shrink-0 px-4 pb-4 pt-2 border-t border-border pb-safe">
                    <Button
                        className="w-full"
                        onClick={() => {
                            onClose();
                            onEdit(template);
                        }}
                    >
                        <Pencil className="w-4 h-4 mr-2" />
                        Edit
                    </Button>
                </div>
            )}
        </div>
    );
}

export function TemplatePreviewDrawer({
    template,
    isOpen,
    onClose,
    canEdit,
    onEdit,
    onCopyContent,
}: TemplatePreviewDrawerProps) {
    const isMobile = useIsMobile();

    const contentProps = { template, canEdit, onEdit, onCopyContent, onClose };

    if (isMobile) {
        return (
            <Drawer open={isOpen} onOpenChange={(open) => !open && onClose()}>
                <DrawerContent className="max-h-[90dvh] flex flex-col">
                    <DrawerTitle className="sr-only">Template Preview</DrawerTitle>
                    <PreviewContent {...contentProps} />
                </DrawerContent>
            </Drawer>
        );
    }

    return (
        <Dialog open={isOpen} onOpenChange={(open) => !open && onClose()}>
            <DialogContent className="max-w-2xl max-h-[85dvh] flex flex-col overflow-hidden p-0">
                <DialogHeader className="sr-only">
                    <DialogTitle>Template Preview</DialogTitle>
                </DialogHeader>
                <PreviewContent {...contentProps} />
            </DialogContent>
        </Dialog>
    );
}
