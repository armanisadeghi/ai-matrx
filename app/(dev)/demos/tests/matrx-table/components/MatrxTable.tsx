// app/(authenticated)/tests/matrx-table/components/MatrxTable.tsx
"use client";

import React, { useEffect, useMemo, useState } from "react";
import {
  useTable,
  useSortBy,
  useGlobalFilter,
  usePagination,
} from "react-table";
import { Table } from "@/components/ui/table";
import {
  MatrxTableProps,
  TableInstance,
  ExtendedTableState,
} from "@/types/tableTypes";
import MatrxTableHeader from "@/app/(dev)/demos/tests/matrx-table/components/MatrxTableHeader";
import MatrxTableBody from "@/app/(dev)/demos/tests/matrx-table/components/MatrxTableBody";
import { cn } from "@/styles/themes/utils";
import TableTopOptions from "@/components/matrx/table/TableTopOptions";
import TableBottomSection from "@/components/matrx/table/TableBottomSection";
import MatrxColumnSettings from "@/app/(dev)/demos/tests/matrx-table/components/MatrxColumnSettings";

const MatrxTable: React.FC<MatrxTableProps> = ({
  data,
  actions,
  onAction,
  defaultVisibleColumns,
  truncateAt,
  customModalContent,
  className,
  onPageChange,
}) => {
  const allData = useMemo(() => {
    console.log("Data:", data);
    return data.map((row, index) => ({
      ...row,
      actions: actions,
      id: row.id ? `${row.id}` : `row-${index}`,
    }));
  }, [data, actions]);

  const allColumns = useMemo(() => {
    if (allData.length === 0) return [];
    const columns = Object.keys(allData[0]).map((key) => ({
      Header: key.charAt(0).toUpperCase() + key.slice(1),
      accessor: key,
      ...(key === "actions" && { Cell: () => null, Header: "Actions" }),
    }));
    return columns;
  }, [allData]);

  const allColumnNames = useMemo(
    () => allColumns.map((col) => col.Header as string),
    [allColumns],
  );

  const [visibleColumnAccessors, setVisibleColumnAccessors] = useState<
    string[]
  >([]);

  useEffect(() => {
    if (allColumns.length > 0) {
      if (defaultVisibleColumns && defaultVisibleColumns.length > 0) {
        const newVisibleAccessors = allColumns
          .filter((column) =>
            defaultVisibleColumns.some(
              (defaultCol) =>
                defaultCol.toLowerCase() === column.Header.toLowerCase() ||
                defaultCol.toLowerCase() === column.accessor.toLowerCase(),
            ),
          )
          .map((col) => col.accessor as string);
        setVisibleColumnAccessors(newVisibleAccessors);
      } else {
        const initialAccessors = allColumns
          .filter((column) => column.accessor !== "id")
          .map((col) => col.accessor as string);
        setVisibleColumnAccessors(initialAccessors);
      }
    }
  }, [allColumns, defaultVisibleColumns]);

  const visibleColumns = useMemo(
    () =>
      allColumns.filter((column) =>
        visibleColumnAccessors.includes(column.accessor as string),
      ),
    [allColumns, visibleColumnAccessors],
  );

  const [columnSettingsOpen, setColumnSettingsOpen] = useState(false);

  const {
    getTableProps,
    getTableBodyProps,
    headerGroups,
    page,
    prepareRow,
    state,
    setGlobalFilter,
    nextPage,
    previousPage,
    canNextPage,
    canPreviousPage,
    pageCount,
    gotoPage,
    setPageSize,
  } = useTable(
    {
      columns: visibleColumns as any,
      data: allData,
      initialState: { pageSize: 10 } as Partial<ExtendedTableState>,
    },
    useGlobalFilter,
    useSortBy,
    usePagination,
  ) as unknown as TableInstance;

  const { globalFilter, pageIndex, pageSize } = state as ExtendedTableState;

  const pageNumbers: number[] = [];
  const totalPages = pageCount;
  const currentPage = pageIndex + 1;

  if (totalPages <= 5) {
    for (let i = 1; i <= totalPages; i++) {
      pageNumbers.push(i);
    }
  } else {
    if (currentPage <= 3) {
      pageNumbers.push(1, 2, 3, 4, 5);
    } else if (currentPage >= totalPages - 2) {
      pageNumbers.push(
        totalPages - 4,
        totalPages - 3,
        totalPages - 2,
        totalPages - 1,
        totalPages,
      );
    } else {
      pageNumbers.push(
        currentPage - 2,
        currentPage - 1,
        currentPage,
        currentPage + 1,
        currentPage + 2,
      );
    }
  }

  const handleSearchChange = (value: string) => {
    setGlobalFilter(value);
  };

  return (
    <div className={cn("p-1 space-y-4", className)}>
      <TableTopOptions
        columnNames={allColumnNames}
        handleSearchChange={handleSearchChange}
        pageSize={pageSize}
        setPageSize={setPageSize}
        // handleAdd={() => openModal('add')}
        handleAdd={() =>
          console.log("Add button clicked. Currently not implemented")
        }
        setColumnSettingsOpen={setColumnSettingsOpen}
        columnSettingsOpen={columnSettingsOpen}
      />

      <div className="relative overflow-hidden shadow-md sm:rounded-lg scrollbar-hide">
        <div className="overflow-x-auto scrollbar-hide">
          <div className="inline-block min-w-full align-middle scrollbar-hide">
            <div className="overflow-hidden border rounded-xl bg-matrxBorder scrollbar-hide">
              <Table
                {...getTableProps()}
                className="min-w-full divide-y divide-gray-200 dark:divide-gray-700 scrollbar-hide"
              >
                <MatrxTableHeader headerGroups={headerGroups} />
                <MatrxTableBody
                  page={page}
                  prepareRow={prepareRow}
                  actions={actions}
                  onAction={onAction}
                  truncateAt={truncateAt}
                  customModalContent={customModalContent}
                />
              </Table>
            </div>
          </div>
        </div>
      </div>
      <TableBottomSection
        currentPage={currentPage}
        pageNumbers={pageNumbers}
        canPreviousPage={canPreviousPage}
        canNextPage={canNextPage}
        previousPage={previousPage}
        nextPage={nextPage}
        gotoPage={gotoPage}
      />
      <MatrxColumnSettings
        open={columnSettingsOpen}
        onOpenChange={setColumnSettingsOpen}
        columns={allColumns}
        visibleColumns={visibleColumnAccessors}
        setVisibleColumns={setVisibleColumnAccessors}
      />
    </div>
  );
};

export default MatrxTable;
