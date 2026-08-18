// features/vision-interview/browse/types.ts
//
// What is genuinely vision-interview-specific about the canonical entity list.
//
// ROW TYPE NOTE: `ivw_list_scoped` is not yet in the generated database types
// (the migration is written but applied by the orchestrator, and this
// container cannot run `pnpm db-types`). The row is hand-declared to match the
// RPC's RETURNS TABLE exactly; replace with
// `Database["public"]["Functions"]["ivw_list_scoped"]["Returns"][number]`
// once types regenerate.

import type { ListScopeKind } from "@/lib/list-scope/types";
import type { InterviewStageWire } from "../types";

/** One row, exactly as public.ivw_list_scoped returns it. */
export interface SessionListRow {
  id: string;
  title: string;
  vision_statement: string;
  /** May still carry legacy v1 values on old rows — display via normalizeStage. */
  stage: InterviewStageWire;
  current_round: number;
  open_questions: number;
  visibility: string;
  user_id: string;
  organization_id: string | null;
  organization_name: string | null;
  created_at: string;
  updated_at: string;
  is_owner: boolean;
  access_level: string;
  owner_email: string | null;
  total_count: number;
}

/** Declared subset of the fixed five scopes (lib/list-scope). */
export const SESSION_LIST_SCOPES: ListScopeKind[] = ["mine", "orgs", "shared"];

/** Fields the table can write back inline. */
export interface SessionRowEdit {
  title?: string;
}
