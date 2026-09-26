/**
 * Lane TRASH-2 — the two judgements behind the Trash guards, kept pure so jest can prove each one
 * failing and passing without a database.
 *
 *   judgeTrashDoorBody   — THE LINT. A Trash LISTING door filters by the person (or, behind the
 *                          organization gate, by the organization) and never asks a per-row access
 *                          question or walks every organization the caller belongs to. That is the
 *                          class that made /trash read "Nothing in the trash": 75,653 files other
 *                          people archived, each put through iam.has_access, >200 s.
 *   judgeTrashTimings    — THE STORE-LEVEL TIMING GUARD. Every kind's listing answers in under
 *                          300 ms and the counts call in under 2 s, measured server-side.
 *
 * Callers: scripts/check-trash-doors.ts (live catalogue) and scripts/check-trash-answers-fast.ts
 * (live timings). Chair ruling 2026-09-25: access is personal; Google Drive / Workspace.
 */

export interface TrashDoorFinding {
  door: string;
  problem: string;
}

/** A listing door: its schema-qualified name and its body as `pg_get_functiondef` prints it. */
export interface TrashDoorBody {
  door: string;
  body: string;
}

/** Functions named like a Trash door but which RESTORE or GATE rather than list. */
export function isTrashListingDoorName(name: string): boolean {
  const bare = name.includes(".") ? name.slice(name.indexOf(".") + 1) : name;
  if (!/(^|_)trash(_|$)/.test(bare)) return false;
  if (/restore|undelete|gate|keep|purge/.test(bare)) return false;
  return true;
}

/** Comments are prose, never evidence of what a body does. */
function stripSqlComments(body: string): string {
  return body.replace(/--[^\n]*/g, "").replace(/\/\*[\s\S]*?\*\//g, "");
}

export function judgeTrashDoorBody({ door, body }: TrashDoorBody): TrashDoorFinding[] {
  const code = stripSqlComments(body);
  const bare = door.includes(".") ? door.slice(door.indexOf(".") + 1) : door;
  const out: TrashDoorFinding[] = [];
  if (/\bhas_access(_for|_as|_for_base)?\s*\(/i.test(code)) {
    out.push({
      door,
      problem:
        "asks a per-row access question (iam.has_access). A Trash listing filters by the person " +
        "(owner = me, or a grant named to me) BEFORE any row is read; it never walks candidate rows " +
        "and checks each one.",
    });
  }
  if (/\bmy_orgs\s*\(/i.test(code)) {
    out.push({
      door,
      problem:
        "walks every organization the caller belongs to (iam.my_orgs()). Personal Trash is yours plus " +
        "what was shared with you by name; other members' deletions belong to Organization Trash.",
    });
  }
  if (/granted_to_organization_id/i.test(code)) {
    out.push({
      door,
      problem:
        "admits an organization-wide grant. Only a grant named to the PERSON (granted_to_user_id) puts " +
        "somebody else's archived item in your Trash.",
    });
  }
  if (bare.startsWith("org_trash") && !/_org_trash_gate\s*\(/.test(code)) {
    out.push({
      door,
      problem: "is an Organization Trash door that never calls public._org_trash_gate (owner/admin only).",
    });
  }
  if (!bare.startsWith("_") && !bare.startsWith("org_trash") && !/auth\.uid\(\)/.test(code)) {
    out.push({
      door,
      problem: "is a personal Trash door that never reads auth.uid() — whose Trash is it listing?",
    });
  }
  return out;
}

export const KIND_LISTING_CEILING_MS = 300;
export const COUNTS_CEILING_MS = 2000;

export interface TrashTiming {
  /** e.g. "trash_list file (admin@admin.com)" */
  label: string;
  /** "kind" rows are held to 300 ms; "counts" rows to 2 s. */
  class: "kind" | "counts";
  /** Server-side Execution Time; null when the statement was cancelled or failed. */
  ms: number | null;
  error?: string;
}

export function judgeTrashTimings(rows: TrashTiming[]): TrashDoorFinding[] {
  const out: TrashDoorFinding[] = [];
  for (const r of rows) {
    const ceiling = r.class === "kind" ? KIND_LISTING_CEILING_MS : COUNTS_CEILING_MS;
    if (r.ms === null) {
      out.push({ door: r.label, problem: `did not answer (${r.error ?? "no timing"}); ceiling ${ceiling} ms` });
    } else if (r.ms > ceiling) {
      out.push({ door: r.label, problem: `answered in ${r.ms.toFixed(1)} ms, over the ${ceiling} ms ceiling` });
    }
  }
  return out;
}

// ─────────────────────────────────────────────────────────────────────────────────────────────
// THE COVERAGE JUDGEMENT (lane TRASH-TABLES, 2026-09-26)
//
// /trash says "Everything you've deleted, in one place". VERIFIER-25 archived a data Table from its
// own page and it was in neither Trash: the record store keeps every Table and Record in ONE table
// (custom.record), which no platform.entity_types row can describe, and nothing checked that what
// the platform archives is findable. This judgement is that check. Its population is REALITY, not a
// list: every soft-deletable Entity that has at least one archived row, and every record-store class
// (custom.record.data_class) that has one. Each must be COVERED — its newest archived row is listed
// by `public._trash_kind_rows` for the person who owns it (a behavioural probe, not a registry read)
// — or carry a reason below. A new archivable thing that is not in Trash fails; an exemption whose
// thing is now covered fails too (the list only shrinks).
// ─────────────────────────────────────────────────────────────────────────────────────────────

/** The record store's Trash kinds (public._trash_kind_rows' store branch), keyed by data_class. */
export const STORE_TRASH_KINDS: Readonly<Record<string, string>> = { table: "table", record: "record" };

export interface ArchivedThing {
  /** `entity:<platform.entity_types.token>` or `store:<custom.record.data_class>`. */
  thing: string;
  /** True when the probe found its newest archived row in its owner's Trash. */
  covered: boolean;
  /** What the probe saw, for the operator. */
  detail?: string;
}

const NOT_A_PERSONS_DELETION =
  "System- or derived-row, not a person's deletion: a run, a queue item, an index or a setting row that " +
  "is superseded or re-toggled rather than restored (TRASH-COVERAGE's notification_preference ruling).";
const NOT_YET_JUDGED =
  "A person's archived thing with no Trash kind yet (TRASH-TABLES census 2026-09-26). The chair rules " +
  "each: register a user_artifact_kind (restorable through entity_undelete) or name why it comes back " +
  "with a parent.";

/**
 * Known gaps and deliberate absences — every entry names why. The census that seeded it: every
 * `type = 'entity'` registry row with soft delete and at least one archived row on production, plus
 * every record-store class with an archived row (2026-09-26).
 */
export const TRASH_COVERAGE_EXEMPT: Readonly<Record<string, string>> = {
  // ── the record store ────────────────────────────────────────────────────────────────────────
  "entity:record":
    "custom.record is the record store's ONE physical table; its Tables and Records are covered by the " +
    "store branch (store:table, store:record), probed separately. The generic loop must not list it.",
  "store:field":
    "A Field removed on its own (custom.field_retire) has no store door that puts the column back; a " +
    "Trash row would be a dead control. Fields archived with their Table come back with it.",
  "store:rule": "Archived only with its Table (custom.table_archive's event) and restored with it.",
  "store:relation": "Archived only with its Table or Record and restored with it (the archive event's took list).",
  "store:work_approval":
    "Withdrawn by custom._work_approvals_withdraw_on_archive when its Record is archived; comes back with the Record.",
  "store:doc_template":
    "Removed through custom.doc_template_delete; not yet a Trash kind (store branch lists Tables and Records only).",
  "store:dashboard": "Removed through custom.dashboard_delete; not yet a Trash kind.",
  "entity:io_comment":
    "Record comments are archived only by a table move (custom.table_move) or with their Record; no person-facing delete.",
  // ── system or derived rows ──────────────────────────────────────────────────────────────────
  "entity:kg_chunks": NOT_A_PERSONS_DELETION,
  "entity:workflow_run": NOT_A_PERSONS_DELETION,
  "entity:cx_user_request": NOT_A_PERSONS_DELETION,
  "entity:global_request": NOT_A_PERSONS_DELETION,
  "entity:hindsight_enrollment": NOT_A_PERSONS_DELETION,
  "entity:study_attempt": NOT_A_PERSONS_DELETION,
  "entity:item_mastery": NOT_A_PERSONS_DELETION,
  "entity:notification_channel_preference": NOT_A_PERSONS_DELETION,
  "entity:notification_event_override": NOT_A_PERSONS_DELETION,
  "entity:mandate_treatment": NOT_A_PERSONS_DELETION,
  "entity:mandate_binding": NOT_A_PERSONS_DELETION,
  "entity:assist": NOT_A_PERSONS_DELETION,
  "entity:integration_connection": NOT_A_PERSONS_DELETION,
  "entity:processed_document": NOT_A_PERSONS_DELETION,
  // ── a person's thing, not yet in Trash ──────────────────────────────────────────────────────
  "entity:rulebook": NOT_YET_JUDGED,
  "entity:folder": NOT_YET_JUDGED,
  "entity:war_room": NOT_YET_JUDGED,
  "entity:thread": NOT_YET_JUDGED,
  "entity:scope_type": NOT_YET_JUDGED,
  "entity:scope": NOT_YET_JUDGED,
  "entity:context_item": NOT_YET_JUDGED,
  "entity:working_document": NOT_YET_JUDGED,
  "entity:user_memory": NOT_YET_JUDGED,
  "entity:wbx_highlight": NOT_YET_JUDGED,
  "entity:browser_profile": NOT_YET_JUDGED,
  "entity:media_source_library": NOT_YET_JUDGED,
  "entity:learn_doc": NOT_YET_JUDGED,
  "entity:seo_topical_map": NOT_YET_JUDGED,
  "entity:seo_rank_target": NOT_YET_JUDGED,
  "entity:hr_employee": NOT_YET_JUDGED,
  "entity:hr_employment": NOT_YET_JUDGED,
  "entity:hr_leave_policy": NOT_YET_JUDGED,
  "entity:hr_jurisdiction_rule_org_decision": NOT_YET_JUDGED,
  "entity:crm_blocklist_entry": NOT_YET_JUDGED,
  "entity:commerce_intake_batch": NOT_YET_JUDGED,
  "entity:interview_decision_interview": NOT_YET_JUDGED,
  "entity:workflow_runtime_surface": NOT_YET_JUDGED,
  "entity:workflow_trigger": NOT_YET_JUDGED,
  "entity:product_capture_item": NOT_YET_JUDGED,
  "entity:category": NOT_YET_JUDGED,
  "entity:flexible_data": NOT_YET_JUDGED,
  "entity:shared_canvas_item": NOT_YET_JUDGED,
  "entity:sch_task": NOT_YET_JUDGED,
  "entity:user_feedback": NOT_YET_JUDGED,
  "entity:agent_mandate_note": NOT_YET_JUDGED,
};

export function judgeTrashCoverage(
  things: ArchivedThing[],
  exempt: Readonly<Record<string, string>> = TRASH_COVERAGE_EXEMPT,
): TrashDoorFinding[] {
  const out: TrashDoorFinding[] = [];
  for (const t of things) {
    const why = exempt[t.thing];
    if (!t.covered && !why) {
      out.push({
        door: t.thing,
        problem:
          `has archived rows but is not in Trash${t.detail ? ` (${t.detail})` : ""}. Register it ` +
          "(platform.entity_types.user_artifact_kind, or the store branch of public._trash_kind_rows) so its " +
          "owner can find and restore it, or add it to TRASH_COVERAGE_EXEMPT with the reason it comes back another way.",
      });
    } else if (t.covered && why && t.thing !== "entity:record") {
      out.push({
        door: t.thing,
        problem: "is covered by Trash now but still listed in TRASH_COVERAGE_EXEMPT — remove the stale exemption.",
      });
    }
  }
  return out;
}
