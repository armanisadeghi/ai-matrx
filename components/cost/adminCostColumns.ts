import type { MatrxColumnDef } from "@ai-matrx/design-system/data-table/types";
import { adminCostPoints, formatAdminPoints, formatAdminUsd } from "./formatAdminCost";

/** Keep USD and points independently visible, sortable, and filterable in admin tables. */
export function adminCostColumns<T>({
  id,
  value,
  label = "Cost",
  mobileHidden,
}: {
  id: string;
  value: (row: T) => number | null | undefined;
  label?: string;
  mobileHidden?: boolean;
}): MatrxColumnDef<T>[] {
  return [
    {
      id,
      header: `${label} (USD)`,
      accessorFn: value,
      filter: "number",
      defaultSortDirection: "desc",
      align: "right",
      width: 110,
      mobileHidden,
      cell: (row) => formatAdminUsd(value(row)),
    },
    {
      id: `${id}_points`,
      header: label === "Cost" ? "Points" : `${label} (points)`,
      accessorFn: (row) => adminCostPoints(value(row)),
      filter: "number",
      defaultSortDirection: "desc",
      align: "right",
      width: 140,
      mobileHidden,
      cell: (row) => formatAdminPoints(value(row)),
    },
  ];
}
