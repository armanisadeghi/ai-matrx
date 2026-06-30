'use client';

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { useIsMobile } from '@/hooks/use-mobile';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Drawer, DrawerContent, DrawerTitle } from '@/components/ui/drawer';
import { useDocumentVersions } from '../../hooks/useResearchState';
import type { ResearchDocument } from '../../types';

interface VersionHistoryProps {
    open: boolean;
    onOpenChange: (open: boolean) => void;
    topicId: string;
    currentVersion: number;
    onCompare: (oldDoc: ResearchDocument, newDoc: ResearchDocument) => void;
}

export function VersionHistory({ open, onOpenChange, topicId, currentVersion, onCompare }: VersionHistoryProps) {
    const isMobile = useIsMobile();
    const { data: versions } = useDocumentVersions(topicId);

    const versionList = versions ?? [];

    const content = (
        <div className="space-y-2 p-4">
            {versionList.length === 0 && (
                <p className="text-sm text-muted-foreground text-center py-4">No version history available.</p>
            )}
            {versionList.map((doc, i) => (
                <div key={doc.id} className="flex items-center justify-between rounded-lg border border-border p-3">
                    <div>
                        <div className="flex items-center gap-2">
                            <span className="text-sm font-medium">Version {doc.version}</span>
                            {doc.version === currentVersion && (
                                <Badge variant="default" className="text-[10px]">Current</Badge>
                            )}
                        </div>
                        <span className="text-xs text-muted-foreground">
                            {doc.created_at
                                ? new Date(doc.created_at).toLocaleString()
                                : "Unknown date"}
                        </span>
                    </div>
                    {i < versionList.length - 1 && (
                        <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => onCompare(versionList[i + 1], doc)}
                            className="text-xs"
                        >
                            Compare
                        </Button>
                    )}
                </div>
            ))}
        </div>
    );

    if (isMobile) {
        return (
            <Drawer open={open} onOpenChange={onOpenChange}>
                <DrawerContent className="max-h-[85dvh]">
                    <DrawerTitle className="px-4 pt-4 text-base font-semibold">Version History</DrawerTitle>
                    <div className="overflow-y-auto overscroll-contain pb-safe">
                        {content}
                    </div>
                </DrawerContent>
            </Drawer>
        );
    }

    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent className="max-w-md max-h-[90dvh] overflow-hidden flex flex-col">
                <DialogHeader>
                    <DialogTitle>Version History</DialogTitle>
                </DialogHeader>
                <div className="flex-1 overflow-y-auto">
                    {content}
                </div>
            </DialogContent>
        </Dialog>
    );
}
