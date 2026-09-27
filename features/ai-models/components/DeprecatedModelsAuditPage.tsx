'use client';

import { ReadFailure } from "@/components/read-state/ReadFailure";
import { StaleDataNotice } from "@/components/official/stale-data/StaleDataNotice";
import React, { useEffect, useState, useCallback } from 'react';
import { RefreshCcw } from 'lucide-react';
import { aiModelService } from '../service';
import type { AiModel } from '../types';
import DeprecatedModelsAudit from './DeprecatedModelsAudit';

export default function DeprecatedModelsAuditPage() {
    const [models, setModels] = useState<AiModel[]>([]);
    const [isLoading, setIsLoading] = useState(true);
    // A failed read is said — never an audit over zero models (RC-B12 r13).
    const [loadError, setLoadError] = useState<unknown>(null);

    const loadModels = useCallback(async () => {
        setIsLoading(true);
        try {
            const fetched = await aiModelService.fetchAll();
            setModels(fetched);
            setLoadError(null);
        } catch (err) {
            console.error('Failed to load AI models', err);
            setLoadError(err ?? new Error('The AI models read failed'));
        } finally {
            setIsLoading(false);
        }
    }, []);

    useEffect(() => {
        loadModels();
    }, [loadModels]);

    if (isLoading) {
        return (
            <div className="flex-1 flex items-center justify-center text-muted-foreground text-sm gap-2">
                <RefreshCcw className="h-4 w-4 animate-spin" />
                Loading models…
            </div>
        );
    }

    if (loadError != null && models.length === 0) {
        return <ReadFailure error={loadError} what="the AI models" onRetry={() => void loadModels()} />;
    }

    return (
        <>
        {loadError != null && (
            <StaleDataNotice
                hasData
                what="the AI models"
                onRetry={() => void loadModels()}
                className="m-3"
            />
        )}
        <DeprecatedModelsAudit
            allModels={models}
            onClose={() => window.history.back()}
            onModelsChanged={loadModels}
        />
        </>
    );
}
