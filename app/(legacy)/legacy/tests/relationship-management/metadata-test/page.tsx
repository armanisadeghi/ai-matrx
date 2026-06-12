'use client';
import React, { useEffect, useState } from 'react';
import { BasicInfoCard, PrimaryKeyInfo, SimpleCard, RelationshipsCard } from './info-cards';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { EntityKeys } from '@/types/entityTypes';
import EntityFieldsCard from './field-cardds';
import RelationshipDetailsCard from './RelationshipDetailsCard';
import { getFullEntityRelationships, getEntityMetadata } from '@/lib/redux/entity/utils/direct-schema';
import { EntityHeader } from './info-header';
import { EntityMetadata } from '@/lib/redux/entity/types/stateTypes';

export default function TestEntityMetadata() {
    const [entityKey, setEntityKey] = useState<EntityKeys>();
    const [metadata, setMetadata] = useState<EntityMetadata>(null);
    const [activeTab, setActiveTab] = useState('fields');
    const relationshipDetails = getFullEntityRelationships();

    useEffect(() => {
        if (entityKey) {
            const result = getEntityMetadata(entityKey);
            setMetadata(result);
        }
    }, [entityKey]);

    return (
        <div className='h-full w-full p-4 space-y-4 dark:bg-gray-800'>
            <EntityHeader 
                entityKey={entityKey}
                onEntityChange={setEntityKey}
                metadata={metadata}
                relationships={relationshipDetails[entityKey]}
            />

            {metadata && (
                <div className='space-y-4'>
                    <div className='grid grid-cols-3 gap-4'>
                        <div className='grid grid-cols-2 gap-4'>
                            <BasicInfoCard metadata={metadata} />
                            <PrimaryKeyInfo metadata={metadata} />
                        </div>
                        <div className='col-span-2'>
                            <RelationshipsCard relationships={metadata.relationships} />
                        </div>
                    </div>

                    <Tabs
                        value={activeTab}
                        onValueChange={setActiveTab}
                        className='w-full'
                    >
                        <TabsList className='grid w-full grid-cols-3'>
                            <TabsTrigger value='fields'>Fields</TabsTrigger>
                            <TabsTrigger value='relationships'>Relationships</TabsTrigger>
                            <TabsTrigger value='raw'>Raw Data</TabsTrigger>
                        </TabsList>

                        <TabsContent
                            value='fields'
                            className='mt-4'
                        >
                            <EntityFieldsCard entityFields={metadata.entityFields} />
                        </TabsContent>

                        <TabsContent
                            value='relationships'
                            className='mt-4'
                        >
                            <RelationshipDetailsCard relationships={relationshipDetails[entityKey]} />
                        </TabsContent>

                        <TabsContent
                            value='raw'
                            className='mt-4'
                        >
                            <div className='grid grid-cols-2 gap-4'>
                                <SimpleCard title='Entity Fields'>
                                    <pre className='text-sm whitespace-pre-wrap break-words bg-gray-50 dark:bg-gray-700 p-4 rounded overflow-auto h-[calc(100dvh-36rem)]'>
                                        {JSON.stringify(metadata.entityFields, null, 2)}
                                    </pre>
                                </SimpleCard>

                                <SimpleCard title='Full Metadata'>
                                    <pre className='text-sm whitespace-pre-wrap break-words bg-gray-50 dark:bg-gray-700 p-4 rounded overflow-auto h-[calc(100dvh-36rem)]'>
                                        {JSON.stringify(metadata, null, 2)}
                                    </pre>
                                </SimpleCard>
                            </div>
                        </TabsContent>
                    </Tabs>
                </div>
            )}
        </div>
    );
}
