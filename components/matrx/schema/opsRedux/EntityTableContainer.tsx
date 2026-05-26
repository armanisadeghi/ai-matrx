// @ts-nocheck
// EntityTableContainer.tsx
'use client';

import React, { Suspense, useCallback, useState } from "react";
import { MatrxTableLoading } from "@/components/matrx/LoadingComponents";
import MatrxTable from "@/app/(dev)/demos/tests/matrx-table/components/MatrxTable";
import { useEntity } from "@/lib/redux/entity/hooks/useEntity";
import { EntityKeys } from "@/types/entityTypes";
import { FlexibleId } from "@/types/FlexibleId";

interface TableData {
    id?: FlexibleId;
    [key: string]: any;
}

interface EntityTableContainerProps {
    entityKey: EntityKeys;
}

const EntityTableContainer: React.FC<EntityTableContainerProps> = ({ entityKey }) => {
    const [page, setPage] = useState<number>(1);
    const [pageSize, setPageSize] = useState<number>(10);

    const {
        data,
        loading,
        error,
        refetch,
        totalCount
    } = useEntity({
        entityKey,
        page,
        pageSize
    });

    const handlePageChange = useCallback((newPage: number, newPageSize: number) => {
        setPage(newPage);
        setPageSize(newPageSize);
    }, []);

    const handleAction = useCallback((actionName: string, rowData: TableData) => {
        switch (actionName) {
            case 'view':
                console.log('Viewing row:', rowData);
                break;
            default:
                console.log(`Unhandled action ${actionName}:`, rowData);
        }
    }, []);

    if (loading) return <MatrxTableLoading />;

    if (error) {
        return (
            <div className="text-red-500 p-4 rounded bg-red-50">
                Error: {error}
            </div>
        );
    }

    return (
        <div className="space-y-4">
            {data && (
                <Suspense fallback={<MatrxTableLoading />}>
                    <MatrxTable
                        data={data}
                        actions={['view']}
                        onAction={handleAction}
                        truncateAt={50}
                        customModalContent={(rowData) => (
                            <div className="p-4">
                                <h3 className="text-lg font-bold mb-4">Row Details</h3>
                                <pre className="bg-gray-50 p-4 rounded overflow-auto">
                                    {JSON.stringify(rowData, null, 2)}
                                </pre>
                            </div>
                        )}
                        onPageChange={handlePageChange}
                    />

                    {totalCount !== undefined && (
                        <div className="text-sm text-gray-500">
                            Showing {((page - 1) * pageSize) + 1} to {Math.min(page * pageSize, totalCount)} of {totalCount} entries
                        </div>
                    )}
                </Suspense>
            )}
        </div>
    );
};

export default EntityTableContainer;
