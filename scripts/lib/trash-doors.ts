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
