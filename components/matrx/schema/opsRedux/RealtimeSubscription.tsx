'use client';

import React, {Suspense, useState, useEffect} from "react";
import { EntityKeys } from '@/types/entityTypes';
import { useEntity } from "@/lib/redux/entity/hooks/useEntity";
import SchemaSelect from "@/components/matrx/schema/ops/SchemaSelect";
import { Button } from "@/components/ui/button";
import {MatrxTableLoading} from "@/components/matrx/LoadingComponents";
import MatrxTable from "@/app/(dev)/demos/tests/matrx-table/components/MatrxTable";

// Default entity key for initial hook call
const DEFAULT_ENTITY: EntityKeys = 'systemFunction';

const RealtimeSubscription = () => {
    const [selectedSchema, setSelectedSchema] = useState<EntityKeys>(DEFAULT_ENTITY);
    const [subscribed, setSubscribed] = useState(false);
    const entity = useEntity(selectedSchema);

    useEffect(() => {
        if (subscribed && selectedSchema) {
            entity.fetchAll();
        }
    }, [subscribed, selectedSchema]);

    const handleToggleSubscription = () => {
        if (selectedSchema) {
            if (subscribed) {
                setSubscribed(false);
            } else {
                setSubscribed(true);
                entity.fetchAll();
            }
        }
    };

    return (
        <div className="space-y-4">
            <SchemaSelect onSchemaSelect={setSelectedSchema} selectedSchema={selectedSchema}/>
            <Button onClick={handleToggleSubscription} disabled={!selectedSchema}>
                {subscribed ? 'Unsubscribe' : 'Subscribe'}
            </Button>
            {entity?.loadingState.loading && <p>Loading...</p>}
            {entity?.error && <p className="text-red-500">Error: {entity.error.message}</p>}
            {subscribed && entity?.currentPage && (
                <Suspense fallback={<MatrxTableLoading/>}>
                    <MatrxTable
                        data={entity.currentPage}
                        actions={['view']}
                        onAction={(actionName, rowData) => console.log(actionName, rowData)}
                        truncateAt={50}
                        customModalContent={(rowData) => (
                            <pre>{JSON.stringify(rowData, null, 2)}</pre>
                        )}
                    />
                </Suspense>
            )}
        </div>
    );
};

export default RealtimeSubscription;
