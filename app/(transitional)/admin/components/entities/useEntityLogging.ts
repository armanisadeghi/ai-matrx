import { useCallback, useEffect, useState } from 'react';
import { EntityKeys } from '@/types/entityTypes';

type ErrorLog = {
    timestamp: string;
    message: string;
    details?: any;
};

export const useEntityLogging = <TEntity extends EntityKeys>(entity: any) => {
    const [errorLog, setErrorLog] = useState<ErrorLog[]>([]);

    // Log an error to the log state
    const logError = useCallback((error: any) => {
        setErrorLog((prev) => [
            {
                timestamp: new Date().toISOString(),
                message: error.message || 'An unknown error occurred',
                details: error,
            },
            ...prev,
        ]);
    }, []);

    // Effect to automatically log entity error states
    useEffect(() => {
        if (entity.error) {
            logError(entity.error);
        }
    }, [entity.error, logError]);

    // Clear the error log
    const clearErrorLog = useCallback(() => {
        setErrorLog([]);
    }, []);

    return {
        errorLog,
        logError,
        clearErrorLog,
    };
};
