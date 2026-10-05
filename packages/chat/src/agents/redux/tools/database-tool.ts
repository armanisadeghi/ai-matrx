import type { ChatDatabase } from "../../../host/db-types";

/** One row of `tool.definition` — the tool catalog the run picker lists. */
export type DatabaseTool = ChatDatabase["tool"]["Tables"]["definition"]["Row"];
