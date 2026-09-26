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
  // A TRIGGER never lists anybody's Trash — it reacts to a row being archived (lane STORE-RESTORE-DOORS:
  // docproc.trash_the_whole_source, a cascade trigger, was judged as a listing door by its name alone).
  if (/\bRETURNS\s+trigger\b/i.test(code)) return out;
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

/**
 * The record store's Trash kinds (public._trash_kind_rows' store branch), keyed by data_class. Lane
 * STORE-RESTORE-DOORS (2026-09-26) added the five a person removes on their own — a Field, a Rule, a
 * link between Records, a document template and a dashboard — each restored through its own store door.
 */
export const STORE_TRASH_KINDS: Readonly<Record<string, string>> = {
  table: "table",
  record: "record",
  field: "field",
  rule: "rule",
  relation: "relation",
  doc_template: "doc_template",
  dashboard: "dashboard",
};

export interface ArchivedThing {
  /** `entity:<platform.entity_types.token>` or `store:<custom.record.data_class>`. */
  thing: string;
  /** True when the probe found its newest archived row in its owner's Trash. */
  covered: boolean;
  /**
   * Lane STORE-RESTORE-DOORS: the same row asked of its ORGANIZATION's Trash (organization mode, the
   * owner's seat). `undefined` when the thing has no organization to ask (a Vault credential, a row with
   * no organization column). TRASH-COVERAGE-2 found Organization Trash silently skipping every kind
   * whose table has no visibility column while personal Trash listed them — a probe of personal Trash
   * alone could never see it.
   */
  orgCovered?: boolean;
  /** What the probe saw, for the operator. */
  detail?: string;
}

/**
 * Known absences — every entry names why. Seeded by lane TRASH-TABLES' census (2026-09-26); re-judged
 * by lane TRASH-COVERAGE-2 the same day against the chair's test: A TRUE EXCUSE NAMES WHY A PERSON CAN
 * NEVER ARCHIVE IT THEMSELVES. An entry that fails that test is not an excuse — it is marked
 * `STORE GAP` (the record store has no door that puts it back) and reported to the chair; it stays
 * listed only so the gap is named, never so it is forgotten. Lane STORE-RESTORE-DOORS (2026-09-26) closed
 * the five STORE GAPs (field, rule, relation, doc_template, dashboard): each has a restore door and a Trash
 * kind now, so none is excused.
 */
export const TRASH_COVERAGE_EXEMPT: Readonly<Record<string, string>> = {
  // ── the record store ────────────────────────────────────────────────────────────────────────
  "entity:record":
    "custom.record is the record store's ONE physical table; its Tables and Records are covered by the " +
    "store branch (store:table, store:record), probed separately. The generic loop must not list it.",
  "store:work_approval":
    "Nobody archives an approval: custom._work_approvals_withdraw_on_archive withdraws it when its Record " +
    "is archived, and it comes back with the Record.",
  "entity:io_comment":
    "No person-facing delete: record comments are archived only with their Record or by a table move " +
    "(custom.table_move), and come back with the Record.",
  // ── rows a person can never archive themselves ─────────────────────────────────────────────
  "entity:kg_chunks":
    "The search index of a library document, never shown as an item: archived and restored only with its " +
    "document (rag.fn_delete_library_document / fn_restore_library_document, or its file's cascade).",
  "entity:workflow_run":
    "A run is history the engine writes; no screen or door archives a run (no archiver in the catalogue, " +
    "no client delete). The workflow itself is the Trash kind.",
  "entity:cx_user_request":
    "One request inside a conversation, never shown as an item: archived only with its conversation " +
    "(public.cx_soft_delete_conversation). The conversation is the Trash kind.",
  "entity:global_request":
    "The runtime spine's record of one request, never shown as an item: archived only with its " +
    "conversation (runtime.spine_soft_delete_conversation_requests). The conversation is the Trash kind.",
  "entity:hindsight_enrollment":
    "Written by the hindsight engine for a request under review; no screen or door archives one.",
  "entity:study_attempt":
    "An answer a learner gave, written by the study engine; no screen or door archives one (history, " +
    "never a thing a learner removes).",
  "entity:item_mastery":
    "Computed per learner and item by the study engine; no screen or door archives one.",
  "entity:notification_channel_preference":
    "A setting row, re-toggled rather than restored (TRASH-COVERAGE's notification_preference ruling); " +
    "no one archives a preference as a thing.",
  "entity:notification_event_override":
    "A setting row, re-toggled rather than restored (TRASH-COVERAGE's notification_preference ruling).",
  "entity:mandate_treatment":
    "Platform configuration of a mandate, written by the mandate system and its admin tools; no person " +
    "archives one from a screen.",
  "entity:mandate_binding":
    "Which agent serves a mandate — platform configuration rebound rather than restored; no person " +
    "archives one from a screen.",
  "entity:assist":
    "A notice the platform raised for a person; it is dismissed, snoozed or resolved (status / " +
    "suppressed_until), never archived by its reader.",
  "entity:integration_connection":
    "Disconnecting an integration revokes the provider's tokens; the way back is reconnecting with fresh " +
    "consent, never a restore of the old row.",
  "entity:hr_leave_policy":
    "No door archives a leave policy: HR ends one with hr.leave_policy_deactivate, which sets is_active " +
    "= false after deciding every balance on it (freeze / pay out / migrate). The one archived row is " +
    "the HRB-017 verification fixture (2026-08-28).",
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
    } else if (t.covered && t.orgCovered === false && !why) {
      out.push({
        door: t.thing,
        problem:
          `is in its owner's personal Trash but not in its organization's Trash${t.detail ? ` (${t.detail})` : ""}. ` +
          "Organization Trash (public._trash_kind_rows in organization mode, read by org_trash_list) must list " +
          "every row of the organization it lists for the person — an owner or admin restores members' removals there.",
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
