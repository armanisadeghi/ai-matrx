import { useState, useCallback } from 'react';

export interface PdfOptimizeResult {
    optimizedFile: File;
    originalSize: number;
    compressedSize: number;
    compressionRatio: number;
    levelRequested: number | null;
    levelUsed: number | null;
    capSatisfied: boolean | null;
}

interface OptimizeOptions {
    /** Minimum compression tier 1..5 (default 2). Server may escalate
     *  above this when `maxSizeMB` forces it. */
    level?: number;
    /** Optional absolute upper bound on output size in MB. When set,
     *  the server walks tiers up from `level` until the output fits
     *  (or tier 5 is reached). */
    maxSizeMB?: number;
}

interface UsePdfOptimizeReturn {
    optimizePdf: (file: File, options?: OptimizeOptions | number) => Promise<PdfOptimizeResult | null>;
    isOptimizing: boolean;
    error: string | null;
    clearError: () => void;
}

export function usePdfOptimize(): UsePdfOptimizeReturn {
    const [isOptimizing, setIsOptimizing] = useState(false);
    const [error, setError] = useState<string | null>(null);

    const clearError = useCallback(() => setError(null), []);

    const optimizePdf = useCallback(async (
        file: File,
        options: OptimizeOptions | number = {},
    ): Promise<PdfOptimizeResult | null> => {
        // Back-compat: callers used to pass a bare number for level.
        const opts: OptimizeOptions =
            typeof options === 'number' ? { level: options } : options;
        const level = opts.level ?? 2;
        const maxSizeMB = opts.maxSizeMB;

        setError(null);
        setIsOptimizing(true);

        try {
            const formData = new FormData();
            formData.append('file', file);
            formData.append('level', String(level));
            if (typeof maxSizeMB === 'number' && maxSizeMB > 0) {
                formData.append('maxSizeMB', String(maxSizeMB));
            }

            const response = await fetch('/api/pdf/compress', {
                method: 'POST',
                body: formData,
            });

            if (!response.ok) {
                const data = await response.json().catch(() => ({ error: 'Compression failed' }));
                throw new Error(data.error || 'Compression failed');
            }

            const originalSize = parseInt(response.headers.get('X-Original-Size') || '0', 10);
            const compressedSize = parseInt(response.headers.get('X-Compressed-Size') || '0', 10);
            const compressionRatio = parseFloat(response.headers.get('X-Compression-Ratio') || '0');
            const levelRequestedHeader = response.headers.get('X-Compression-Level-Requested');
            const levelUsedHeader = response.headers.get('X-Compression-Level-Used');
            const capHeader = response.headers.get('X-Compression-Cap-Satisfied');

            const blob = await response.blob();
            const optimizedFile = new File([blob], file.name, { type: 'application/pdf' });

            return {
                optimizedFile,
                originalSize: originalSize || file.size,
                compressedSize: compressedSize || blob.size,
                compressionRatio,
                levelRequested: levelRequestedHeader ? Number(levelRequestedHeader) : null,
                levelUsed: levelUsedHeader ? Number(levelUsedHeader) : null,
                capSatisfied: capHeader === null || capHeader === '' ? null : capHeader === '1',
            };
        } catch (err) {
            const message = err instanceof Error ? err.message : 'PDF optimization failed';
            setError(message);
            return null;
        } finally {
            setIsOptimizing(false);
        }
    }, []);

    return { optimizePdf, isOptimizing, error, clearError };
}
