'use client';

import React, { useState, useEffect, Suspense } from 'react';
import { EntityKeys } from '@/types/entityTypes';
import { useEntity } from "@/lib/redux/entity/hooks/useEntity";
import SchemaSelect from "@/components/matrx/schema/ops/SchemaSelect";
import {MatrxTableLoading} from "@/components/matrx/LoadingComponents";
import MatrxTable from "@/app/(dev)/demos/tests/matrx-table/components/MatrxTable";

// Default entity key for initial hook call
const DEFAULT_ENTITY: EntityKeys = 'systemFunction';

const DeleteOperation = () => {
    const [selectedSchema, setSelectedSchema] = useState<EntityKeys>(DEFAULT_ENTITY);
    const entity = useEntity(selectedSchema);

    useEffect(() => {
        entity.fetchAll();
    }, [selectedSchema]);

    const handleDelete = (id: string | number) => {
        entity.deleteRecord(id as any);
    };

    return (
        <div className="space-y-4">
            <h2 className="text-2xl font-bold">Delete Operation</h2>
            <SchemaSelect onSchemaSelect={setSelectedSchema} selectedSchema={selectedSchema} />
            {entity?.loadingState.loading && <p>Loading...</p>}
            {entity?.error && <p className="text-red-500">Error: {entity.error.message}</p>}
            {entity?.currentPage && (
                <Suspense fallback={<MatrxTableLoading />}>
                    <MatrxTable
                        data={entity.currentPage}
                        actions={['delete']}
                        onAction={(actionName, rowData) => {
                            if (actionName === 'delete') {
                                handleDelete(rowData.id);
                            }
                        }}
                        truncateAt={50}
                    />
                </Suspense>
            )}
        </div>
    );
};

export default DeleteOperation;
