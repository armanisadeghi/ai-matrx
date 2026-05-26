// @ts-nocheck
'use client';

import React, { Suspense, useCallback, useState } from "react";
import SchemaSelect from "./SchemaSelect";
import { MatrxTableLoading } from "@/components/matrx/LoadingComponents";
import MatrxTable from "@/app/(dev)/demos/tests/matrx-table/components/MatrxTable";
import { useEntity } from "@/lib/redux/entity/hooks/useEntity";
import { EntityKeys } from "@/types/entityTypes";
import {TableData} from "@/types/tableTypes";


export default function PaginatedFetchSaga() {
    const [selectedSchema, setSelectedSchema] = useState<EntityKeys | null>(null);
    const [page, setPage] = useState<number>(1);
    const [pageSize, setPageSize] = useState<number>(10);

    // Only initialize useEntity when we have a schema selected
    const {
        data,
        loading,
        error,
        refetch,
        totalCount,
        setSelectedItem
    } = selectedSchema ? useEntity({
        entityKey: selectedSchema,
        page,
        pageSize
    }) : {
        data: null,
        loading: false,
        error: null,
        refetch: () => {},
        totalCount: 0,
        setSelectedItem: () => {}
    };

    const handleSchemaSelect = useCallback((selectedEntity: {
        entityKey: EntityKeys;
        pretty: string
    }) => {
        setSelectedSchema(selectedEntity.entityKey);
        setPage(1); // Reset pagination
    }, []);

    const handlePageChange = useCallback((newPage: number, newPageSize: number) => {
        setPage(newPage);
        setPageSize(newPageSize);
    }, []);

    const handleAction = useCallback((actionName: string, rowData: TableData) => {
        switch (actionName) {
            case 'view':
                setSelectedItem(rowData);
                break;
            case 'edit':
                console.log('Edit:', rowData);
                break;
            case 'delete':
                console.log('Delete:', rowData);
                break;
            default:
                console.log(`Action ${actionName}:`, rowData);
        }
    }, [setSelectedItem]);

    return (
        <div className="space-y-4 p-4">
            <div className="space-y-2">
                <SchemaSelect
                    onSchemaSelect={handleSchemaSelect}
                    onSchemaFetched={() => {}}
                    selectedSchema={selectedSchema}
                />
            </div>

            {loading && <MatrxTableLoading />}

            {error && (
                <div className="text-red-500 p-4 rounded bg-red-50">
                    Error: {error}
                </div>
            )}

            {selectedSchema && !loading && data && (
                <Suspense fallback={<MatrxTableLoading />}>
                    <MatrxTable
                        data={data}
                        actions={['view', 'edit', 'delete']}
                        onAction={handleAction}
                        truncateAt={50}
                        customModalContent={(rowData) => (
                            <div className="p-4">
                                <h3 className="text-lg font-bold mb-4">Row Details</h3>
                                <pre className="p-4 rounded overflow-auto">
                                    {JSON.stringify(rowData, null, 2)}
                                </pre>
                            </div>
                        )}
                        onPageChange={handlePageChange}
                        className="w-full"
                    />
                </Suspense>
            )}
        </div>
    );
}
