import { createElement } from "react";
import type { MatrxColumnDef } from "@ai-matrx/design-system/data-table/types";
import { AdminPoints } from "./AdminCost";
import { adminCostPoints, formatAdminUsd } from "./formatAdminCost";
import { currentPointsRate } from "./pointsRate";

/** Keep USD and points independently visible, sortable, and filterable in admin tables. */
export function adminCostColumns<T>({
  id,
  value,
  label = "Cost",
  mobileHidden,
  sortable,
  filter = "number",
}: {
  id: string;
  value: (row: T) => number | null | undefined;
  label?: string;
  mobileHidden?: boolean;
  sortable?: boolean;
  filter?: "number" | false;
}): MatrxColumnDef<T>[] {
  return [
    {
      id,
      header: `${label} (USD)`,
      accessorFn: value,
      filter,
      sortable,
      defaultSortDirection: "desc",
      align: "right",
      width: 110,
      mobileHidden,
      cell: (row) => formatAdminUsd(value(row)),
    },
    {
      id: `${id}_points`,
      header: label === "Cost" ? "Points" : `${label} (points)`,
      // sorting and filtering run on interaction, after the rate has landed; the cell subscribes
      accessorFn: (row) => adminCostPoints(value(row), currentPointsRate()),
      filter,
      sortable,
      defaultSortDirection: "desc",
      align: "right",
      width: 110,
      mobileHidden,
      cell: (row) => createElement(AdminPoints, { usd: value(row) }),
    },
  ];
}

/** Expand existing admin cost fields without disturbing neighboring table columns. */
export function splitAdminCostColumns<T>(
  columns: MatrxColumnDef<T>[],
  fields: readonly (keyof T & string)[],
): MatrxColumnDef<T>[] {
  return columns.flatMap((column) => {
    const key = "accessorKey" in column ? column.accessorKey : undefined;
    if (typeof key !== "string" || !fields.includes(key as keyof T & string)) return [column];
    const label = typeof column.header === "string" ? column.header : "Cost";
    return adminCostColumns<T>({
      id: key,
      label,
      value: (row) => {
        const raw = row[key as keyof T];
        if (raw === null || raw === undefined || raw === "") return null;
        const cost = typeof raw === "number" ? raw : Number(raw);
        return Number.isFinite(cost) ? cost : null;
      },
    });
  });
}
