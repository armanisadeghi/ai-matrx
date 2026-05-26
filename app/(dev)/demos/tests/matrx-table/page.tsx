// app/(authenticated)/tests/matrx-table/hold-hold-page.tsx

'use client';

import React, {Suspense} from 'react';
import dynamic from 'next/dynamic';
import {EmployeeData} from "@/app/(dev)/demos/tests/matrx-table/test-data/sample-employees";
import {FlashcardData} from "@/app/(dev)/demos/tests/matrx-table/test-data/sample-flashcards";
import {MatrxTableLoading} from '@/components/matrx/LoadingComponents';
import { ensureId } from "@/utils/schema/lite";

const DynamicMatrxTable = dynamic(() => import('./components/MatrxTable'), {ssr: false});

const tableDataOne = ensureId(EmployeeData);
const tableDataTwo = ensureId(FlashcardData);


const MatrxTableTestPage: React.FC = () => {


    const handleAction = (actionName: string, data: any) => {
        switch (actionName) {
            case 'add':
                console.log('Adding new item.tsx:', data);
                break;
            case 'edit':
                console.log('Editing item.tsx:', data);
                break;
            case 'delete':
                console.log('Deleting item.tsx:', data);
                break;
            case 'expand':
                console.log('Expanding item.tsx:', data);
                break;
            default:
                console.log(`Unknown action: ${actionName}`);
        }
    };

    const data = tableDataOne;
    const actions = undefined;
    const onAction = handleAction;
    const defaultVisibleColumns = undefined;
    const truncateAt = undefined;
    const customModalContent = undefined;
    const className = undefined;


    return (

        <div className="p-4">
            <h1 className="text-2xl font-bold mb-4">MatrxTable Test Page</h1>

            <div className="mb-8">
                <h2 className="text-xl font-semibold mb-2">Employee Data Table (Default Modal)</h2>
                <Suspense fallback={<MatrxTableLoading/>}>
                    <DynamicMatrxTable
                        data={data}
                        actions={actions}
                        onAction={onAction}
                        defaultVisibleColumns={defaultVisibleColumns}
                        truncateAt={truncateAt}
                        className={className}
                        customModalContent={customModalContent}
                    />
                </Suspense>
            </div>


            <div className="mb-8">
                <h2 className="text-xl font-semibold mb-2">Flashcard Data Table (Custom Modal Content)</h2>
                <Suspense fallback={<MatrxTableLoading/>}>
                    <DynamicMatrxTable
                        data={tableDataTwo}
                        actions={['view', 'edit', 'delete']}
                        onAction={handleAction}
                        defaultVisibleColumns={defaultVisibleColumns}
                        truncateAt={50}
                        className={className}
                        customModalContent={(rowData) => (
                            <div className="p-6 bg-accent rounded-md space-y-4">
                                <div>
                                    <h3 className="text-lg font-semibold mb-1">Question:</h3>
                                    <p className="text-base">{rowData.front}</p>
                                </div>
                                <div>
                                    <h3 className="text-lg font-semibold mb-1">Answer:</h3>
                                    <p className="text-base">{rowData.back}</p>
                                </div>
                                <div className="space-y-3">
                                    {Object.keys(rowData).filter((key) => key !== 'front' && key !== 'back').map((key) => (
                                        <div key={key} className="flex flex-col">
                                            <span className="font-semibold">{key}:</span>
                                            <span className="text-base">{rowData[key]}</span>
                                        </div>
                                    ))}
                                </div>
                            </div>
                        )}
                    />
                </Suspense>
            </div>
        </div>
    );
};

export default MatrxTableTestPage;
