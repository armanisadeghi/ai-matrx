"use client";

/**
 * `sheet_write` — a range an agent wants to write into a Google Sheet, with the
 * cells it would replace, waiting for someone who may edit that Sheet.
 *
 * The item body is the DRY RUN the tool already produced: the cells as they are
 * now beside the cells as they would be. Nothing here computes a diff of its own
 * — the proposer's `write_sheet` dry_run result is the record, and inventing a
 * second version of it in the browser would let the screen and the write
 * disagree.
 *
 * 🚨 Approve replays the ORDINARY HUMAN WRITE PATH: `writeGoogleSheet` from
 * `features/google-workspace/service.ts` — the same call the person makes by
 * editing the grid. This kind has no writer of its own, so an approved write is
 * indistinguishable from a person making it.
 *
 * Mode: `hitl.google.unattended_file_write` for a workflow or schedule (default
 * mode 4) and `hitl.google.attended_file_write` when the person asked in the
 * moment (default mode 1 — such a write never lands here at all). The mode is
 * resolved by the PROPOSER before the row is written (`../mode.ts`, which
 * refuses rather than guessing); the row states which mode it ran in and the
 * queue prints it.
 */

import { useQuery, useQueryClient } from "@tanstack/react-query";
import { EntityRef } from "@/components/official/entity-ref/EntityRef";
import { writeGoogleSheet } from "@/features/google-workspace/service";
import { useAppSelector } from "@/lib/redux/hooks";
import { selectUserId } from "@/lib/redux/selectors/userSelectors";
import type { Json } from "@/types/database.types";
import {
  listPendingProposals,
  recordApprovalDecision,
  type ApprovalProposal,
} from "../data";
import type {
  ApprovalDecisions,
  ApprovalItem,
  ApprovalKind,
  ApprovalScope,
  ApprovalSource,
} from "../types";

const KIND_ID = "sheet_write";
const QUERY_KEY = ["approvals", KIND_ID] as const;

/** The dry-run result, as the tool emits it. Carries its `__kind` marker. */
export const SHEET_WRITE_PAYLOAD_KIND = "sheet_write_dry_run";

export interface SheetWritePayload {
  __kind: typeof SHEET_WRITE_PAYLOAD_KIND;
  connectionId: string;
  fileId: string;
  /** The Sheet's name, written at propose time so the row needs no read. */
  fileLabel: string | null;
  /** A1 range, e.g. "Sheet1!B2:D40". */
  rangeA1: string;
  /** The cells as they would be. */
  values: string[][];
  /** The cells as they were when the dry run ran. */
  before: string[][];
}

function isRecord(value: Json): value is { [key: string]: Json } {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function grid(value: Json | undefined): string[][] | null {
  if (!Array.isArray(value)) return null;
  const rows: string[][] = [];
  for (const row of value) {
    if (!Array.isArray(row)) return null;
    rows.push(row.map((cell) => (typeof cell === "string" ? cell : String(cell ?? ""))));
  }
  return rows;
}

export function narrowSheetWritePayload(
  payload: Json,
): SheetWritePayload | null {
  if (!isRecord(payload)) return null;
  if (payload.__kind !== SHEET_WRITE_PAYLOAD_KIND) return null;
  const { connectionId, fileId, rangeA1 } = payload;
  const values = grid(payload.values);
  const before = grid(payload.before);
  if (
    typeof connectionId !== "string" ||
    typeof fileId !== "string" ||
    typeof rangeA1 !== "string" ||
    values === null ||
    before === null
  ) {
    return null;
  }
  return {
    __kind: SHEET_WRITE_PAYLOAD_KIND,
    connectionId,
    fileId,
    fileLabel: typeof payload.fileLabel === "string" ? payload.fileLabel : null,
    rangeA1,
    values,
    before,
  };
}

/** How many cells actually change — the sentence's number, computed once. */
function changedCells(payload: SheetWritePayload): number {
  let changed = 0;
  const rows = Math.max(payload.values.length, payload.before.length);
  for (let row = 0; row < rows; row += 1) {
    const next = payload.values[row] ?? [];
    const previous = payload.before[row] ?? [];
    const columns = Math.max(next.length, previous.length);
    for (let column = 0; column < columns; column += 1) {
      if ((next[column] ?? "") !== (previous[column] ?? "")) changed += 1;
    }
  }
  return changed;
}

/** Before beside after, bounded — the whole point of a dry run is seeing it. */
function CellDiff({ payload }: { payload: SheetWritePayload }) {
  const rows = Math.max(payload.values.length, payload.before.length);
  const shown = Math.min(rows, 12);
  return (
    <div className="space-y-1">
      <div className="overflow-x-auto rounded-md border border-border">
        <table className="w-full text-[11px]">
          <thead>
            <tr className="border-b border-border bg-muted/40 text-left">
              <th className="px-2 py-1 font-medium text-muted-foreground">
                Row
              </th>
              <th className="px-2 py-1 font-medium text-muted-foreground">
                Now in Google
              </th>
              <th className="px-2 py-1 font-medium text-muted-foreground">
                After this change
              </th>
            </tr>
          </thead>
          <tbody>
            {Array.from({ length: shown }, (_, row) => {
              const previous = (payload.before[row] ?? []).join(" | ");
              const next = (payload.values[row] ?? []).join(" | ");
              const same = previous === next;
              return (
                <tr key={row} className="border-b border-border last:border-0">
                  <td className="px-2 py-1 align-top text-muted-foreground">
                    {row + 1}
                  </td>
                  <td className="max-w-[18rem] break-words px-2 py-1 align-top text-muted-foreground">
                    {previous || <span className="italic">empty</span>}
                  </td>
                  <td
                    className={
                      same
                        ? "max-w-[18rem] break-words px-2 py-1 align-top text-muted-foreground"
                        : "max-w-[18rem] break-words px-2 py-1 align-top font-medium text-foreground"
                    }
                  >
                    {next || <span className="italic">cleared</span>}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      {rows > shown ? (
        <p className="text-[11px] text-muted-foreground">
          Showing the first {shown} of {rows} rows in this range. Approving
          writes every row in it.
        </p>
      ) : null}
    </div>
  );
}

interface SheetItem extends ApprovalItem {
  proposal: ApprovalProposal;
  payload: SheetWritePayload | null;
}

function useSource(scope: ApprovalScope): ApprovalSource {
  const viewerId = useAppSelector(selectUserId);
  const userId = scope.userId ?? viewerId;
  const client = useQueryClient();

  const pending = useQuery({
    queryKey: [...QUERY_KEY, userId],
    queryFn: () => listPendingProposals(userId ?? "", KIND_ID),
    enabled: Boolean(userId),
    staleTime: 30_000,
  });

  const refetch = () => {
    void pending.refetch();
    void client.invalidateQueries({ queryKey: QUERY_KEY });
  };

  const items: SheetItem[] = (pending.data?.proposals ?? []).map((proposal) => {
    const payload = narrowSheetWritePayload(proposal.payload);
    const base = {
      key: `${KIND_ID}:${proposal.assist.id}`,
      kindId: KIND_ID,
      proposal,
      payload,
      mode: proposal.mode,
      autoApplyAt: proposal.autoApplyAt,
      proposedBy: proposal.proposerLabel,
      proposedAt: proposal.assist.createdAt,
      blocked: proposal.blocked,
      doors: proposal.subject ? (
        <EntityRef
          token={proposal.subject.token}
          id={proposal.subject.id}
          name={payload?.fileLabel ?? proposal.assist.title}
        />
      ) : undefined,
    };

    if (!payload) {
      return {
        ...base,
        headline: proposal.assist.title,
        acceptEffect: "Nothing — this proposal cannot be read.",
        rejectEffect: "Records it as rejected so it stops waiting on you.",
        blocked: {
          reason:
            "This proposed change was written in a shape this queue does not recognise, so it cannot be reviewed or applied.",
          whoCan:
            "Reject it and ask for it again; the agent that wrote it needs fixing.",
        },
      } satisfies SheetItem;
    }

    const where = payload.fileLabel
      ? `${payload.fileLabel} · ${payload.rangeA1}`
      : payload.rangeA1;
    const changed = changedCells(payload);
    return {
      ...base,
      headline: `Write ${changed} cell${changed === 1 ? "" : "s"} in ${where}`,
      acceptEffect: `Writes ${payload.rangeA1} in Google Sheets, replacing what is there now. Google keeps its own version history; we do not undo it for you.`,
      rejectEffect:
        "Leaves the Sheet exactly as it is and records the proposal as rejected with your reason.",
      // `body`, not `individualReview`: the diff is always on screen AND the
      // row stays selectable, so "approve all" is a real choice (the system has
      // no opinion which way a person works).
      body: <CellDiff payload={payload} />,
    } satisfies SheetItem;
  });

  return {
    items,
    total: pending.data?.total ?? items.length,
    loading: pending.isLoading,
    error: pending.error,
    refetch,
  };
}

function useDecisions(scope: ApprovalScope): ApprovalDecisions {
  const viewerId = useAppSelector(selectUserId);
  const userId = scope.userId ?? viewerId;
  const client = useQueryClient();
  const invalidate = () =>
    void client.invalidateQueries({ queryKey: [...QUERY_KEY, userId] });

  return {
    acceptItems: async (items, reason) => {
      const failures: { key: string; message: string }[] = [];
      let applied = 0;
      for (const item of items) {
        const row = item as SheetItem;
        if (!row.payload) {
          failures.push({
            key: item.key,
            message:
              "This proposal cannot be read, so nothing was written. Reject it instead.",
          });
          continue;
        }
        try {
          // THE ordinary human write path — the same call the grid makes.
          const result = await writeGoogleSheet(
            row.payload.connectionId,
            row.payload.fileId,
            row.payload.rangeA1,
            row.payload.values,
          );
          // The decision is recorded only AFTER Google confirmed the write, and
          // it carries what Google returned: a row never claims a change that
          // did not land.
          await recordApprovalDecision(
            row.proposal.assist.id,
            "approved",
            reason,
            result as unknown as Json,
          );
          applied += 1;
        } catch (error) {
          failures.push({
            key: item.key,
            message: error instanceof Error ? error.message : String(error),
          });
        }
      }
      invalidate();
      return { applied, failures };
    },
    rejectItems: async (items, reason) => {
      const failures: { key: string; message: string }[] = [];
      let applied = 0;
      for (const item of items) {
        try {
          await recordApprovalDecision(
            (item as SheetItem).proposal.assist.id,
            "rejected",
            reason,
          );
          applied += 1;
        } catch (error) {
          failures.push({
            key: item.key,
            message: error instanceof Error ? error.message : String(error),
          });
        }
      }
      invalidate();
      return { applied, failures };
    },
  };
}

export const sheetWriteKind: ApprovalKind = {
  id: KIND_ID,
  label: "Spreadsheet change",
  accept: {
    label: "Write it",
    keepsReason: true,
    reasonPrompt: "Any note for the record? (kept on the approval)",
  },
  reject: {
    label: "Leave it alone",
    keepsReason: true,
    reasonPrompt: "Why not? (kept on the record)",
  },
  useSource,
  useDecisions,
  /**
   * These rows are addressed to ONE PERSON (the operator), so a site-scoped
   * mount must not repeat them: the marketing console mounts a queue per site,
   * and without this every site would show the same drafts and the waiting count
   * would be multiplied by the number of sites (Bugbot HIGH #3, 2026-09-17).
   */
  scopeRequirement: {
    field: "userId",
    explain:
      "an email or a spreadsheet change waits with the person it is addressed to, not with a website.",
    where: { label: "Open what is waiting on you", href: "/approvals" },
  },
};
