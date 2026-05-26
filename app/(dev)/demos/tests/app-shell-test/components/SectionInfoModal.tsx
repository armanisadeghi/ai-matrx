import React from 'react';
import {
    Dialog,
    DialogContent,
    DialogHeader,
    DialogTitle,
} from "@/components/ui/dialog";

interface SectionInfoModalProps {
    isOpen: boolean;
    onClose: () => void;
    section: {
        id: string;
        content: React.ReactNode;
        gridArea?: string;
    } | null;
    containerSize?: {
        width: number;
        height: number;
    };
}

const SectionInfoModal: React.FC<SectionInfoModalProps> = (
    {
        isOpen,
        onClose,
        section,
        containerSize,
    }) => {
    return (
        <Dialog open={isOpen} onOpenChange={onClose}>
            <DialogContent className="sm:max-w-xl">
                <DialogHeader>
                    <DialogTitle className="text-lg font-semibold text-foreground">
                        {section?.id}
                    </DialogTitle>
                </DialogHeader>
                <div className="mt-4 space-y-4">
                    <div className="bg-background border p-4 rounded-md">
                        {section?.content}
                    </div>
                    <div className="text-sm text-muted-foreground">
                        Grid Position: {section?.gridArea}
                    </div>
                    {containerSize && (
                        <div className="text-sm text-muted-foreground">
                            Container Size: {containerSize.width}px × {containerSize.height}px
                        </div>
                    )}
                </div>
            </DialogContent>
        </Dialog>
    );
};

export default SectionInfoModal;