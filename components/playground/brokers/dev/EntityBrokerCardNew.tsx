'use client';

import React, { useState } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { Card, CardContent } from '@/components/ui/card';
import { UnifiedLayoutProps } from '@/components/matrx/Entity/prewired-components/layouts/types';
import { EntityKeys } from '@/types/entityTypes';
import { MatrxRecordId } from '@/types/records';
import { EntityFormMinimalAnyRecord } from '@/app/entities/forms/EntityFormMinimalAnyRecord';
import BrokerCardHeader from '../BrokerCardHeader';
import { EntityRecordMap } from '@/lib/redux/entity/types/stateTypes';

interface BrokerRecordDisplayProps<TEntity extends EntityKeys> {
    unifiedLayoutProps: UnifiedLayoutProps;
    entityName: TEntity;
    selectedRecordsWithKeys: EntityRecordMap<TEntity>;
    onRecordRemove?: (recordId: MatrxRecordId) => void;
}

const BrokerRecordDisplay = <TEntity extends EntityKeys>({ 
    unifiedLayoutProps, 
    entityName, 
    selectedRecordsWithKeys,
    onRecordRemove 
}: BrokerRecordDisplayProps<TEntity>) => {
    const [openStates, setOpenStates] = useState<Record<string, boolean>>({});

    if (!Object.keys(selectedRecordsWithKeys).length) {
        return null;
    }

    const toggleOpen = (recordId: MatrxRecordId) => {
        setOpenStates((prev) => ({
            ...prev,
            [recordId]: !prev[recordId],
        }));
    };

    return (
        <div className='w-full space-y-4'>
            {Object.entries(selectedRecordsWithKeys).map(([recordId, record]) => (
                <motion.div
                    key={recordId}
                    initial={{ opacity: 0, y: -10 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: 10 }}
                    className='my-4 last:mb-0'
                >
                    <Card className='bg-elevation2 border border-elevation3 rounded-lg'>
                        <BrokerCardHeader
                            recordId={recordId}
                            record={record as any}
                            chips={[]}
                            isOpen={openStates[recordId] || false}
                            onToggle={() => toggleOpen(recordId)}
                            onDelete={() => onRecordRemove?.(recordId)}
                        />

                        <AnimatePresence>
                            {openStates[recordId] && (
                                <motion.div
                                    initial={{ height: 0, opacity: 0 }}
                                    animate={{ height: 'auto', opacity: 1 }}
                                    exit={{ height: 0, opacity: 0 }}
                                    className='overflow-hidden'
                                >
                                    <CardContent className='p-2 bg-background space-y-2 border-t'>
                                        <EntityFormMinimalAnyRecord<TEntity>
                                            key={recordId}
                                            recordId={recordId}
                                            unifiedLayoutProps={unifiedLayoutProps}
                                        />
                                    </CardContent>
                                </motion.div>
                            )}
                        </AnimatePresence>
                    </Card>
                </motion.div>
            ))}
        </div>
    );
};

export default BrokerRecordDisplay;