/**
 * THE RECORD STORE'S APPROVALS, read for `/approvals` (lane VISION-REACH W4, 2026-10-03).
 *
 * Chair ruling: ONE approval queue. A change an agent (or a colleague) asked to make to a table
 * waits as a `custom.record` row (`data_class = 'work_approval'`), and `/approvals` lists those
 * rows beside the assists the other kinds read. This module is the ONLY place the approvals
 * feature names the store's doors, and it only READS:
 *
 *   - `custom.work_inbox(NULL)` — what waits on THIS person, every organization they belong to
 *     (the active organization is never a list filter). Assignments are work, not decisions, and
 *     are left to the work inbox; `approval` and `proposal` rows are the queue's.
 *   - `custom.work_approval_read` — the change itself, in the organization the row lives in
 *     (asked of `resolveObjectOrganization`, never the selected organization).
 *
 * DECIDING IS NOT HERE. Every decision goes through `decideRecordApproval`
 * (`features/record-change-approvals/applyRecordChange.ts`) → `custom.work_approval_decide`, the
 * one door the chat card and the table page already use. Nothing in this feature writes approval
 * state.
 *
 * The badge counts with `countStoreApprovals` — the same `work_inbox` rows, the same filter — so
 * the number on the menu and the rows on the page are one predicate (`custom.inbox_counts` counts
 * those rows plus assignments).
 */

import { createRecordsClient, storeDoors, type WorkInboxItem } from "@ai-matrx/records/core";
import { sharedInboxRead } from "./sharedInbox";
import { personActor, recordsDataSource } from "@ai-matrx/records-ui";

import { createClient } from "@/utils/supabase/client";
import { resolveObjectOrganization } from "@/features/unified-data/objectOrganization";

/** How many waiting store approvals one read lists. The store's own default page ceiling. */
export const STORE_APPROVALS_PAGE = 200;

/** One waiting store approval, as `/approvals` draws it. */
export interface StoreApproval {
  /** The inbox row — title, who asked, the table, when. */
  inbox: WorkInboxItem;
  /** The organization the row lives in, or null when the store would not say. */
  organizationId: string | null;
  /** `custom.work_approval_read`'s answer, or null when it could not be read. */
  row: Record<string, unknown> | null;
  /** Why the row could not be read, in the store's words. */
  unreadable: string | null;
  /** The record a change patches, as it stands now — the "before" side. */
  current: Record<string, unknown> | null;
  /** The conversation the change was asked from, when the row names one and it can be read. */
  conversation: { id: string; title: string | null; agentName: string | null } | null;
}

function dataSource() {
  return recordsDataSource(createClient());
}

function text(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

/** The decisions in a person's inbox — never their assignments. */
function isDecision(item: WorkInboxItem): boolean {
  return item.kind === "approval" || item.kind === "proposal";
}

export { forgetWaitingWorkInbox } from "./sharedInbox";

/** Everything waiting on her, read once per page load (`sharedInbox.ts`). */
export function readWaitingWorkInbox(userId: string): Promise<WorkInboxItem[]> {
  return sharedInboxRead(userId, () => readWorkInboxOnce(userId));
}

async function waitingDecisions(userId: string): Promise<WorkInboxItem[]> {
  return (await readWaitingWorkInbox(userId)).filter((item) => isDecision(item) && item.actionable);
}

async function readWorkInboxOnce(userId: string): Promise<WorkInboxItem[]> {
  const client = createRecordsClient({
    dataSource: dataSource(),
    actor: personActor(userId),
    // ALL ORGANIZATIONS: `custom.work_inbox(NULL)` asks every organization the person belongs
    // to, each through its own wall.
    organizationId: null,
  });
  const answer = await client.workInbox({ limit: STORE_APPROVALS_PAGE, view: "inbox" });
  if (!answer.ok) {
    throw new Error(
      [answer.error.message, answer.error.hint].filter(Boolean).join(" ") ||
        "The record store did not list what is waiting on you.",
    );
  }
  return answer.data;
}

/** How many store approvals wait on this person — the badge's share. */
export async function countStoreApprovals(userId: string): Promise<number> {
  return (await waitingDecisions(userId)).length;
}

async function readOne(item: WorkInboxItem): Promise<StoreApproval> {
  const source = dataSource();
  const base: StoreApproval = {
    inbox: item,
    organizationId: null,
    row: null,
    unreadable: null,
    current: null,
    conversation: null,
  };
  const where = await resolveObjectOrganization(source, item.item_id);
  if (where.state !== "found") {
    return {
      ...base,
      unreadable:
        where.state === "unavailable"
          ? where.why
          : "The record store would not say which organization this change belongs to.",
    };
  }
  const organizationId = where.organizationId;
  const doors = storeDoors(createClient());
  const read = (await doors.rpc("work_approval_read", { p_organization_id: organizationId, p_approval_id: item.item_id })) as {
    data?: unknown;
    error?: { message?: string | null } | null;
  };
  if (read.error || !read.data || typeof read.data !== "object") {
    return {
      ...base,
      organizationId,
      unreadable: read.error?.message ?? "The change could not be read.",
    };
  }
  const row = read.data as Record<string, unknown>;
  const change = (row["change"] ?? {}) as Record<string, unknown>;

  // THE "BEFORE" SIDE of a change to a record's values: the record as it stands now, read under
  // the person's own rights. When it cannot be read the row says only what would be written.
  let current: Record<string, unknown> | null = null;
  const subjectId = text(row["subject_id"]);
  if (change["kind"] === "record_patch" && subjectId) {
    const doc = (await doors.rpc("read_record", { p_organization_id: organizationId, p_record_id: subjectId })) as {
      data?: unknown;
      error?: unknown;
    };
    if (!doc.error && doc.data && typeof doc.data === "object") {
      current = doc.data as Record<string, unknown>;
    }
  }
  return { ...base, organizationId, row, current };
}

/**
 * The conversations the rows were asked from, with the agent that ran each. Read under the
 * person's own rights: a conversation they cannot open names no agent and keeps its plain door.
 */
async function conversationsFor(
  ids: readonly string[],
): Promise<Map<string, { title: string | null; agentName: string | null }>> {
  const found = new Map<string, { title: string | null; agentName: string | null }>();
  if (ids.length === 0) return found;
  const supabase = createClient();
  const conversations = await supabase
    .schema("chat")
    .from("conversation")
    .select("id, title, initial_agent_id")
    .in("id", [...ids]);
  if (conversations.error || !conversations.data) return found;
  const agentIds = [
    ...new Set(
      conversations.data
        .map((c) => c.initial_agent_id as string | null)
        .filter((id): id is string => Boolean(id)),
    ),
  ];
  const names = new Map<string, string>();
  if (agentIds.length > 0) {
    const agents = await supabase.schema("agent").from("definition").select("id, name").in("id", agentIds);
    for (const agent of agents.data ?? []) {
      if (agent.name) names.set(agent.id as string, agent.name as string);
    }
  }
  for (const c of conversations.data) {
    found.set(c.id as string, {
      title: text(c.title),
      agentName: c.initial_agent_id ? (names.get(c.initial_agent_id as string) ?? null) : null,
    });
  }
  return found;
}

/** Every store approval waiting on this person, read in full. */
export async function listStoreApprovals(userId: string): Promise<StoreApproval[]> {
  const waiting = await waitingDecisions(userId);
  const read = await Promise.all(waiting.map((item) => readOne(item)));
  const conversationIds = [
    ...new Set(read.map((r) => text(r.row?.["conversation_id"])).filter((id): id is string => Boolean(id))),
  ];
  const conversations = await conversationsFor(conversationIds);
  return read.map((r) => {
    const id = text(r.row?.["conversation_id"]);
    if (!id) return r;
    const known = conversations.get(id);
    return { ...r, conversation: { id, title: known?.title ?? null, agentName: known?.agentName ?? null } };
  });
}
