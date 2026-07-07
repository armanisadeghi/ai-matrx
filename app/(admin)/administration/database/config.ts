// Database administration configuration — re-exports hub registry for layout + legacy imports.
export {
  DATABASE_MODULE_HOME,
  DATABASE_MODULE_NAME,
  DEFAULT_DATABASE_SCHEMA,
  databaseSqlSubPages,
  databaseToolLabel,
  databaseToolPages,
  isActiveDatabaseToolPath,
  type DatabaseToolPage,
  type DatabaseToolSection,
} from "@/features/administration/database-hub/database-tools";

import { databaseSqlSubPages } from "@/features/administration/database-hub/database-tools";

/** @deprecated Use databaseSqlSubPages — kept for callers expecting databasePages */
export const databasePages = databaseSqlSubPages;

/** @deprecated Use isActiveDatabaseToolPath */
export { isActiveDatabaseToolPath as isActivePath } from "@/features/administration/database-hub/database-tools";
