'use client';

import { AlertCircle, RotateCcw } from 'lucide-react';
import { Button } from '@/components/ui/button';

export default function ChatError({
    error,
    reset,
}: {
    error: Error & { digest?: string };
    reset: () => void;
}) {
    return (
        <div className="h-full w-full bg-textured flex flex-col items-center justify-center gap-4 px-4">
            <AlertCircle className="h-10 w-10 text-destructive" />
            <div className="text-center space-y-1">
                <h2 className="text-lg font-semibold text-foreground">Something went wrong</h2>
                <p className="text-sm text-muted-foreground max-w-md">
                    {error.message || 'An unexpected error occurred while loading the chat.'}
                </p>
            </div>
            <Button onClick={reset} variant="outline" size="sm" className="gap-2">
                <RotateCcw className="h-4 w-4" />
                Try again
            </Button>
        </div>
    );
}
