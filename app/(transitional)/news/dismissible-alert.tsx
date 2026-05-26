// app/news/dismissible-alert.tsx
'use client';

import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { X } from 'lucide-react';

interface DismissibleAlertProps {
    sourceName: string;
    title: string;
    url: string;
    index: number;
}

export function DismissibleAlert({ sourceName, title, url, index }: DismissibleAlertProps) {
    const handleDismiss = () => {
        const alert = document.getElementById(`headline-${index}`);
        if (alert) alert.remove();
    };

    return (
        <Alert id={`headline-${index}`} className="relative">
            <AlertTitle className="pr-8">{sourceName}</AlertTitle>
            <AlertDescription className="pr-8">
                <a
                    href={url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="hover:underline"
                >
                    {title}
                </a>
            </AlertDescription>
            <Button
                variant="ghost"
                size="icon"
                className="absolute right-2 top-2"
                onClick={handleDismiss}
            >
                <X className="h-4 w-4" />
            </Button>
        </Alert>
    );
}

