import React from 'react';
import {
    AlertDialog,
    AlertDialogAction,
    AlertDialogCancel,
    AlertDialogContent,
    AlertDialogDescription,
    AlertDialogFooter,
    AlertDialogHeader,
    AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { cn } from '@/utils/cn';

interface ConfirmationDialogProps {
    open: boolean;
    onOpenChange: (open: boolean) => void;
    title: string;
    children: React.ReactNode;
    onConfirm: () => void;
    onCancel: () => void;
    confirmText?: string;
    cancelText?: string;
    intent?: 'default' | 'destructive';
}

const ConfirmationDialog = ({
    open,
    onOpenChange,
    title,
    children,
    onConfirm,
    onCancel,
    confirmText = 'Confirm',
    cancelText = 'Cancel',
    intent = 'default',
}: ConfirmationDialogProps) => {
    return (
        <AlertDialog
            open={open}
            onOpenChange={onOpenChange}
        >
            <AlertDialogContent className='max-h-dvh flex flex-col'>
                <AlertDialogHeader className='flex-none'>
                    <AlertDialogTitle>{title}</AlertDialogTitle>
                    <AlertDialogDescription className='sr-only'>Please review the changes before confirming</AlertDialogDescription>
                </AlertDialogHeader>

                <div className='flex-1 min-h-0 overflow-y-auto'>
                    <div className='text-sm text-muted-foreground'>{children}</div>
                </div>

                <AlertDialogFooter className='flex-none mt-3'>
                    <AlertDialogCancel onClick={onCancel}>{cancelText}</AlertDialogCancel>
                    <AlertDialogAction
                        onClick={onConfirm}
                        className={cn(intent === 'destructive' && 'bg-destructive hover:bg-destructive/90')}
                    >
                        {confirmText}
                    </AlertDialogAction>
                </AlertDialogFooter>
            </AlertDialogContent>
        </AlertDialog>
    );
};

export default ConfirmationDialog;
