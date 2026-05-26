// app/admin/components/entity-browser/EntityBrowser.tsx
'use client';

import {useState, useEffect, Suspense} from 'react';
import {useEntity} from '@/lib/redux/entity/hooks/useEntity';
import {EntityKeys} from '@/types/entityTypes';
import {Card, CardContent,} from "@/components/ui/card";
import MatrxTable from '@/app/(dev)/demos/tests/matrx-table/components/MatrxTable';
import {MatrxTableLoading} from "@/components/matrx/LoadingComponents";
import EntityCardHeaderSelect from '@/components/matrx/Entity/prewired-components/entity-management/parts/CardHeaderSelect';

const EntityTableContainer = ({entityKey}: { entityKey: EntityKeys }) => {
    const entity = useEntity(entityKey);

    const handlePageChange = (pageIndex: number, pageSize: number) => {
        entity.fetchRecords(pageIndex + 1, pageSize);
    };

    useEffect(() => {
        if (entity.entityMetadata) {
            entity.fetchRecords(1, 10);
        }
    }, [entity.entityMetadata]);

    if (!entity.entityMetadata) {
        return <MatrxTableLoading/>;
    }

    const tableData = entity.currentPage.map(record => ({
        ...record,
        id: record[entity.primaryKeyMetadata.fields[0]]
    }));

    const visibleColumns = Object.values(entity.entityMetadata.entityFields).map(field => field.name);

    return (
        <MatrxTable
            data={tableData}
            defaultVisibleColumns={visibleColumns}
            loading={entity.loadingState.loading}
            totalCount={entity.paginationInfo.totalCount}
            onPageChange={handlePageChange}
            className="w-full"
        />
    );
};

const EntityBrowser = () => {
    const [selectedEntity, setSelectedEntity] = useState<EntityKeys | null>(null);

    return (
        <Card className="w-full">
            <EntityCardHeaderSelect onEntityChange={setSelectedEntity}/>
            <CardContent>
                <Suspense fallback={<MatrxTableLoading/>}>
                    {selectedEntity ? (
                        <EntityTableContainer entityKey={selectedEntity}/>
                    ) : (
                         <div className="text-center py-8 text-muted-foreground">
                             Select an entity to view its data
                         </div>
                     )}
                </Suspense>
            </CardContent>
        </Card>
    );
};

export default EntityBrowser;
