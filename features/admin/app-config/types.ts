// features/admin/app-config/types.ts
//
// App Config admin — typed rows for public.app_config / public.app_config_history.
// All shapes derive from the generated Database types — never hand-mirrored.
// Cross-repo system-of-record: /Users/armanisadeghi/code/common-docs/app-config/FEATURE.md

import type { Database } from "@/types/database.types";

export type AppConfigRow = Database["public"]["Tables"]["app_config"]["Row"];

export type AppConfigHistoryRow =
  Database["public"]["Tables"]["app_config_history"]["Row"];
