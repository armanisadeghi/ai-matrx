/**
 * Types for the tool-UI admin authoring editor.
 *
 * A stored tool renderer is one row in `tool.ui` — the DB-driven renderer
 * source the runtime compiles (see `features/tool-call-visualization/db-renderer/`).
 * Incidents are logged to `tool.ui_incident`.
 *
 * Relocated 2026-06-29 from the deleted `dynamic/types.ts` (the broken duplicate
 * runtime). Only the admin editor's row types survived the purge.
 */

import type { Database } from "@/types/database.types";

export type ToolUiComponentRow = Database["tool"]["Tables"]["ui"]["Row"];

export type ToolUiIncidentRow = Database["tool"]["Tables"]["ui_incident"]["Row"];
