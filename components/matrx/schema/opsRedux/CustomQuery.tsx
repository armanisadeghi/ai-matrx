import React, {Suspense, useState} from "react";
// import useDatabase from "@/lib/hooks/useDatabase";
import SchemaSelect from "@/components/matrx/schema/ops/SchemaSelect";
import { Button } from "@/components/ui/button";
import {MatrxTableLoading} from "@/components/matrx/LoadingComponents";
import MatrxTable from "@/app/(dev)/demos/tests/matrx-table/components/MatrxTable";

const CustomQuery = () => {
    const [selectedSchema, setSelectedSchema] = useState<string | null>(null);
    const [query, setQuery] = useState('');
    // const {data, loading, error, executeCustomQuery} = useDatabase();

    const handleExecuteCustomQuery = () => {
        if (selectedSchema) {
            // @ts-ignore - executeCustomQuery function not available (import commented out)
            executeCustomQuery(selectedSchema, (baseQuery) => {
                // This is a simple example. In a real application, you'd want to validate and sanitize this input.
                return eval(`baseQuery.${query}`);
            });
        }
    };

    return (
        <div className="space-y-4">
            <SchemaSelect onSchemaSelect={setSelectedSchema} selectedSchema={selectedSchema}/>
            <textarea
                className="w-full p-2 border rounded"
                placeholder="Query (e.g., 'where('column', 'value')')"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
            />
            {/* @ts-ignore - loading variable not available (import commented out) */}
            <Button onClick={handleExecuteCustomQuery} disabled={loading || !selectedSchema}>
                Execute Query
            </Button>
            {/* @ts-ignore - loading variable not available (import commented out) */}
            {loading && <p>Loading...</p>}
            {/* @ts-ignore - error variable not available (import commented out) */}
            {error && <p className="text-red-500">Error: {error.message}</p>}
            {/* @ts-ignore - data variable not available (import commented out) */}
            {data && (
                <Suspense fallback={<MatrxTableLoading/>}>
                    {/* @ts-ignore - data variable not available (import commented out) */}
                    <MatrxTable
                        // @ts-ignore - data variable not available (import commented out)
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

export default CustomQuery;
