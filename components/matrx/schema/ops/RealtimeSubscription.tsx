import React, {Suspense, useState} from "react";
import useDatabase from "@/lib/hooks/useDatabase";
import SchemaSelect from "@/components/matrx/schema/ops/SchemaSelect";
import { Button } from "@/components/ui/button";
import {MatrxTableLoading} from "@/components/matrx/LoadingComponents";
import MatrxTable from "@/app/(dev)/demos/tests/matrx-table/components/MatrxTable";

const RealtimeSubscription = () => {
    const [selectedSchema, setSelectedSchema] = useState<string | null>(null);
    const [subscribed, setSubscribed] = useState(false);
    const {data, subscribeToChanges, unsubscribeFromChanges} = useDatabase();

    const handleToggleSubscription = () => {
        if (selectedSchema) {
            if (subscribed) {
                unsubscribeFromChanges(selectedSchema);
                setSubscribed(false);
            } else {
                subscribeToChanges(selectedSchema);
                setSubscribed(true);
            }
        }
    };

    return (
        <div className="space-y-4">
            <SchemaSelect onSchemaSelect={setSelectedSchema} selectedSchema={selectedSchema}/>
            <Button onClick={handleToggleSubscription} disabled={!selectedSchema}>
                {subscribed ? 'Unsubscribe' : 'Subscribe'}
            </Button>
            {subscribed && data && (
                <Suspense fallback={<MatrxTableLoading/>}>
                    <MatrxTable
                        data={data}
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
