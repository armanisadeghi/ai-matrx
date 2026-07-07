// features/education/publishing/types.ts
//
// Types for the DB-backed /education/learn publishing engine (P6 Phase A).
// The public render shape is the existing `LearnDoc` (features/education/types)
// — one content schema, ever. A `LearnDocRecord` adds the row identity +
// publication status the authoring surface needs.

import type { EduSection, LearnDoc } from "../types";
import type { Database } from "@/types/database.types";

/** Raw DB row. */
export type LearnDocRow = Database["education"]["Tables"]["learn_doc"]["Row"];

/** Publication status, derived from `visibility` (public = published). */
export type LearnDocStatus = "draft" | "published";

/** A learn doc as authored — render payload + identity + status. */
export interface LearnDocRecord extends LearnDoc {
  id: string;
  status: LearnDocStatus;
  publishedAt: string | null;
  updatedAt: string;
}

/** Input for create/update via the super-admin upsert RPC. */
export interface LearnDocDraftInput {
  /** Omit / null to create; provide to update. */
  id?: string | null;
  slug: string;
  title: string;
  summary: string;
  subject?: string | null;
  letter?: string;
  keywords?: string[];
  sections: EduSection[];
  related?: LearnDoc["related"];
  /** The author-controlled "Updated" display date (YYYY-MM-DD). */
  contentUpdatedAt?: string | null;
}
