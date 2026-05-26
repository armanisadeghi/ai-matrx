import React, { Suspense, useState } from "react";
import useDatabase from "@/lib/hooks/useDatabase";
import SchemaSelect from "@/components/matrx/schema/ops/SchemaSelect";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { MatrxTableLoading } from "@/components/matrx/LoadingComponents";
import MatrxTable from "@/app/(dev)/demos/tests/matrx-table/components/MatrxTable";
import { AutomationTableName } from "@/types/AutomationSchemaTypes";
import { EntityKeys } from "@/types/entityTypes";

const FetchOperations = () => {
    const [selectedSchema, setSelectedSchema] = useState<AutomationTableName | null>(null);
    const [id, setId] = useState('');
    const { data, loading, error, fetchOne, fetchAll, getForeignKeys, getInverseForeignKeys, getAllFields, fetchFk, fetchIfk, fetchM2m } = useDatabase();

    const handleSchemaSelect = (schemaName: EntityKeys) => {
        setSelectedSchema(schemaName as AutomationTableName);
    };

    const handleFetchOne = () => {
        if (selectedSchema && id) {
            fetchOne(selectedSchema, id);
        }
    };

    const handleFetchAll = () => {
        if (selectedSchema) {
            fetchAll(selectedSchema);
        }
    };

    // Fetch strategy-specific methods
    const handleFetchFk = async () => {
        if (selectedSchema && id) {
            const foreignKeys = getForeignKeys(selectedSchema);
            await fetchFk(selectedSchema, id, foreignKeys);
        }
    };

    const handleFetchIfk = async () => {
        if (selectedSchema && id) {
            const inverseForeignKeys = getInverseForeignKeys(selectedSchema);
            await fetchIfk(selectedSchema, id, inverseForeignKeys);
        }
    };

    const handleFetchM2M = async () => {
        if (selectedSchema && id) {
            const allFields = getAllFields(selectedSchema);
            await fetchM2m(selectedSchema, id, allFields);
        }
    };

    return (
        <div className="space-y-4">
            {/* Schema Selection */}
            <SchemaSelect onSchemaSelect={handleSchemaSelect} selectedSchema={selectedSchema} />

            {/* ID Input */}
            <Input
                placeholder="ID (for fetchOne)"
                value={id}
                onChange={(e) => setId(e.target.value)}
            />

            <div className="space-x-2">
                {/* Buttons for Fetch Operations */}
                <Button onClick={handleFetchOne} disabled={!selectedSchema || !id}>Fetch One</Button>
                <Button onClick={handleFetchAll} disabled={!selectedSchema}>Fetch All</Button>
                <Button onClick={handleFetchFk} disabled={!selectedSchema || !id}>Fetch FK</Button>
                <Button onClick={handleFetchIfk} disabled={!selectedSchema || !id}>Fetch IFK</Button>
                <Button onClick={handleFetchM2M} disabled={!selectedSchema || !id}>Fetch M2M</Button>
            </div>

            {/* Loading/Error States */}
            {loading && <p>Loading...</p>}
            {error && <p className="text-red-500">Error: {error.message}</p>}

            {/* Data Display */}
            {data && (
                <Suspense fallback={<MatrxTableLoading />}>
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

export default FetchOperations;
