// File: components/matrix/delete-dialog/index.tsx

import React from 'react';
import {Button} from '@/components/ui/button';
import {Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter} from "@/components/ui/dialog";

interface MatrixDeleteDialogProps {
    isOpen: boolean;
    onClose: () => void;
    onConfirm: () => void;
    item: Record<string, unknown> | null;
    fields: Record<string, {
        type: 'text' | 'textarea' | 'select';
        label: string;
        options?: { value: string; label: string }[]
    }>;
}

export const MatrixDeleteDialog: React.FC<MatrixDeleteDialogProps> = (
    {
        isOpen,
        onClose,
        onConfirm,
        item,
        fields
    }) => {
    return (
        <Dialog open={isOpen} onOpenChange={onClose}>
            <DialogContent>
                <DialogHeader>
                    <DialogTitle>Confirm Deletion</DialogTitle>
                </DialogHeader>
                <div>
                    Are you sure you want to delete this item?
                    {item && (
                        <div className="mt-2">
                            {Object.entries(fields).map(([key, config]) => {
                                const rawValue = item[key];
                                const displayValue =
                                    rawValue === null || rawValue === undefined
                                        ? ""
                                        : typeof rawValue === "string" || typeof rawValue === "number"
                                          ? rawValue
                                          : String(rawValue);
                                return (
                                    <p key={key}><strong>{config.label}:</strong> {displayValue}</p>
                                );
                            })}
                        </div>
                    )}
                </div>
                <DialogFooter>
                    <Button variant="outline" onClick={onClose}>
                        Cancel
                    </Button>
                    <Button variant="destructive" onClick={onConfirm}>
                        Delete
                    </Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    );
};
