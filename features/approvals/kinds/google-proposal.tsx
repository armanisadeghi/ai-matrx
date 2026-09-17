"use client";

/**
 * THE SHARED READER AND WRITER for every `google_workspace` proposal kind.
 *
 * Five of the six Google kinds carry the SAME payload shape, because the
 * producer builds it in one place: `{ __kind, preview, arguments }`, where
 * `preview` is the tool's own `dry_run` output verbatim
 * (`aidream/services/google_workspace/approvals.py` → `build_payload`: "the
 * tool already decided what a person needs to see; a second opinion here would
 * be a second renderer of the same change"). They also share ONE decision door
 * (`../google-door.ts`).
 *
 * So the reader, the narrowing and the writers live here ONCE, and each kind
 * module owns exactly what is genuinely its own: the sentences a person reads
 * and the ONE component that shows its dry run. Copying this hook five times
 * would be five places for the unreadable-payload case to be got wrong.
 *
 * 🚨 The preview is READ, never recomputed. A field this file cannot find is
 * missing from the row — it is reported as such, never filled in with a
 * plausible value.
 */

import { useQuery, useQueryClient } from "@tanstack/react-query";
import { ExternalLink } from "lucide-react";
import type { ReactNode } from "react";
import { useAppSelector } from "@/lib/redux/hooks";
import { selectUserId } from "@/lib/redux/selectors/userSelectors";
import type { Json } from "@/types/database.types";
import { listPendingProposals, type ApprovalProposal } from "../data";
import { applyGoogleApproval, rejectGoogleApproval } from "../google-door";
import type {
  ApprovalDecisions,
  ApprovalItem,
  ApprovalScope,
  ApprovalScopeRequirement,
  ApprovalSource,
} from "../types";

/** The `{ preview, arguments }` payload the producer writes for these kinds. */
export interface GoogleProposalPayload {
  __kind: string;
  /** The tool's `dry_run` output, verbatim. */
  preview: Record<string, Json>;
  /** The exact arguments Approve re-runs. */
  arguments: Record<string, Json>;
}

export function isJsonRecord(value: Json | undefined): value is {
  [key: string]: Json;
} {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/** A string field, or null when the row does not carry it. Never invented. */
export function readString(
  record: Record<string, Json> | undefined,
  key: string,
): string | null {
  const value = record?.[key];
  return typeof value === "string" && value.length > 0 ? value : null;
}

/** A number field, or null. A missing count is shown as unknown, never as 0. */
export function readNumber(
  record: Record<string, Json> | undefined,
  key: string,
): number | null {
  const value = record?.[key];
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

export function readRecord(
  record: Record<string, Json> | undefined,
  key: string,
): Record<string, Json> | null {
  const value = record?.[key];
  return isJsonRecord(value) ? value : null;
}

export function readArray(
  record: Record<string, Json> | undefined,
  key: string,
): Json[] {
  const value = record?.[key];
  return Array.isArray(value) ? value : [];
}

/** Rows of strings (`arguments.rows` on a sheet create). Cells are stringified. */
export function readGrid(value: Json | undefined): string[][] {
  if (!Array.isArray(value)) return [];
  const rows: string[][] = [];
  for (const row of value) {
    if (!Array.isArray(row)) continue;
    rows.push(
      row.map((cell) => (typeof cell === "string" ? cell : String(cell ?? ""))),
    );
  }
  return rows;
}

export function narrowGoogleProposalPayload(
  payload: Json,
  payloadKind: string,
): GoogleProposalPayload | null {
  if (!isJsonRecord(payload)) return null;
  if (payload.__kind !== payloadKind) return null;
  const preview = payload.preview;
  const args = payload.arguments;
  if (!isJsonRecord(preview)) return null;
  return {
    __kind: payloadKind,
    preview,
    arguments: isJsonRecord(args) ? args : {},
  };
}

/** One row, with the proposal and its narrowed payload kept on it. */
export interface GoogleProposalItem extends ApprovalItem {
  proposal: ApprovalProposal;
  payload: GoogleProposalPayload | null;
}

/** What a kind module supplies for one readable row. */
export interface GoogleProposalCopy {
  headline: string;
  acceptEffect: string;
  rejectEffect: string;
  body: ReactNode;
  /** Doors for every identity the row names (the Google file, a Matrx record). */
  doors?: ReactNode;
  /**
   * Set when this row's Approve would do NOTHING — a task import naming no
   * tasks, a contact carrying no fields, an append with no text. A click that
   * would silently do nothing has to say so, so the row offers only Reject
   * instead of a button whose receipt would read "changed 0 things".
   */
  blocked?: { reason: string; whoCan: string };
}

export interface GoogleKindContract {
  /** Registry id, e.g. `document_append`. Also the producer's proposal kind. */
  kindId: string;
  /** The payload marker, e.g. `document_append_dry_run`. */
  payloadKind: string;
  /** The sentences and the ONE component that shows this kind's dry run. */
  describe: (
    payload: GoogleProposalPayload,
    proposal: ApprovalProposal,
  ) => GoogleProposalCopy;
}

export function googleQueryKey(kindId: string): readonly string[] {
  return ["approvals", kindId];
}

/**
 * THE reader for one Google kind: this person's pending proposals of that kind,
 * each already narrowed and described.
 *
 * A payload this build cannot read is NOT dropped and NOT rendered blank — the
 * row appears, says so in words, and offers only Reject. Silently hiding a
 * proposal is the failure this whole queue exists to end.
 */
export function useGoogleProposalSource(
  contract: GoogleKindContract,
  scope: ApprovalScope,
): ApprovalSource {
  const viewerId = useAppSelector(selectUserId);
  const userId = scope.userId ?? viewerId;
  const client = useQueryClient();
  const key = googleQueryKey(contract.kindId);

  const pending = useQuery({
    queryKey: [...key, userId],
    queryFn: () => listPendingProposals(userId ?? "", contract.kindId),
    enabled: Boolean(userId),
    staleTime: 30_000,
  });

  const refetch = () => {
    void pending.refetch();
    void client.invalidateQueries({ queryKey: key });
  };

  const items: GoogleProposalItem[] = (pending.data?.proposals ?? []).map(
    (proposal) => {
      const payload = narrowGoogleProposalPayload(
        proposal.payload,
        contract.payloadKind,
      );
      const base = {
        key: `${contract.kindId}:${proposal.assist.id}`,
        kindId: contract.kindId,
        proposal,
        payload,
        mode: proposal.mode,
        autoApplyAt: proposal.autoApplyAt,
        proposedBy: proposal.proposerLabel,
        proposedAt: proposal.assist.createdAt,
        blocked: proposal.blocked,
      };
      if (!payload) {
        return {
          ...base,
          headline: proposal.assist.title,
          acceptEffect: "Nothing — this proposal cannot be read.",
          rejectEffect:
            "Records it as rejected so it stops waiting on you. Nothing in Google changes.",
          blocked: {
            reason:
              "This proposed change was written in a shape this queue does not recognise, so it cannot be shown or applied.",
            whoCan:
              "Reject it and ask for the change again; the agent that proposed it needs fixing.",
          },
        } satisfies GoogleProposalItem;
      }
      const copy = contract.describe(payload, proposal);
      return {
        ...base,
        headline: copy.headline,
        acceptEffect: copy.acceptEffect,
        rejectEffect: copy.rejectEffect,
        // `body`, not `individualReview`: the dry run is always on screen AND
        // the row stays selectable, so "approve all" remains a real choice.
        body: copy.body,
        ...(copy.doors ? { doors: copy.doors } : {}),
        // The producer's own `blocked` (this is not yours to approve) outranks
        // the kind's (this would do nothing): the first is about authority.
        ...(proposal.blocked ? {} : copy.blocked ? { blocked: copy.blocked } : {}),
      } satisfies GoogleProposalItem;
    },
  );

  return {
    items,
    total: pending.data?.total ?? items.length,
    loading: pending.isLoading,
    error: pending.error,
    refetch,
  };
}

/**
 * THE writers, for every Google kind: the server door, once per item.
 *
 * Nothing is written from the browser and no decision is recorded here — the
 * door claims the row, re-runs the stored action through the tool's own
 * handler and stores the receipt in one place. A per-item failure is collected,
 * never thrown: one refused proposal must not sink the rest of a batch.
 */
export function useGoogleApprovalDecisions(
  kindId: string,
  scope: ApprovalScope,
): ApprovalDecisions {
  const viewerId = useAppSelector(selectUserId);
  const userId = scope.userId ?? viewerId;
  const client = useQueryClient();
  const invalidate = () =>
    void client.invalidateQueries({
      queryKey: [...googleQueryKey(kindId), userId],
    });

  const decide = async (
    items: ApprovalItem[],
    run: (proposalId: string) => Promise<unknown>,
  ) => {
    const failures: { key: string; message: string }[] = [];
    let applied = 0;
    for (const item of items) {
      const row = item as GoogleProposalItem;
      try {
        await run(row.proposal.assist.id);
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
  };

  return {
    acceptItems: async (items) =>
      decide(items, (proposalId) => applyGoogleApproval(proposalId)),
    rejectItems: async (items, reason) =>
      decide(items, (proposalId) => rejectGoogleApproval(proposalId, reason)),
  };
}

/**
 * Every Google proposal is addressed to ONE PERSON — the operator whose Google
 * connection the change would use, and the only person the server lets apply it
 * (`_authorize` in the producer). A site-scoped mount must therefore not repeat
 * them: the marketing console mounts a queue per site, and without this each
 * site would show the same rows and multiply the waiting count.
 */
export const GOOGLE_OPERATOR_SCOPE: ApprovalScopeRequirement = {
  field: "userId",
  explain:
    "a change to one of your Google files, or an import into your records, waits with the person it is addressed to, not with a website.",
  where: { label: "Open what is waiting on you", href: "/approvals" },
};

/**
 * THE DECISION COPY every Google kind shares, and WHY Approve keeps no reason.
 *
 * The apply door takes the approval id and nothing else — there is no field on
 * it for a note, so asking for one and dropping it would be the screen lying
 * (THE NO-SILENT-FAILURE LAW; `ApprovalDecisionCopy.keepsReason` exists for
 * exactly this). Reject does keep it: `RejectApprovalRequest.reason` is stored
 * as the row's `decision_note`.
 */
export const GOOGLE_REJECT_COPY = {
  label: "Leave it alone",
  keepsReason: true,
  reasonPrompt: "Why not? (kept on the record)",
} as const;

/**
 * The door to the file itself, when the dry run carried one.
 *
 * THE DOOR LAW: a row that names a person's Google Doc must let them open it —
 * reading the document before approving a change to it is the normal case. It
 * is an external link and always a new tab: losing the queue to look at the
 * file is exactly the data loss the new-tab door exists to prevent. When the
 * preview carries no link the control is ABSENT (never a dead one).
 */
export function OpenInGoogle({
  href,
  label,
}: {
  href: string | null;
  label: string;
}) {
  if (!href) return null;
  return (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      className="inline-flex items-center gap-1 rounded-md px-1.5 py-1 text-xs font-medium text-primary hover:bg-primary/10"
    >
      {label}
      <ExternalLink className="h-3.5 w-3.5" aria-hidden />
    </a>
  );
}
