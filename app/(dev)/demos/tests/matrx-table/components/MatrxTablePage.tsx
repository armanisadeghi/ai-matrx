// 'use client';
//
// import React, {useState, useMemo, useCallback} from 'react';
// import {useTable, useSortBy, useGlobalFilter, usePagination, Column,} from 'react-table';
// import {Table} from '@/components/ui/table';
// import {cn} from "@/styles/themes/utils"
// import {
//     deleteAction,
//     editAction,
//     expandAction,
//     viewAction
// } from "@/app/(dev)/demos/tests/table-test/actionDefinitions";
//
//
//
// import TableTopOptions from "@/app/(dev)/demos/tests/table-test/TableTopOptions";
// import TableBottomSection from "@/app/(dev)/demos/tests/table-test/TableBottomSection";
// import ColumnSettingsModal from "@/app/(dev)/demos/tests/table-test/ColumnSettingsModal";
// import {
//     ExtendedTableState,
//     TableInstance,
//     TableData
// } from "@/app/(dev)/demos/tests/table-test/table.types";
// import MatrxTableHeader from "@/app/(dev)/demos/tests/matrx-table/components/MatrxTableHeader";
// import MatrxTableBody from "@/app/(dev)/demos/tests/matrx-table/components/MatrxTableBody";
// import DialogForm from "@/app/(dev)/demos/tests/table-test/DialogForm";
//
//
// export interface MatrxTablePageProps {
//     columns: Column<TableData>[];
//     data: TableData[];
//     defaultVisibleColumns?: string[];
//     className?: string;
//     onAdd: (newItem: Omit<TableData, 'id'>) => void;
//     onEdit: (item.tsx: TableData) => void;
//     onDelete: (item.tsx: TableData) => void;
//     onExpand: (item.tsx: TableData) => void;
//     actions?: string[];
//     onAction?: (actionName: string, rowData: TableData) => void;
//     customModalContent?: (rowData: TableData) => React.ReactNode;
//     truncateAt?: number;
// }
//
//
// const MatrxTablePage: React.FC<MatrxTablePageProps> = (
//     {
//         columns,
//         data,
//         defaultVisibleColumns,
//         className,
//         onAdd,
//         onEdit,
//         onDelete,
//         onExpand,
//         actions,
//         onAction,
//         customModalContent,
//         truncateAt,
//
//     }) => {
//     const [visibleColumns, setVisibleColumns] = useState<string[]>(defaultVisibleColumns || columns.map(col => col.accessor as string));
//     const [columnSettingsOpen, setColumnSettingsOpen] = useState(false);
//
//     const allColumns = useMemo(() => columns, [columns]);
//
//     const visibleColumnsData = useMemo(
//         () => allColumns.filter(column => visibleColumns.includes(column.accessor as string)),
//         [allColumns, visibleColumns]
//     );
//
//     const {
//         getTableProps,
//         getTableBodyProps,
//         headerGroups,
//         page,
//         prepareRow,
//         state,
//         setGlobalFilter,
//         nextPage,
//         previousPage,
//         canNextPage,
//         canPreviousPage,
//         pageCount,
//         gotoPage,
//         setPageSize,
//     } = useTable(
//         {
//             columns: visibleColumnsData,
//             data,
//             initialState: {pageSize: 10} as Partial<ExtendedTableState>,
//         },
//         useGlobalFilter,
//         useSortBy,
//         usePagination
//     ) as unknown as TableInstance;
//
//     const {globalFilter, pageIndex, pageSize} = state as ExtendedTableState;
//
//     const pageNumbers = [];
//     const totalPages = pageCount;
//     const currentPage = pageIndex + 1;
//
//     if (totalPages <= 5) {
//         for (let i = 1; i <= totalPages; i++) {
//             pageNumbers.push(i);
//         }
//     } else {
//         if (currentPage <= 3) {
//             pageNumbers.push(1, 2, 3, 4, 5);
//         } else if (currentPage >= totalPages - 2) {
//             pageNumbers.push(totalPages - 4, totalPages - 3, totalPages - 2, totalPages - 1, totalPages);
//         } else {
//             pageNumbers.push(currentPage - 2, currentPage - 1, currentPage, currentPage + 1, currentPage + 2);
//         }
//     }
//
//     const truncateText = (text: unknown, maxLength: number = 100): string => {
//         if (typeof text !== 'string') {
//             return String(text);
//         }
//         if (text.length <= maxLength) return text;
//         return text.slice(0, maxLength) + '...';
//     };
//
//     const [modalOpen, setModalOpen] = useState(false);
//     const [dialogMode, setDialogMode] = useState<'add' | 'edit' | 'delete' | 'view'>('add');
//     const [selectedItem, setSelectedItem] = useState<TableData | null>(null);
//
//     const handleDialogAction = useCallback((action: string, formData?: Record<string, string>) => {
//         switch (action) {
//             case 'add':
//                 onAdd(formData as Omit<TableData, 'id'>);
//                 break;
//             case 'edit':
//                 if (selectedItem) {
//                     onEdit(selectedItem);
//                 }
//                 break;
//             case 'delete':
//                 if (selectedItem) {
//                     onDelete(selectedItem);
//                 }
//                 break;
//             case 'expand':
//                 if (selectedItem) {
//                     onExpand(selectedItem);
//                 }
//                 break;
//             default:
//                 console.warn(`Handler for action "${action}" not found`);
//         }
//         setModalOpen(false);
//         setSelectedItem(null);
//     }, [selectedItem, onAdd, onEdit, onDelete, onExpand]);
//
//     const openModal = useCallback((mode: 'add' | 'edit' | 'delete' | 'view', item.tsx: TableData | null = null) => {
//         setDialogMode(mode);
//         setSelectedItem(item.tsx);
//         setModalOpen(true);
//     }, []);
//
//     const handleSearchChange = (value: string) => {
//         setGlobalFilter(value);
//     };
//
//     const columnNames = useMemo(() => allColumns.map((col) => col.Header as string), [allColumns]);
//
//     const handleAction = useCallback((actionName: string, rowData: TableData) => {
//         switch (actionName) {
//             case 'view':
//                 openModal('view', rowData);
//                 break;
//             case 'edit':
//                 openModal('edit', rowData);
//                 break;
//             case 'delete':
//                 openModal('delete', rowData);
//                 break;
//             case 'expand':
//                 onExpand(rowData);
//                 break;
//             default:
//                 console.warn(`Unknown action: ${actionName}`);
//         }
//     }, [openModal, onExpand]);
//
//     const bodyProps = {
//         page,
//         prepareRow,
//         truncateText,
//         actions: [
//             {...expandAction, name: 'expand'},
//             {...viewAction, name: 'view'},
//             {...editAction, name: 'edit'},
//             {...deleteAction, name: 'delete'}
//         ],
//         onAction: handleAction,
//         visibleColumns,
//     };
//
//     return (
//         <div className={cn("p-3 space-y-4", className)}>
//             <TableTopOptions
//                 columnNames={columnNames}
//                 handleSearchChange={handleSearchChange}
//                 pageSize={pageSize}
//                 setPageSize={setPageSize}
//                 handleAdd={() => openModal('add')}
//                 setColumnSettingsOpen={setColumnSettingsOpen}
//                 columnSettingsOpen={columnSettingsOpen}
//             />
//             <div className="relative overflow-hidden shadow-md sm:rounded-lg">
//                 <div className="overflow-x-auto">
//                     <div className="inline-block min-w-full align-middle">
//                         <div className="overflow-hidden border rounded-xl bg-matrxBorder">
//                             <Table {...getTableProps()}
//                                    className="min-w-full divide-y divide-gray-200 dark:divide-gray-700">
//                                 <MatrxTableHeader headerGroups={headerGroups}/>
//                                 <MatrxTableBody
//                                     data={data}
//                                     actions={actions}
//                                     onAction={onAction}
//                                     visibleColumns={visibleColumns}
//                                     truncateAt={truncateAt}
//                                     customModalContent={customModalContent}
//                                     getTableBodyProps={getTableBodyProps}
//                                 />
//                             </Table>
//                         </div>
//                     </div>
//                 </div>
//             </div>
//             <TableBottomSection
//                 currentPage={currentPage}
//                 pageNumbers={pageNumbers}
//                 canPreviousPage={canPreviousPage}
//                 canNextPage={canNextPage}
//                 previousPage={previousPage}
//                 nextPage={nextPage}
//                 gotoPage={gotoPage}
//             />
//             <DialogForm
//                 open={modalOpen}
//                 onOpenChange={setModalOpen}
//                 mode={dialogMode}
//                 columns={allColumns}
//                 data={selectedItem}
//                 onAction={handleDialogAction}
//             />
//             <ColumnSettingsModal
//                 open={columnSettingsOpen}
//                 onOpenChange={setColumnSettingsOpen}
//                 columns={allColumns}
//                 visibleColumns={visibleColumns}
//                 setVisibleColumns={setVisibleColumns}
//             />
//         </div>
//     );
// };
//
// export default MatrxTablePage;
