"use client";

import { Suspense } from "react";
import { MatrxDataTable } from "@/components/official/matrx-data-table/MatrxDataTable";
import type {
  MatrxDataTableProps,
  SortState,
} from "@/components/official/matrx-data-table/types";
import { useTableUrlState } from "./useTableUrlState";

export interface UrlStateMatrxDataTableProps<T> extends Omit<
  MatrxDataTableProps<T>,
  "query"
> {
  urlState?: {
    paramPrefix?: string;
    defaultSort?: SortState | null;
    defaultPageSize?: number;
  };
}

function UrlStateMatrxDataTableImpl<T>({
  urlState,
  pageSize,
  ...props
}: UrlStateMatrxDataTableProps<T>) {
  const table = useTableUrlState({
    paramPrefix: urlState?.paramPrefix,
    defaultSort: urlState?.defaultSort,
    defaultPageSize: urlState?.defaultPageSize ?? pageSize ?? 25,
  });

  return (
    <MatrxDataTable
      {...props}
      pageSize={pageSize}
      query={{
        mode: "controlled-local",
        state: table.state,
        onStateChange: table.onStateChange,
      }}
    />
  );
}

/**
 * Local MatrxDataTable whose search, filters, sort, and pagination live in the
 * URL. The internal Suspense boundary makes it safe in Server Component routes.
 */
export function UrlStateMatrxDataTable<T>(
  props: UrlStateMatrxDataTableProps<T>,
) {
  return (
    <Suspense fallback={<MatrxDataTable {...props} />}>
      <UrlStateMatrxDataTableImpl {...props} />
    </Suspense>
  );
}
