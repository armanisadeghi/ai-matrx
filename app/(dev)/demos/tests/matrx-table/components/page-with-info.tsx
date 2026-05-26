// // app/(authenticated)/tests/matrx-table/hold-hold-page.tsx
//
// 'use client';
//
// import React, { useMemo } from 'react';
// import { EmployeeData } from "@/app/(dev)/demos/tests/matrx-table/test-data/sample-employees";
// import { FlashcardData } from "@/app/(dev)/demos/tests/matrx-table/test-data/sample-flashcards";
// import CustomTableBody from './MatrxTableBody';
// import { useTable } from 'react-table';
//
// const tableDataOne = EmployeeData;
// const tableDataTwo = FlashcardData;
//
// const MatrxTableTestPage: React.FC = () => {
//     const getRowId = (row: any, index: number) => row.id || `row-${index}`;
//
//     const createColumns = (data: any[]) => {
//         if (data.length === 0) return [];
//         return Object.keys(data[0]).map(key => ({
//             Header: key.charAt(0).toUpperCase() + key.slice(1),
//             accessor: key,
//         }));
//     };
//
//     const columnsOne = useMemo(() => createColumns(tableDataOne), []);
//     const columnsTwo = useMemo(() => createColumns(tableDataTwo), []);
//
//     const tableInstanceOne = useTable({
//         columns: columnsOne,
//         data: tableDataOne,
//         getRowId
//     });
//
//     const tableInstanceTwo = useTable({
//         columns: columnsTwo,
//         data: tableDataTwo,
//         getRowId
//     });
//
//     const handleAction = (actionName: string, rowData: any) => {
//         console.log(`Action: ${actionName}`, rowData);
//     };
//
//     return (
//         <div className="p-4">
//             <h1 className="text-2xl font-bold mb-4">MatrxTable Test Page</h1>
//
//             <div className="mb-8">
//                 <h2 className="text-xl font-semibold mb-2">Employee Data Table</h2>
//                 <CustomTableBody
//                     page={tableInstanceOne.rows}
//                     prepareRow={tableInstanceOne.prepareRow}
//                     actions={['edit', 'delete', 'view', 'expand']}
//                     onAction={handleAction}
//                 />
//             </div>
//
//             <div className="h-16" /> {/* Spacer */}
//
//             <div>
//                 <h2 className="text-xl font-semibold mb-2">Flashcard Data Table</h2>
//                 <CustomTableBody
//                     page={tableInstanceTwo.rows}
//                     prepareRow={tableInstanceTwo.prepareRow}
//                     actions={['edit', 'delete', 'view', 'expand']}
//                     onAction={handleAction}
//                 />
//             </div>
//         </div>
//     );
// };
//
// export default MatrxTableTestPage;
