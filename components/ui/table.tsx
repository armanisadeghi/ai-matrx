"use client";

/**
 * HOST BINDING ONLY — Table lives in `@ai-matrx/design-system`. This app is
 * dense on purpose (`p-2` cells), so it binds `size="sm"`; `md` (`p-3`) is the
 * package default. Density is declared once on `<Table>` and read from context
 * by every cell, so a table cannot mix densities.
 *
 * Two capabilities are now reachable without a fork: `<Table wrap={false}>`
 * for a table whose ancestor already scrolls (double scrollers are their own
 * defect), and `<TableHeader sticky>` to pin the header inside a bounded
 * scroll container.
 */

import { Table as PackageTable, type TableProps } from "@ai-matrx/design-system";
import * as React from "react";

export {
  TableBody,
  TableCaption,
  TableCell,
  TableFooter,
  TableHead,
  TableHeader,
  TableRow,
} from "@ai-matrx/design-system";
export type {
  TableHeaderProps,
  TableProps,
  TableSize,
} from "@ai-matrx/design-system";

const Table = React.forwardRef<HTMLTableElement, TableProps>(
  ({ size = "sm", ...props }, ref) => (
    <PackageTable ref={ref} size={size} {...props} />
  ),
);
Table.displayName = "Table";

export { Table };
