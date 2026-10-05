"use client";

/**
 * `store_change` — a change to an organization's tables, waiting for a person (lane VISION-REACH
 * W4, chair ruling 2026-10-03: "One approval queue. /approvals shows the store's work_approval
 * rows too. A decision happens only inside custom.work_approval_decide").
 *
 * 🚨 A VIEW OF THE STORE'S QUEUE, NEVER A SECOND ONE. The rows are `custom.record` rows with
 * `data_class = 'work_approval'`, read through `../store-door` (`custom.work_inbox` across every
 * organization the person belongs to, then `custom.work_approval_read` in the row's own
 * organization). Nothing is copied into `platform.assists`. Approve and Decline call
 * `decideRecordApproval` — the SAME function the chat's `RecordChangeApprovalCard` and the table
 * page's `HeldWritesOnTable` decide through — so `custom.work_approval_decide` applies the change
 * as the person deciding, stamps who and when, and History keeps it.
 *
 * What a row says: the change in the store's own terms (`waitFromQueueRow` + `approvalChangeFor`,
 * the chat card's reader, so the two screens describe one change the same way), the record as it
 * stands now beside the value it would get, who asked (the agent and the person it ran for, or
 * the colleague), when, and doors to the table, the record and the conversation.
 *
 * Mode 4 always: nothing applies until a person decides (the organization's knob
 * `custom.agent_schema_changes` decided that it waits; this row is the wait).
 */

import { useQuery, useQueryClient } from "@tanstack/react-query";
import { humanizeIdentifier } from "@ai-matrx/kit/text-case";

import AppLink from "@/components/navigation/AppLink";
import { EntityRef } from "@/components/official/entity-ref/EntityRef";
import { ChangeDiff, type ChangeFieldDiff } from "@/components/ui/change-diff";
import { openPath } from "@/lib/deep-link/openPath";
import { useAppSelector } from "@/lib/redux/hooks";
import { selectUserId } from "@/lib/redux/selectors/userSelectors";
import { decideRecordApproval } from "@/features/record-change-approvals/applyRecordChange";
import {
  approvalChangeFor,
  fieldTypeSentence,
  waitFromQueueRow,
} from "@/features/record-change-approvals/recordChangeApproval";
import { invalidateApprovals } from "../queryKeys";
import { listStoreApprovals, STORE_APPROVALS_PAGE, type StoreApproval } from "../store-door";
import type {
  ApprovalDecisions,
  ApprovalItem,
  ApprovalKind,
  ApprovalOutcome,
  ApprovalRowPlace,
  ApprovalSource,
} from "../types";

export const STORE_CHANGE_KIND_ID = "store_change";

/** The kind's own list. A sibling of the badge's key, settled together by `invalidateApprovals`. */
export const STORE_CHANGE_QUERY_KEY = ["approvals", STORE_CHANGE_KIND_ID] as const;

/**
 * The notification bell's record-store count (`features/notifications/useInbox.ts` → `workKey`),
 * spelled here because importing it would close a cycle through `../registry`. A decision here
 * changes that number too.
 */
const WORK_WAITING_QUERY_KEY = ["inbox", "work-waiting"] as const;

type StoreItem = ApprovalItem & { approvalId: string };

function text(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function record(value: unknown): Record<string, unknown> | null {
  return value !== null && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

/** A stored value in words — a choice's label, a list joined, never "[object Object]". */
function words(value: unknown): string | null {
  if (value === null || value === undefined) return null;
  if (typeof value === "string") return value;
  if (typeof value === "number" || typeof value === "boolean") return String(value);
  if (Array.isArray(value)) {
    const parts = value.map(words).filter((part): part is string => Boolean(part));
    return parts.length ? parts.join(", ") : null;
  }
  const object = record(value);
  if (object) {
    for (const key of ["label", "name", "title", "value", "text"]) {
      const said = words(object[key]);
      if (said) return said;
    }
    return JSON.stringify(object);
  }
  return String(value);
}

function humanKey(key: string): string {
  return humanizeIdentifier(key) || key;
}

/** Who asked, in words: "Intake agent for Dana Whitfield", or the colleague's name. */
function askedBy(approval: StoreApproval): string | null {
  const person = approval.inbox.requested_by_name ?? null;
  if (approval.inbox.origin !== "agent") return person;
  const agent = approval.conversation?.agentName ?? "An agent";
  return person ? `${agent} for ${person}` : agent;
}

/** The headline, the two effects and the diff — read from the row the store filed. */
function describe(approval: StoreApproval): Pick<
  ApprovalItem,
  "headline" | "acceptEffect" | "rejectEffect"
> & { fields: ChangeFieldDiff[] } | null {
  const row = approval.row;
  if (!row) return null;
  const change = record(row["change"]) ?? {};
  const kind = text(change["kind"]);
  const table = approval.inbox.table_name ?? "its table";
  const subject = text(row["subject_title"]) ?? "a record";
  const rejectEffect = "Nothing changes. The request is closed as declined.";

  // The four kinds the chat card already draws — described by ITS reader, so a change reads
  // the same on both screens.
  const wait = waitFromQueueRow(row);
  if (wait && wait.change.change === "field") {
    return {
      headline: `Add the column ${wait.change.label} to ${table}`,
      acceptEffect: `Adds ${wait.change.label} (${fieldTypeSentence(wait.change)}) to ${table}.`,
      rejectEffect,
      fields: approvalChangeFor(wait, { tableName: table }).fields,
    };
  }
  if (wait && wait.change.change === "records") {
    const n = wait.change.rows.length;
    const noun = n === 1 ? "record" : "records";
    return {
      headline: `Add ${n} ${noun} to ${table}`,
      acceptEffect: `Writes ${n} new ${noun} into ${table}.`,
      rejectEffect,
      fields: approvalChangeFor(wait, { tableName: table }).fields,
    };
  }
  if (wait && wait.change.change === "patch") {
    const patch = wait.change.patch;
    const current = approval.current;
    const fields: ChangeFieldDiff[] = Object.keys(patch)
      .filter((key) => !key.startsWith("_"))
      .map((key) => ({
        label: humanKey(key),
        // Before only when the record could be read; otherwise the row shows the new value alone.
        ...(current ? { before: words(current[key]) } : {}),
        after: words(patch[key]),
      }));
    return {
      headline: `Change ${subject} in ${table}`,
      acceptEffect: `Saves the new values on ${subject}.`,
      rejectEffect,
      fields,
    };
  }
  if (wait && wait.change.change === "delete") {
    return {
      headline: `Move ${subject} in ${table} to the trash`,
      acceptEffect: `Moves ${subject} to the trash. It can be put back.`,
      rejectEffect,
      fields: [],
    };
  }

  // Kinds the store queues that no card draws yet — described from the row itself.
  if (kind === "table_add") {
    const spec = record(change["table"]) ?? {};
    const name = text(spec["name"]) ?? "a new table";
    const columns = (Array.isArray(change["fields"]) ? change["fields"] : [])
      .map((f) => text(record(f)?.["label"]) ?? text(record(f)?.["name"]))
      .filter((label): label is string => Boolean(label));
    return {
      headline: `Create the table ${name}`,
      acceptEffect: `Creates ${name} in ${subject}.`,
      rejectEffect,
      fields: [
        { label: "Table", after: name },
        { label: "Columns", after: columns.length ? columns.join(", ") : null },
      ],
    };
  }
  if (kind === "record_restore") {
    return {
      headline: `Put back ${subject}`,
      acceptEffect: `Brings ${subject} back from the trash.`,
      rejectEffect,
      fields: [],
    };
  }
  if (kind === "doc_template_add") {
    const template = record(change["template"]) ?? {};
    const name = text(template["name"]) ?? "a document template";
    return {
      headline: `Save the template ${name} on ${table}`,
      acceptEffect: `Saves ${name} as a document template on ${table}.`,
      rejectEffect,
      fields: [{ label: "Template", after: name }],
    };
  }
  return null;
}

/** Doors to everything the row names — the table, the record, the conversation (THE DOOR LAW). */
function Doors({ approval }: { approval: StoreApproval }) {
  const row = approval.row ?? {};
  const subjectId = text(row["subject_id"]);
  const subjectKind = text(row["subject_kind"]);
  const tableId = approval.inbox.table_id ?? null;
  const conversation = approval.conversation;
  const link = "text-primary underline-offset-2 hover:underline";
  return (
    <span className="inline-flex flex-wrap items-center gap-x-3 gap-y-1">
      {tableId ? (
        <AppLink href={openPath(tableId)} className={link}>
          {approval.inbox.table_name ?? "Open the table"}
        </AppLink>
      ) : null}
      {subjectId && subjectKind === "record" ? (
        <AppLink href={openPath(subjectId)} className={link}>
          {text(row["subject_title"]) ?? "Open the record"}
        </AppLink>
      ) : null}
      {conversation ? (
        <EntityRef
          token="conversation"
          id={conversation.id}
          name={conversation.title ?? "Conversation"}
        />
      ) : null}
    </span>
  );
}

function toItem(approval: StoreApproval): StoreItem {
  const approvalId = approval.inbox.item_id;
  const key = `${STORE_CHANGE_KIND_ID}:${approvalId}`;
  const said = describe(approval);
  const proposedBy = askedBy(approval);
  const proposedAt = text(approval.row?.["requested_at"]) ?? approval.inbox.at;
  if (!said) {
    // HONEST, NEVER HIDDEN: a waiting row this build cannot describe is on screen with no
    // decision, because nobody could state what Approve would change.
    const kind = text(record(approval.row?.["change"])?.["kind"]);
    return {
      key,
      kindId: STORE_CHANGE_KIND_ID,
      approvalId,
      headline: approval.inbox.title || "A change this screen cannot show yet",
      acceptEffect: "Nothing — this screen cannot say what this would change.",
      rejectEffect: "Nothing — this screen cannot decide a change it cannot read.",
      mode: "unresolved",
      proposedBy,
      proposedAt,
      doors: <Doors approval={approval} />,
      unreadable: {
        sentence: approval.unreadable
          ? `This change could not be read: ${approval.unreadable}`
          : `This version of the app cannot show a "${kind ?? "unknown"}" change. Nothing was decided.`,
      },
    };
  }
  const note = text(approval.row?.["note"]);
  return {
    key,
    kindId: STORE_CHANGE_KIND_ID,
    approvalId,
    badge: approval.inbox.origin === "agent" ? "Agent change" : "Requested change",
    headline: said.headline,
    acceptEffect: said.acceptEffect,
    rejectEffect: said.rejectEffect,
    mode: "mode_4",
    proposedBy,
    proposedAt,
    doors: <Doors approval={approval} />,
    body:
      said.fields.length || note ? (
        <div className="flex flex-col gap-1.5">
          {note ? <p className="text-xs text-muted-foreground">{note}</p> : null}
          <ChangeDiff fields={said.fields} />
        </div>
      ) : undefined,
    ...(approval.row?.["may_decide"] === false
      ? {
          blocked: {
            reason: "This change is not yours to decide.",
            whoCan: "An owner or admin of the table decides it.",
          },
        }
      : {}),
  };
}

function useSource(): ApprovalSource {
  const userId = useAppSelector(selectUserId);
  const read = useQuery({
    queryKey: [...STORE_CHANGE_QUERY_KEY, userId],
    queryFn: () => listStoreApprovals(userId ?? ""),
    enabled: Boolean(userId),
    staleTime: 15_000,
  });
  const items = (read.data ?? []).map(toItem);
  const full = items.length >= STORE_APPROVALS_PAGE;
  return {
    items,
    total: items.length,
    loading: Boolean(userId) && read.isLoading,
    error: read.error,
    refetch: () => void read.refetch(),
    ...(full ? { moreHref: "/data", moreLabel: "Open your data inbox" } : {}),
  };
}

function useDecisions(): ApprovalDecisions {
  const queryClient = useQueryClient();
  const settle = () => {
    invalidateApprovals(queryClient, STORE_CHANGE_QUERY_KEY);
    void queryClient.invalidateQueries({ queryKey: WORK_WAITING_QUERY_KEY });
  };
  const decideAll = async (items: ApprovalItem[], approve: boolean): Promise<ApprovalOutcome> => {
    const outcome: ApprovalOutcome = { applied: 0, failures: [], alreadyDecided: [] };
    for (const item of items as StoreItem[]) {
      try {
        const answer = await decideRecordApproval(item.approvalId, approve);
        if (answer.status === "applied") outcome.applied += 1;
        else if (answer.status === "already") outcome.alreadyDecided!.push({ key: item.key, message: answer.detail });
        else outcome.failures.push({ key: item.key, message: answer.detail });
      } catch (error) {
        outcome.failures.push({
          key: item.key,
          message: error instanceof Error ? error.message : "The store did not answer.",
        });
      }
    }
    settle();
    return outcome;
  };
  return {
    acceptItems: (items) => decideAll(items, true),
    rejectItems: (items) => decideAll(items, false),
  };
}

/** This kind reads the record store's queue, never the assists ledger. */
const RENDERS_NO_LEDGER_ROW = () => false;
const PLACES_NO_LEDGER_ROW = (): ApprovalRowPlace | null => null;

export const storeChangeKind: ApprovalKind = {
  id: STORE_CHANGE_KIND_ID,
  rendersRow: RENDERS_NO_LEDGER_ROW,
  rowElsewhere: PLACES_NO_LEDGER_ROW,
  label: "Table change",
  accept: { label: "Approve", keepsReason: false },
  reject: { label: "Decline", keepsReason: false },
  useSource,
  useDecisions,
};
