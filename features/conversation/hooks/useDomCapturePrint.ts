'use client';

/**
 * useDomCapturePrint (internalized)
 *
 * Hook for capturing a DOM subtree as a PDF using html2canvas + jsPDF.
 * Originally from features/chat/hooks/useDomCapturePrint.ts.
 *
 * The actual capture logic is lazy-loaded only when the user triggers
 * a print, so html2canvas and jsPDF are never in the initial bundle.
 */

import { useRef, useState, useCallback } from 'react';

export interface DomCaptureOptions {
    filename?: string;
    scale?: number;
    onProgress?: (page: number, total: number) => void;
}

export interface UseDomCapturePrintReturn {
    captureRef: React.RefObject<HTMLDivElement | null>;
    isCapturing: boolean;
    progress: number;
    captureAsPDF: (options?: DomCaptureOptions) => Promise<void>;
    error: string | null;
}

export function useDomCapturePrint(): UseDomCapturePrintReturn {
    const captureRef = useRef<HTMLDivElement>(null);
    const [isCapturing, setIsCapturing] = useState(false);
    const [progress, setProgress] = useState(0);
    const [error, setError] = useState<string | null>(null);

    const captureAsPDF = useCallback(async (options: DomCaptureOptions = {}) => {
        const el = captureRef.current;
        if (!el) {
            setError('Nothing to capture — captureRef is not attached to any element.');
            return;
        }

        setIsCapturing(true);
        setProgress(0);
        setError(null);

        try {
            // Lazy import the heavy capture utility
            const { captureToPDF } = await import('@/lib/block-print/dom-capture-print-utils');
            await captureToPDF(el, {
                filename: 'ai-response',
                scale: 2,
                ...options,
                onProgress: (page: number, total: number) => {
                    setProgress(Math.round((page / Math.max(total, 1)) * 100));
                    options.onProgress?.(page, total);
                },
            });
        } catch (err) {
            const msg = err instanceof Error ? err.message : 'PDF export failed';
            setError(msg);
        } finally {
            setIsCapturing(false);
            setProgress(0);
        }
    }, []);

    return { captureRef, isCapturing, progress, captureAsPDF, error };
}
