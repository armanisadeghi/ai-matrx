'use client';

import { useState, useCallback } from 'react';
import { AsyncResult } from '@/lib/idb/store-manager';
import { PublicStoreManager } from '@/lib/idb/store-interface';

export function useIDB<T extends object>(store: PublicStoreManager<T>) {
    const [loadingOps, setLoadingOps] = useState(new Set<string>());

    const withLoading = useCallback(<T,>(
        opId: string,
        operation: () => AsyncResult<T>
    ): AsyncResult<T> => {
        setLoadingOps(prev => new Set(prev).add(opId));
        
        return operation().finally(() => {
            setLoadingOps(prev => {
                const next = new Set(prev);
                next.delete(opId);
                return next;
            });
        }) as AsyncResult<T>;
    }, []);

    const isLoading = useCallback((opId?: string) => {
        return opId ? loadingOps.has(opId) : loadingOps.size > 0;
    }, [loadingOps]);

    return {
        isLoading,
        add: useCallback((
            storeName: string,
            data: T
        ): AsyncResult<string> => {
            return withLoading<string>(`add-${storeName}`, () =>
                store.addItem(storeName, data)
            );
        }, [withLoading, store]),

        get: useCallback((
            storeName: string,
            id: string
        ): AsyncResult<T> => {
            return withLoading<T>(`get-${storeName}-${id}`, () =>
                store.getItem(storeName, id)
            );
        }, [withLoading, store]),

        getAll: useCallback((
            storeName: string
        ): AsyncResult<T[]> => {
            return withLoading<T[]>(`getAll-${storeName}`, () =>
                store.getAllItems(storeName)
            );
        }, [withLoading, store]),

        update: useCallback(<U extends object>(
            storeName: string,
            id: number,
            data: Partial<U>
        ): AsyncResult<boolean> => {
            return withLoading<boolean>(`update-${storeName}-${id}`, () =>
                store.updateItem<U>(storeName, id, data)
            );
        }, [withLoading, store]),

        remove: useCallback((
            storeName: string,
            id: number
        ): AsyncResult<boolean> => {
            return withLoading<boolean>(`delete-${storeName}-${id}`, () =>
                store.deleteItem(storeName, id)
            );
        }, [withLoading, store]),

        query: useCallback(<T,>(
            storeName: string,
            indexName: string,
            queryKey: IDBValidKey | IDBKeyRange
        ): AsyncResult<T[]> => {
            return withLoading<T[]>(`query-${storeName}-${indexName}`, () =>
                store.queryItems<T>(storeName, indexName, queryKey)
            );
        }, [withLoading, store])
    };
}