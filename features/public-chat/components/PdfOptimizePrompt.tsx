'use client';

import React, { useState } from 'react';
import { Loader2, FileDown, X, Check } from 'lucide-react';
import { usePdfOptimize, PdfOptimizeResult } from '@/hooks/usePdfOptimize';

function formatSize(bytes: number): string {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

interface PdfOptimizePromptProps {
    file: File;
    onOptimized: (optimizedFile: File) => void;
    onDismiss: () => void;
    /** Size ceiling the caller enforces, in MB. The server escalates
     *  compression tiers until the output fits (or the max tier is hit). */
    maxSizeMB?: number;
}

export default function PdfOptimizePrompt({
    file,
    onOptimized,
    onDismiss,
    maxSizeMB = 10,
}: PdfOptimizePromptProps) {
    const { optimizePdf, isOptimizing, error } = usePdfOptimize();
    const [result, setResult] = useState<PdfOptimizeResult | null>(null);

    const handleOptimize = async () => {
        const optimizeResult = await optimizePdf(file, { maxSizeMB });
        if (optimizeResult) {
            setResult(optimizeResult);
        }
    };

    const handleConfirm = () => {
        if (result) {
            onOptimized(result.optimizedFile);
        }
    };

    // After optimization — show before/after comparison
    if (result) {
        const reductionPct = Math.round(result.compressionRatio * 100);
        // capSatisfied is the server's authoritative verdict (it knows
        // whether even the max tier fit); fall back to a size compare.
        const stillOverLimit =
            result.capSatisfied === false ||
            result.compressedSize > maxSizeMB * 1024 * 1024;

        return (
            <div className="flex flex-col gap-2 px-4 py-3 bg-muted/50 rounded-lg border border-border">
                <div className="flex items-center gap-2 text-sm">
                    <FileDown className="h-4 w-4 text-green-500 flex-shrink-0" />
                    <span className="text-muted-foreground">
                        {formatSize(result.originalSize)} → {formatSize(result.compressedSize)}
                        {reductionPct > 0 && (
                            <span className="text-green-500 ml-1">({reductionPct}% smaller)</span>
                        )}
                    </span>
                </div>
                {stillOverLimit ? (
                    <div className="text-sm text-amber-500">
                        Still over {maxSizeMB}MB after optimization. Try a smaller file.
                        <button onClick={onDismiss} className="ml-2 underline text-muted-foreground hover:text-foreground">
                            Dismiss
                        </button>
                    </div>
                ) : (
                    <div className="flex items-center gap-2">
                        <button
                            onClick={handleConfirm}
                            className="flex items-center gap-1.5 px-3 py-1.5 text-sm rounded-md bg-primary text-primary-foreground hover:bg-primary/90 transition-colors"
                        >
                            <Check className="h-3.5 w-3.5" />
                            Use Optimized
                        </button>
                        <button
                            onClick={onDismiss}
                            className="px-3 py-1.5 text-sm rounded-md text-muted-foreground hover:bg-accent transition-colors"
                        >
                            Cancel
                        </button>
                    </div>
                )}
            </div>
        );
    }

    // Initial state — offer to optimize
    return (
        <div className="flex items-center gap-2 mt-1">
            {isOptimizing ? (
                <div className="flex items-center gap-2 text-sm text-muted-foreground">
                    <Loader2 className="h-4 w-4 animate-spin" />
                    Optimizing PDF...
                </div>
            ) : (
                <>
                    <button
                        onClick={handleOptimize}
                        className="flex items-center gap-1.5 px-3 py-1.5 text-sm rounded-md bg-primary text-primary-foreground hover:bg-primary/90 transition-colors"
                    >
                        <FileDown className="h-3.5 w-3.5" />
                        Optimize PDF
                    </button>
                    <button
                        onClick={onDismiss}
                        className="p-1.5 rounded-md text-muted-foreground hover:bg-accent transition-colors"
                    >
                        <X className="h-4 w-4" />
                    </button>
                    {error && (
                        <span className="text-sm text-red-500">{error}</span>
                    )}
                </>
            )}
        </div>
    );
}
