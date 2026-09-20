"use client";

/**
 * `cms_content_exception` — somebody wants content a CMS safety rule BLOCKED to
 * be allowed, from now on, in a named scope.
 *
 * 🚨 THIS IS A STANDING POLICY, NOT A ONE-TIME PASS, and the copy on the row
 * says so in those words. An approved exception is stored in the CMS product
 * database and consulted by eight CMS write paths on EVERY future validation
 * (`aidream/services/cms/exceptions_store.py` → `approved_exceptions`), so
 * "Approve" here is closer to changing a setting than to letting one edit
 * through — exactly the kind of click the destructive-and-expensive-actions
 * policy says must name its consequence before it runs.
 *
 * It replaced a bespoke CMS review screen (chair ruling, 2026-09-19, register
 * row Q-1): queue number two, with no mode line, no receipt, no doors and no
 * consequence sentence, whose Approve wrote the CMS columns straight from the
 * browser. The screen, its service block and its Next.js route are deleted; the
 * substance of its violation card lives on below as this kind's `body`.
 *
 * 🚨 WHY `body` AND NOT `individualReview`. `individualReview` means "the node
 * IS the authorization" — the queue then renders NO Approve button and expects
 * the node to carry its own (the Gmail review card's Send). This card carries
 * no control: the decision is the queue's Approve / Reject through the ONE
 * server door. Putting it in `individualReview` would leave the row unapprovable
 * — a dead screen. As `body` the violation is always on screen AND the row stays
 * batchable, which is what every Google kind does with its dry run.
 *
 * 🚨 ALWAYS MODE 4, and the row prints whatever the producer wrote rather than
 * asserting it — a proposal claiming another mode is shown as the defect it is,
 * never quietly corrected. The server refuses to write anything else
 * (`aidream/services/cms/exception_proposals.py` → `PROPOSAL_MODE`), and there
 * is deliberately no knob: an organization that could auto-approve its own
 * content-safety escape hatch would not have one.
 */

import { useQuery, useQueryClient } from "@tanstack/react-query";
import AppLink from "@/components/navigation/AppLink";
import { useAppSelector } from "@/lib/redux/hooks";
import { selectUserId } from "@/lib/redux/selectors/userSelectors";
import { Badge } from "@/components/ui/badge";
import { cmsPageEditorHref, cmsSiteHref } from "@/features/cms/utils/cmsRoutes";
import type { Json } from "@/types/database.types";
import { approveCmsException, rejectCmsException } from "../cms-door";
import { listPendingProposals, type ApprovalProposal } from "../data";
import { invalidateApprovals } from "../queryKeys";
import {
  readApprovalReceipt,
  readDecisionReply,
  receiptRowMarks,
} from "../receipt";
import type {
  ApprovalDecisions,
  ApprovalItem,
  ApprovalKind,
  ApprovalScope,
  ApprovalSource,
} from "../types";
import { unrenderableApprovalItems } from "../unshowable";
import { isJsonRecord, readString } from "./google-proposal";

const KIND_ID = "cms_content_exception";
/** The producer's `__kind` on the payload, byte for byte. */
const PAYLOAD_KIND = "cms_content_exception_review";

/** The exception, exactly as the CMS row holds it. Nothing is computed here. */
interface ExceptionPayload {
  exceptionId: string;
  ruleId: string | null;
  severity: string | null;
  nodePath: string | null;
  excerpt: string | null;
  fixHint: string | null;
  note: string | null;
  siteId: string | null;
  pageId: string | null;
  nodePathPrefix: string | null;
  excerptContains: string | null;
  siteLabel: string | null;
  pageLabel: string | null;
}

function narrowPayload(payload: Json): ExceptionPayload | null {
  if (!isJsonRecord(payload)) return null;
  if (payload.__kind !== PAYLOAD_KIND) return null;
  const exceptionId = readString(payload, "exception_id");
  if (!exceptionId) return null;
  return {
    exceptionId,
    ruleId: readString(payload, "rule_id"),
    severity: readString(payload, "severity"),
    nodePath: readString(payload, "node_path"),
    excerpt: readString(payload, "excerpt"),
    fixHint: readString(payload, "fix_hint"),
    note: readString(payload, "note"),
    siteId: readString(payload, "scope_site_id"),
    pageId: readString(payload, "scope_page_id"),
    nodePathPrefix: readString(payload, "match_node_path_prefix"),
    excerptContains: readString(payload, "match_excerpt_contains"),
    siteLabel: readString(payload, "site_label"),
    pageLabel: readString(payload, "page_label"),
  };
}

/** WHERE this rule would stop blocking, in the reader's words. */
function scopeSentence(payload: ExceptionPayload): string {
  const where = payload.pageId
    ? `the page ${payload.pageLabel ?? payload.pageId}`
    : payload.siteId
      ? `the site ${payload.siteLabel ?? payload.siteId}`
      : "EVERY site and page";
  const narrowing = [
    payload.nodePathPrefix ? `only under ${payload.nodePathPrefix}` : null,
    payload.excerptContains
      ? `only where the content contains “${payload.excerptContains}”`
      : null,
  ].filter(Boolean);
  return narrowing.length > 0
    ? `${where} (${narrowing.join(", ")})`
    : where;
}

/** THE ONE COMPONENT for this kind: what was blocked, and how it was fixed. */
function BlockedContent({ payload }: { payload: ExceptionPayload }) {
  return (
    <div className="space-y-2">
      <div className="flex flex-wrap items-center gap-2">
        <Badge variant="outline" className="font-mono text-[10px]">
          {payload.ruleId ?? "an unnamed rule"}
        </Badge>
        {payload.severity ? (
          <Badge
            variant={payload.severity === "block" ? "destructive" : "secondary"}
            className="text-[10px]"
          >
            {payload.severity}
          </Badge>
        ) : null}
        {payload.nodePath ? (
          <span className="font-mono text-[10px] text-muted-foreground">
            {payload.nodePath}
          </span>
        ) : null}
      </div>
      {payload.excerpt ? (
        <pre className="overflow-x-auto whitespace-pre-wrap break-words rounded bg-muted/40 p-2 font-mono text-[11px] text-foreground">
          {payload.excerpt}
        </pre>
      ) : (
        <p className="text-xs text-muted-foreground">
          The request does not carry the content that was blocked, so this screen
          cannot show it — only the rule and the scope below.
        </p>
      )}
      {payload.fixHint ? (
        <p className="text-xs text-muted-foreground">
          What the rule suggests instead: {payload.fixHint}
        </p>
      ) : null}
      {payload.note ? (
        <p className="text-xs text-muted-foreground">
          Why it was asked for: {payload.note}
        </p>
      ) : null}
      <p className="text-[11px] text-muted-foreground">
        Approving stops this rule blocking matching content on {scopeSentence(payload)} —
        for every future edit, not just this one.
      </p>
    </div>
  );
}

/** THE DOOR LAW: every record this row names opens. */
function ExceptionDoors({ payload }: { payload: ExceptionPayload }) {
  if (!payload.siteId) return null;
  return (
    <div className="flex flex-wrap items-center gap-2">
      <AppLink
        href={cmsSiteHref(payload.siteId)}
        className="text-xs font-medium text-primary underline-offset-2 hover:underline"
      >
        Open {payload.siteLabel ?? "the site"}
      </AppLink>
      {payload.pageId ? (
        <AppLink
          href={cmsPageEditorHref(payload.siteId, payload.pageId, "code")}
          className="text-xs font-medium text-primary underline-offset-2 hover:underline"
        >
          Open {payload.pageLabel ?? "the page"}
        </AppLink>
      ) : null}
    </div>
  );
}

interface CmsExceptionItem extends ApprovalItem {
  proposal: ApprovalProposal;
  payload: ExceptionPayload | null;
}

function queryKey(): readonly string[] {
  return ["approvals", KIND_ID];
}

function useSource(scope: ApprovalScope): ApprovalSource {
  const viewerId = useAppSelector(selectUserId);
  const userId = scope.userId ?? viewerId;
  const client = useQueryClient();
  const key = queryKey();

  const pending = useQuery({
    queryKey: [...key, userId],
    queryFn: () =>
      listPendingProposals(userId ?? "", cmsContentExceptionKind, scope),
    enabled: Boolean(userId),
    staleTime: 30_000,
  });

  const items: CmsExceptionItem[] = (pending.data?.proposals ?? []).map(
    (proposal) => {
      const payload = narrowPayload(proposal.payload);
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
        expired: proposal.expired,
        ...receiptRowMarks(proposal.assist.result),
      };
      if (!payload) {
        // A payload this build cannot read is NOT dropped and NOT rendered
        // blank: the row says so and offers only Reject.
        return {
          ...base,
          headline: proposal.assist.title,
          acceptEffect: "Nothing — this request cannot be read.",
          rejectEffect:
            "Records it as rejected so it stops waiting on you. The content stays blocked.",
          blocked: {
            reason:
              "This exception request was written in a shape this queue does not recognise, so it cannot be shown or approved.",
            whoCan:
              "Reject it and ask for the exception again; whatever filed it needs fixing.",
          },
        } satisfies CmsExceptionItem;
      }
      const where = scopeSentence(payload);
      return {
        ...base,
        headline: `Allow “${payload.ruleId ?? "a content rule"}” on ${where}`,
        acceptEffect: `Future content matching “${payload.ruleId ?? "this rule"}” on ${where} stops being blocked — this becomes a standing rule, not a one-time pass. It stays in force until somebody removes it.`,
        rejectEffect:
          "The content stays blocked and nothing changes. Your reason is kept on the record.",
        body: <BlockedContent payload={payload} />,
        ...(payload.siteId ? { doors: <ExceptionDoors payload={payload} /> } : {}),
      } satisfies CmsExceptionItem;
    },
  );

  return {
    items: [
      ...items,
      ...unrenderableApprovalItems(KIND_ID, pending.data?.unrenderable ?? []),
    ],
    total: pending.data?.total ?? items.length,
    loading: pending.isLoading,
    error: pending.error,
    refetch: () => {
      void pending.refetch();
      void client.invalidateQueries({ queryKey: key });
    },
  };
}

/**
 * THE writers: the server door, once per item — never a browser write and never
 * a decision recorded here (the door already recorded it, with evidence).
 *
 * The reply is READ, not assumed: the door is idempotent, so a second approve
 * returns the first call's receipt with `applied_now: false`, and a request
 * somebody already rejected answers an approve just as quietly. `readDecisionReply`
 * is the ONE adapter both doors' replies come through, so approve and reject can
 * never tell a person opposite facts about the same row.
 */
function useDecisions(scope: ApprovalScope): ApprovalDecisions {
  const viewerId = useAppSelector(selectUserId);
  const userId = scope.userId ?? viewerId;
  const client = useQueryClient();
  const invalidate = () =>
    invalidateApprovals(client, [...queryKey(), userId]);

  const decide = async (
    items: ApprovalItem[],
    run: (exceptionId: string) => Promise<{
      status: string;
      applied_now: boolean;
      receipt: Record<string, unknown>;
      sentence: string | null;
    }>,
    decision: "accept" | "reject",
  ) => {
    const failures: { key: string; message: string }[] = [];
    const alreadyDecided: { key: string; message: string }[] = [];
    const unconfirmed: { key: string; message: string }[] = [];
    let applied = 0;
    for (const item of items) {
      const row = item as CmsExceptionItem;
      if (!row.payload) {
        failures.push({
          key: item.key,
          message:
            "This request could not be read, so nothing was sent to the server and nothing changed.",
        });
        continue;
      }
      try {
        const reply = await run(row.payload.exceptionId);
        const reading = readDecisionReply({
          status: reply.status,
          appliedNow: reply.applied_now,
          receipt: readApprovalReceipt(reply.receipt),
          decision,
          what: row.headline,
          serverSentence: reply.sentence,
        });
        if (reading.bucket === "performed") {
          applied += 1;
        } else if (reading.bucket === "failed") {
          failures.push({ key: item.key, message: reading.message ?? "" });
        } else if (reading.bucket === "unconfirmed") {
          unconfirmed.push({ key: item.key, message: reading.message ?? "" });
        } else {
          alreadyDecided.push({ key: item.key, message: reading.message ?? "" });
        }
      } catch (error) {
        failures.push({
          key: item.key,
          message: error instanceof Error ? error.message : String(error),
        });
      }
    }
    invalidate();
    return { applied, failures, alreadyDecided, unconfirmed };
  };

  return {
    acceptItems: async (items) =>
      decide(
        items,
        (exceptionId) => approveCmsException(exceptionId, scope.organizationId),
        "accept",
      ),
    rejectItems: async (items, reason) =>
      decide(
        items,
        (exceptionId) =>
          rejectCmsException(exceptionId, scope.organizationId, reason),
        "reject",
      ),
  };
}

export const cmsContentExceptionKind: ApprovalKind = {
  id: KIND_ID,
  label: "Content exception",
  /**
   * "Allow it" rather than "Approve": the person is granting a standing
   * permission, and the button should read like what it does. Approve keeps no
   * reason — the door takes the id and nothing else, and inviting a note that is
   * then dropped is the screen lying (THE NO-SILENT-FAILURE LAW).
   */
  accept: { label: "Allow it from now on", keepsReason: false },
  reject: {
    label: "Keep it blocked",
    keepsReason: true,
    reasonPrompt: "Why not? (kept on the record)",
  },
  useSource,
  useDecisions,
  /**
   * No `scopeRequirement`: an exception request waits with the person it is
   * addressed to, in whatever organization it was filed in, and `/approvals` is
   * where they see it. A site-scoped mount would need `siteId`, and no host
   * mounts one for this kind today.
   */
};
