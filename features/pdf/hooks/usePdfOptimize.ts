/**
 * usePdfOptimize — PDF compression on the Python backend.
 *
 * Calls `POST /assets/pdf-compress/multipart` (matrx-utils v1.1.0) directly;
 * no Next.js hop. The previous proxy at `app/api/pdf/compress/route.ts`
 * was deleted in Phase 1 of the file-handling consolidation
 * (docs/FILE_HANDLING_CONSOLIDATION_PLAN.md).
 *
 * The endpoint returns either `data_url` (≤256 KB) or a 5-min ephemeral
 * `signed_url`; this hook materializes either into a `File` so consumers
 * see the same return shape as before.
 */
import { useState, useCallback } from 'react';
import {
    compressPdfMultipart,
    materializeAssetResult,
} from '@/features/files/api/assets';

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
        const maxSizeBytes =
            typeof opts.maxSizeMB === 'number' && opts.maxSizeMB > 0
                ? Math.floor(opts.maxSizeMB * 1024 * 1024)
                : undefined;

        setError(null);
        setIsOptimizing(true);

        try {
            const { data } = await compressPdfMultipart(file, { level, maxSizeBytes });
            const blob = await materializeAssetResult(data);
            const optimizedFile = new File([blob], file.name, { type: 'application/pdf' });

            // Tier metadata rides on the envelope (level_used may exceed the
            // requested tier when a size cap forces escalation; cap_satisfied
            // is null when no cap was sent).
            return {
                optimizedFile,
                originalSize: data.original_size || file.size,
                compressedSize: data.compressed_size || blob.size,
                compressionRatio: data.reduction_ratio,
                levelRequested: level,
                levelUsed: data.level_used ?? null,
                capSatisfied: data.cap_satisfied ?? null,
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
