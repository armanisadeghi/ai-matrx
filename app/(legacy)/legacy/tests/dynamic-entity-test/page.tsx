'use client';

import React, {useCallback, useEffect, useState, useMemo} from 'react';
import { createEntitySelectors } from "@/lib/redux/entity/selectors";
import { getEntitySlice } from "@/lib/redux/entity/entitySlice";
import {useAppDispatch, useAppSelector} from "@/lib/redux/hooks";
import {EntityKeys} from "@/types/entityTypes";
import MatrxTable from "@/app/(dev)/demos/tests/matrx-table/components/MatrxTable";

const entityKey: EntityKeys = 'registeredFunction';

const TestEntityTable: React.FC = () => {
    const dispatch = useAppDispatch();
    const [page, setPage] = useState(1);
    const [pageSize, setPageSize] = useState(10);
    const [shouldFetch, setShouldFetch] = useState(true);

    // Create selectors and actions
    const selectors = useMemo(() => createEntitySelectors(entityKey), []);
    const actions = useMemo(() => getEntitySlice(entityKey).actions, []);

    const records = useAppSelector(selectors.selectAllRecords);
    const loadingState = useAppSelector(selectors.selectLoadingState);
    const error = useAppSelector(selectors.selectErrorState);
    const paginationInfo = useAppSelector(selectors.selectPaginationInfo);
    const internalLoading = useAppSelector(selectors.selectIsInternalLoading);

    // Convert records map to array
    const data = useMemo(() => {
        return Object.values(records);
    }, [records]);

    const loading = loadingState?.loading ?? false;
    const totalCount = paginationInfo?.totalCount ?? 0;
    const initialized = !internalLoading;

    // Fetch effect
    useEffect(() => {
        if (shouldFetch) {
            dispatch(actions.fetchRecords({ page, pageSize }));
            setShouldFetch(false);
        }
    }, [dispatch, page, pageSize, shouldFetch, actions]);

    const handlePageChange = useCallback((newPage: number, newPageSize?: number) => {
        console.log('Page changed to:', newPage);
        setPage(newPage);
        if (newPageSize) {
            setPageSize(newPageSize);
        }
        setShouldFetch(true);
    }, []);

    return (
        <div className="p-4 space-y-4">
            <h1 className="text-xl font-bold">Test Entity Table</h1>

            {loading && <div>Loading...</div>}

            {error && (
                <div className="text-destructive p-4 rounded">
                    Error: {error.message || String(error)}
                </div>
            )}

            {!loading && data && data.length > 0 && (
                <div className="space-y-4">
                    <MatrxTable
                        data={data}
                        actions={['view']}
                        onAction={(action, row) => console.log(action, row)}
                        truncateAt={50}
                        onPageChange={handlePageChange}
                    />

                    {totalCount !== undefined && (
                        <div className="text-muted-foreground text-sm">
                            Showing {((page - 1) * pageSize) + 1} to {Math.min(page * pageSize, totalCount)} of {totalCount} entries
                        </div>
                    )}
                </div>
            )}

            <pre className="mt-4 p-4 bg-background rounded border">
                {JSON.stringify({
                    page,
                    pageSize,
                    initialized,
                    totalCount,
                    dataLength: data.length,
                    loading,
                    error: error ? (error.message || String(error)) : null,
                    shouldFetch
                }, null, 2)}
            </pre>
        </div>
    );
};

export default TestEntityTable;
