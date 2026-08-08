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
import {
    Pencil,
    Eye,
    Copy,
    Trash2,
    Globe,
    Lock,
} from "lucide-react";

interface TemplateActionDrawerProps {
    template: ContentTemplateDB | null;
    isOpen: boolean;
    onClose: () => void;
    canEdit: boolean;
    onView: (template: ContentTemplateDB) => void;
    onEdit: (template: ContentTemplateDB) => void;
    onDuplicate: (template: ContentTemplateDB) => void;
    onDelete: (template: ContentTemplateDB) => void;
}

const ROLE_COLORS: Record<string, string> = {
    system: "bg-purple-500/10 text-purple-600 dark:text-purple-400 border-purple-500/20",
    user: "bg-blue-500/10 text-blue-600 dark:text-blue-400 border-blue-500/20",
    assistant: "bg-green-500/10 text-green-600 dark:text-green-400 border-green-500/20",
    tool: "bg-orange-500/10 text-orange-600 dark:text-orange-400 border-orange-500/20",
};

function TemplateActionContent({
    template,
    canEdit,
    onView,
    onEdit,
    onDuplicate,
    onDelete,
    onClose,
}: Omit<TemplateActionDrawerProps, "isOpen"> & { onClose: () => void }) {
    if (!template) return null;

    const handleAction = (fn: () => void) => {
        onClose();
        fn();
    };

    return (
        <div className="flex flex-col gap-0">
            {/* Template info block — generous padding, full content preview */}
            <div className="px-4 pt-4 pb-4 border-b border-border">
                <div className="flex items-center gap-2 mb-2">
                    <span className={`inline-flex items-center px-2 py-0.5 text-xs font-medium rounded-md border ${ROLE_COLORS[template.role ?? "user"] ?? ROLE_COLORS.user}`}>
                        {template.role}
                    </span>
                    {template.is_public ? (
                        <span className="inline-flex items-center gap-1 text-xs text-green-600 dark:text-green-400">
                            <Globe className="w-3 h-3" />
                            Public
                        </span>
                    ) : (
                        <span className="inline-flex items-center gap-1 text-xs text-muted-foreground">
                            <Lock className="w-3 h-3" />
                            Private
                        </span>
                    )}
                </div>
                <p className="text-sm font-semibold mb-3">{template.label}</p>
                {template.content && (
                    <div className="rounded-lg bg-muted/50 border border-border/50 p-3 max-h-48 overflow-y-auto overscroll-contain">
                        <p className="text-xs text-muted-foreground font-mono leading-relaxed whitespace-pre-wrap break-words">
                            {template.content}
                        </p>
                    </div>
                )}
                {template.tags && template.tags.length > 0 && (
                    <div className="flex flex-wrap gap-1 mt-2">
                        {template.tags.map((tag) => (
                            <span key={tag} className="inline-flex items-center px-1.5 py-0.5 rounded text-[10px] bg-secondary/50 text-secondary-foreground">
                                {tag}
                            </span>
                        ))}
                    </div>
                )}
            </div>

            {/* Actions */}
            <div className="flex flex-col p-2">
                <Button
                    variant="ghost"
                    className="justify-start gap-3 h-11 text-sm"
                    onClick={() => handleAction(() => onView(template))}
                >
                    <Eye className="w-4 h-4 text-muted-foreground" />
                    Open
                </Button>

                {canEdit && (
                    <Button
                        variant="ghost"
                        className="justify-start gap-3 h-11 text-sm"
                        onClick={() => handleAction(() => onEdit(template))}
                    >
                        <Pencil className="w-4 h-4 text-muted-foreground" />
                        Edit
                    </Button>
                )}

                <Button
                    variant="ghost"
                    className="justify-start gap-3 h-11 text-sm"
                    onClick={() => handleAction(() => onDuplicate(template))}
                >
                    <Copy className="w-4 h-4 text-muted-foreground" />
                    Duplicate
                </Button>

                {canEdit && (
                    <>
                        <div className="h-px bg-border mx-2 my-1" />
                        <Button
                            variant="ghost"
                            className="justify-start gap-3 h-11 text-sm text-destructive hover:text-destructive hover:bg-destructive/10"
                            onClick={() => handleAction(() => onDelete(template))}
                        >
                            <Trash2 className="w-4 h-4" />
                            Delete
                        </Button>
                    </>
                )}
            </div>
            {/* Safe area bottom pad */}
            <div className="h-2 pb-safe" />
        </div>
    );
}

export function TemplateActionDrawer({
    template,
    isOpen,
    onClose,
    canEdit,
    onView,
    onEdit,
    onDuplicate,
    onDelete,
}: TemplateActionDrawerProps) {
    const isMobile = useIsMobile();

    const contentProps = { template, canEdit, onView, onEdit, onDuplicate, onDelete, onClose };

    if (isMobile) {
        return (
            <Drawer open={isOpen} onOpenChange={(open) => !open && onClose()}>
                <DrawerContent className="max-h-[90dvh]">
                    <DrawerTitle className="sr-only">Template Actions</DrawerTitle>
                    <div className="overflow-y-auto overscroll-contain">
                        <TemplateActionContent {...contentProps} />
                    </div>
                </DrawerContent>
            </Drawer>
        );
    }

    return (
        <Dialog open={isOpen} onOpenChange={(open) => !open && onClose()}>
            <DialogContent className="max-w-md p-0 overflow-hidden">
                <DialogHeader className="sr-only">
                    <DialogTitle>Template Actions</DialogTitle>
                </DialogHeader>
                <TemplateActionContent {...contentProps} />
            </DialogContent>
        </Dialog>
    );
}
