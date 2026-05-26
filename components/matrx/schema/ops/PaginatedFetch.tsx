import React, {Suspense, useEffect, useState} from "react";
import useDatabase from "@/lib/hooks/useDatabase";
import SchemaSelect from "@/components/matrx/schema/ops/SchemaSelect";
import {MatrxTableLoading} from "@/components/matrx/LoadingComponents";
import MatrxTable from "@/app/(dev)/demos/tests/matrx-table/components/MatrxTable";

const PaginatedFetch = () => {
    const [selectedSchema, setSelectedSchema] = useState<string | null>(null);
    const {data, loading, error, fetchPaginated} = useDatabase();

    const handlePageChange = (page: number, pageSize: number) => {
        if (selectedSchema) {
            fetchPaginated(selectedSchema, {limit: pageSize, offset: (page - 1) * pageSize});
        }
    };

    useEffect(() => {
        if (selectedSchema) {
            handlePageChange(1, 10);
        }
    }, [selectedSchema]);

    return (
        <div className="space-y-4">
            <SchemaSelect onSchemaSelect={setSelectedSchema} selectedSchema={selectedSchema}/>
            {loading && <p>Loading...</p>}
            {error && <p className="text-red-500">Error: {error.message}</p>}
            {data && (
                <Suspense fallback={<MatrxTableLoading/>}>
                    <MatrxTable
                        data={data}
                        actions={['view']}
                        onAction={(actionName, rowData) => console.log(actionName, rowData)}
                        truncateAt={50}
                        customModalContent={(rowData) => (
                            <pre>{JSON.stringify(rowData, null, 2)}</pre>
                        )}
                        onPageChange={handlePageChange}
                    />
                </Suspense>
            )}
        </div>
    );
};

export default PaginatedFetch;
