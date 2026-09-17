"use client";

/**
 * `task_import` — Google tasks an agent wants to bring in as AI Matrx tasks.
 *
 * The import is idempotent by construction: a task already imported into this
 * organization is reported and left alone, never written twice. That is the
 * fact a person needs BEFORE they decide, so every row here carries its own
 * already-imported mark — and the one that is already here opens, through the
 * ordinary task door, so "already imported" can be checked instead of believed.
 *
 * Google Tasks itself is never changed: the import is one-way by scope and by
 * design, and the row says so.
 */

import { Check } from "lucide-react";
import { EntityRef } from "@/components/official/entity-ref/EntityRef";
import type { ApprovalKind, ApprovalScope } from "../types";
import {
  GOOGLE_OPERATOR_SCOPE,
  GOOGLE_REJECT_COPY,
  isJsonRecord,
  readArray,
  readString,
  useGoogleApprovalDecisions,
  useGoogleProposalSource,
  type GoogleKindContract,
  type GoogleProposalPayload,
} from "./google-proposal";

const KIND_ID = "task_import";
const PAYLOAD_KIND = "task_import_dry_run";

interface TaskRow {
  taskId: string;
  title: string;
  notes: string | null;
  dueAt: string | null;
  taskList: string | null;
  alreadyImported: boolean;
  /** The AI Matrx task it already became, when it has. */
  matrxTaskId: string | null;
}

function taskRows(payload: GoogleProposalPayload): TaskRow[] {
  return readArray(payload.preview, "tasks")
    .filter(isJsonRecord)
    .map((row) => ({
      taskId: readString(row, "task_id") ?? "",
      title: readString(row, "title") ?? "Untitled task",
      notes: readString(row, "notes"),
      dueAt: readString(row, "due_at"),
      taskList: readString(row, "task_list"),
      alreadyImported: row.already_imported === true,
      matrxTaskId: readString(row, "matrx_task_id"),
    }));
}

/** THE ONE COMPONENT for this kind: every task, and which are already here. */
function TaskImportList({ payload }: { payload: GoogleProposalPayload }) {
  const rows = taskRows(payload);
  const already = rows.filter((row) => row.alreadyImported);
  const listName = rows.find((row) => row.taskList)?.taskList ?? null;

  if (rows.length === 0) {
    return (
      <p className="text-xs text-muted-foreground">
        This proposal names no tasks, so approving it would import nothing.
        Reject it and ask for the import again.
      </p>
    );
  }

  return (
    <div className="space-y-2">
      <div className="divide-y divide-border overflow-hidden rounded-md border border-border">
        {rows.map((row) => (
          <div
            key={row.taskId || row.title}
            className="flex flex-col gap-1 px-3 py-2 sm:flex-row sm:items-start sm:justify-between sm:gap-3"
          >
            <div className="min-w-0">
              <p
                className={
                  row.alreadyImported
                    ? "break-words text-xs text-muted-foreground"
                    : "break-words text-xs font-medium text-foreground"
                }
              >
                {row.title}
              </p>
              {row.notes ? (
                <p className="mt-0.5 break-words text-[11px] text-muted-foreground">
                  {row.notes}
                </p>
              ) : null}
              {row.dueAt ? (
                <p className="mt-0.5 text-[11px] text-muted-foreground">
                  Due {row.dueAt}
                </p>
              ) : null}
            </div>
            {row.alreadyImported ? (
              <div className="flex shrink-0 items-center gap-1.5 text-[11px] text-muted-foreground">
                <Check className="h-3.5 w-3.5" aria-hidden />
                <span>Already here</span>
                {row.matrxTaskId ? (
                  <EntityRef
                    token="task"
                    id={row.matrxTaskId}
                    name="Open it"
                    showIcon={false}
                    openInNewTab
                  />
                ) : null}
              </div>
            ) : (
              <span className="shrink-0 text-[11px] text-muted-foreground">
                Would be created
              </span>
            )}
          </div>
        ))}
      </div>
      <p className="text-[11px] text-muted-foreground">
        {already.length} of {rows.length} already here and left alone;{" "}
        {rows.length - already.length} would be created
        {listName ? ` from “${listName}”` : ""}. Google Tasks is not changed.
      </p>
    </div>
  );
}

const contract: GoogleKindContract = {
  kindId: KIND_ID,
  payloadKind: PAYLOAD_KIND,
  describe: (payload) => {
    const rows = taskRows(payload);
    const already = rows.filter((row) => row.alreadyImported).length;
    const toCreate = rows.length - already;
    return {
      headline: `Import ${rows.length} task${rows.length === 1 ? "" : "s"} from Google Tasks`,
      acceptEffect: `Creates ${toCreate} task${toCreate === 1 ? "" : "s"} in your organization${already > 0 ? `, leaving the ${already} already imported alone` : ""}. Google Tasks is not changed.`,
      rejectEffect:
        "Imports nothing and leaves your tasks exactly as they are, with your reason kept on the proposal.",
      body: <TaskImportList payload={payload} />,
      // Doors live on the rows themselves: each already-imported task opens.
    };
  },
};

export const taskImportKind: ApprovalKind = {
  id: KIND_ID,
  label: "Task import",
  accept: { label: "Import them", keepsReason: false },
  reject: GOOGLE_REJECT_COPY,
  useSource: (scope: ApprovalScope) => useGoogleProposalSource(contract, scope),
  useDecisions: (scope: ApprovalScope) =>
    useGoogleApprovalDecisions(KIND_ID, scope),
  scopeRequirement: GOOGLE_OPERATOR_SCOPE,
};
