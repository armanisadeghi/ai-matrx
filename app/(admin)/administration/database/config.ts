// Database administration configuration
import { ModulePage } from "@/components/matrx/navigation/types";

export const DATABASE_MODULE_NAME = "Database Administration";
export const DATABASE_MODULE_HOME = "/administration/database";

export const databasePages: ModulePage[] = [
  {
    title: "SQL Editor",
    path: "/administration/database/sql-queries",
    relative: false,
    description: "Execute SQL queries against the database",
  },
  {
    title: "Workbench",
    path: "/administration/database/workbench",
    relative: false,
    description:
      "Multi-query notebook with shared variables and result merging",
  },
  {
    title: "SQL Functions",
    path: "/administration/database/sql-functions",
    relative: false,
    description: "Manage database functions and stored procedures",
  },
  {
    title: "Enums",
    path: "/administration/database/enums",
    relative: false,
    description: "Manage database enum types and their values",
  },
  // Additional database administration routes can be added here
];

// Helper function to check if a path is active
export function isActivePath(currentPath: string, pagePath: string): boolean {
  // For exact matches
  if (currentPath === pagePath) return true;

  // For nested routes (e.g. /administration/database/sql-functions/123)
  if (pagePath !== DATABASE_MODULE_HOME && currentPath.startsWith(pagePath))
    return true;

  return false;
}
