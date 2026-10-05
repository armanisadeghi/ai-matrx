import type { ChatDatabase } from "../host/db-types";

/** A row of `tool.definition` (the host's tools service reads the same table). */
export type DatabaseTool = ChatDatabase["tool"]["Tables"]["definition"]["Row"];
