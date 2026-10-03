// features/unified-data/standard-field-columns/useTableCustomFieldColumns.ts
//
// THE TABLE HOST'S CUSTOM-FIELD COLUMNS (lane 7 STANDARD-TABLES W5, I2). `@ai-matrx/design-system`'s
// MatrxDataTable asks its host's `useCustomFieldColumns(token, organizationIds)` port whenever a table
// names `rowToken`; this is that port's ONE binding (components/official/MatrxDataTableHost.tsx). It is
// the same column source CRM's lists mount by hand (useStandardFieldColumns): the organization's own
// fields of that token, hidden until picked in Columns. A list that pages on the server also needs the
// source's filter/sort helpers in its service (see FEATURE.md beside this file).

import type { TableCustomFieldColumns } from "@ai-matrx/design-system/data-table/host";
import { useStandardFieldColumns } from "./useStandardFieldColumns";

export function useTableCustomFieldColumns<T>(
  token: string | null,
  organizationIds: readonly string[],
): TableCustomFieldColumns<T> | null {
  const source = useStandardFieldColumns<T>(token ?? "", token && organizationIds.length ? organizationIds : null);
  return token ? { columns: source.columns } : null;
}
