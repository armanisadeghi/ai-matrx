"use client";

/**
 * ChaseboxDraftDialog — the draft TRIAGE surface (IC-6's review half).
 *
 * IC-6 / D-W1-2: when the earned-trust ladder says a step needs a human, the
 * runner leaves the `crm.interaction` row `planned` and stops. Those drafts are
 * now AI-personalized (WP5): each carries an opening line the writer traced to a
 * fact on one of the target's own pages.
 *
 * SO REVIEWING ONE DRAFT IS NOT THE JOB — reviewing FIFTY IS. This dialog is
 * built for that: J/K walk the queue without closing, A approves, S sends, E
 * rewords the AI's line, R rejects, and the personalization's supporting FACT
 * and SOURCE PAGE sit beside the message so the reviewer can check a claim
 * without leaving. Approving something you have not read is the failure the
 * whole ladder exists to prevent; approving something you cannot TRACE is the
 * failure personalization adds, and the evidence panel is the answer to it.
 *
 * Every action goes through the SAME canonical single-send client the campaign
 * workspace uses — approve / send / revise-personalization / reject. There is no
 * second send path, and the edit is a re-render of the binding rather than a
 * hand-edit of the bytes (the fingerprint law: a human approves exact bytes).
 */

import { useCallback, useEffect, useRef, useState } from "react";
import {
  AlertTriangle,
  Check,
  CheckCheck,
  ChevronLeft,
  ChevronRight,
  ExternalLink,
  Loader2,
  MessageSquareReply,
  Pencil,
  Send,
  Sparkles,
  X,
} from "lucide-react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { CapabilityGate } from "@/features/entitlements/components/CapabilityGate";
import { toast } from "@/lib/toast";
import {
  approveOutreachDraft,
  approveOutreachDrafts,
  readOutreachProblem,
  rejectOutreachDraft,
  reviseOutreachPersonalization,
  sendOutreachDraft,
  type OutreachDraftOutcome,
  type OutreachProblem,
} from "@/features/crm/outreach-single-send/service";
import { fetchInteractionById } from "@/features/crm/inbox/service";
import {
  INBOUND_LABEL_META,
  readOutreachDraftId,
  readOutreachSendAttributes,
  readPersonalizationProvenance,
  readReplyProvenance,
  replyIntentLabel,
  type PersonalizationProvenance,
  type ReplyProvenance,
} from "@/features/crm/inbox/attributes";
import type { InteractionRow } from "@/features/crm/types";
import type { ChaseboxRow } from "../types";

/**
 * What the reviewer currently has in front of them, lifted to the page so the
 * Chasebox surface can hand an agent the same thing (manifest `draft.*` values).
 */
export interface ReviewedDraft {
  subject: string;
  body: string;
  approved: boolean;
  personalization: Array<{
    name: string;
    text: string;
    fact: string | null;
    source_url: string | null;
  }>;
  /** Present only when the open draft is a REPLY (WP5's reply_agent wrote it). */
  reply?: {
    intent: string;
    grounded_on: string[];
    answering_label: string | null;
    thread_message_count: number | null;
  };
}

interface Props {
  /** The whole queue page, so review moves without closing. */
  rows: ChaseboxRow[];
  /** Which row is open; null closes the dialog. */
  index: number | null;
  onIndexChange: (index: number) => void;
  onClose: () => void;
  /** A draft that left the queue (sent or rejected) — refresh counts + rows. */
  onResolved: () => void;
  /** Report what is on screen so the surface can offer it to an agent. */
  onDraftLoaded?: (draft: ReviewedDraft | null) => void;
}

type Busy = "approve" | "send" | "reject" | "save" | "approve-rest" | null;

/** One claim as the writer stamped it: `the claim text [where it came from]`. */
function splitClaim(claim: string): { text: string; source: string | null } {
  const match = /^(.*)\s\[([a-z_]+)\]$/.exec(claim.trim());
  if (!match) return { text: claim.trim(), source: null };
  return { text: match[1].trim(), source: match[2] };
}

const CLAIM_SOURCE_LABELS: Record<string, string> = {
  inbound_message: "what they wrote",
  campaign_context: "the campaign",
  record: "their record",
};

export function ChaseboxDraftDialog({
  rows,
  index,
  onIndexChange,
  onClose,
  onResolved,
  onDraftLoaded,
}: Props) {
  const row = index === null ? null : (rows[index] ?? null);
  const [draft, setDraft] = useState<InteractionRow | null>(null);
  const [personalization, setPersonalization] =
    useState<PersonalizationProvenance | null>(null);
  const [reply, setReply] = useState<ReplyProvenance | null>(null);
  const [problem, setProblem] = useState<OutreachProblem | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [approvedAt, setApprovedAt] = useState<string | null>(null);
  const [busy, setBusy] = useState<Busy>(null);
  const [mode, setMode] = useState<"read" | "edit" | "reject">("read");
  const [edits, setEdits] = useState<Record<string, string>>({});
  const [rejectReason, setRejectReason] = useState("");
  const [resolvedIds, setResolvedIds] = useState<string[]>([]);
  // Every draft the reviewer actually opened and read, in order. "Approve the
  // rest" may only ever act on THIS set — a filter over the queue would approve
  // messages nobody has seen, which is the failure the whole ladder prevents.
  const [readDraftIds, setReadDraftIds] = useState<string[]>([]);
  const [batchOutcomes, setBatchOutcomes] = useState<OutreachDraftOutcome[]>([]);
  const interactionId = row?.interaction_id ?? null;
  const dialogRef = useRef<HTMLDivElement | null>(null);

  const load = useCallback(
    (id: string) => {
      let cancelled = false;
      setDraft(null);
      setPersonalization(null);
      setReply(null);
      setProblem(null);
      setLoadError(null);
      setApprovedAt(null);
      setMode("read");
      setEdits({});
      setRejectReason("");
      void fetchInteractionById(id)
        .then((found) => {
          if (cancelled) return;
          if (!found) {
            setLoadError(
              "This draft no longer exists — it was sent, cancelled, or removed since the queue was loaded.",
            );
            return;
          }
          setDraft(found);
          setApprovedAt(readOutreachSendAttributes(found.attributes).approvedAt);
          setPersonalization(readPersonalizationProvenance(found.attributes));
          setReply(readReplyProvenance(found.attributes));
          // Read means READ: this is the set "approve the rest" may act on, so
          // it only ever grows from a draft that actually rendered on screen.
          setReadDraftIds((current) =>
            current.includes(id) ? current : [...current, id],
          );
        })
        .catch((error: unknown) => {
          if (cancelled) return;
          setLoadError(
            error instanceof Error ? error.message : "Could not load this draft.",
          );
        });
      return () => {
        cancelled = true;
      };
    },
    [],
  );

  useEffect(() => {
    if (!interactionId) return;
    return load(interactionId);
  }, [interactionId, load]);

  // Keep the surface's view of the draft in step with the reviewer's.
  useEffect(() => {
    if (!onDraftLoaded) return;
    if (!draft) {
      onDraftLoaded(null);
      return;
    }
    onDraftLoaded({
      subject: draft.subject ?? "",
      body: draft.body ?? "",
      approved: approvedAt !== null,
      personalization: (personalization?.fields ?? []).map((field) => ({
        name: field.name,
        text: field.text,
        fact: field.fact,
        source_url: field.sourceUrl,
      })),
      reply: reply
        ? {
            intent: replyIntentLabel(reply.intent),
            grounded_on: reply.groundedOn,
            answering_label: reply.latestInboundLabel,
            thread_message_count: reply.threadMessageCount,
          }
        : undefined,
    });
  }, [draft, approvedAt, personalization, reply, onDraftLoaded]);

  const draftId = draft ? readOutreachDraftId(draft.id, draft.attributes) : null;
  const resolved = row ? resolvedIds.includes(row.id) : false;

  /** Move to the next unresolved draft, or close when this was the last one. */
  const advance = useCallback(() => {
    if (index === null) return;
    if (index + 1 < rows.length) onIndexChange(index + 1);
    else onClose();
  }, [index, rows.length, onIndexChange, onClose]);

  const step = useCallback(
    (delta: number) => {
      if (index === null) return;
      const next = index + delta;
      if (next >= 0 && next < rows.length) onIndexChange(next);
    },
    [index, rows.length, onIndexChange],
  );

  const approve = useCallback(async () => {
    if (!draftId || busy) return;
    setBusy("approve");
    setProblem(null);
    try {
      const result = await approveOutreachDraft(draftId);
      setApprovedAt(result.approved_at ?? new Date().toISOString());
      toast.success("Exact message approved");
    } catch (error) {
      setProblem(readOutreachProblem(error));
    } finally {
      setBusy(null);
    }
  }, [draftId, busy]);

  const send = useCallback(async () => {
    if (!draftId || busy || !approvedAt) return;
    setBusy("send");
    setProblem(null);
    try {
      const result = await sendOutreachDraft(draftId);
      toast.success(`Email sent to ${result.draft.recipient}`);
      if (row) setResolvedIds((ids) => [...ids, row.id]);
      onResolved();
      advance();
    } catch (error) {
      setProblem(readOutreachProblem(error));
    } finally {
      setBusy(null);
    }
  }, [draftId, busy, approvedAt, row, onResolved, advance]);

  const reject = useCallback(async () => {
    if (!draftId || busy) return;
    setBusy("reject");
    setProblem(null);
    try {
      await rejectOutreachDraft(draftId, rejectReason);
      toast.success("Message rejected — the contact left this campaign");
      if (row) setResolvedIds((ids) => [...ids, row.id]);
      onResolved();
      advance();
    } catch (error) {
      setProblem(readOutreachProblem(error));
      setMode("read");
    } finally {
      setBusy(null);
    }
  }, [draftId, busy, rejectReason, row, onResolved, advance]);

  const saveEdits = useCallback(async () => {
    if (!draftId || busy || !personalization) return;
    const changed: Record<string, string> = {};
    for (const field of personalization.fields) {
      const next = (edits[field.name] ?? field.text).trim();
      if (next && next !== field.text) changed[field.name] = next;
    }
    if (Object.keys(changed).length === 0) {
      setMode("read");
      return;
    }
    setBusy("save");
    setProblem(null);
    try {
      await reviseOutreachPersonalization(draftId, changed);
      toast.success("Line saved — approve the new message to send it");
      if (interactionId) load(interactionId);
    } catch (error) {
      setProblem(readOutreachProblem(error));
    } finally {
      setBusy(null);
    }
  }, [draftId, busy, personalization, edits, interactionId, load]);

  /** The drafts the reviewer has read and not already resolved. */
  const pendingRead = readDraftIds.filter((id) => !resolvedIds.includes(id));

  const approveRest = useCallback(async () => {
    if (busy || pendingRead.length === 0) return;
    setBusy("approve-rest");
    setProblem(null);
    setBatchOutcomes([]);
    try {
      const result = await approveOutreachDrafts(pendingRead);
      const refused = result.outcomes.filter((outcome) => !outcome.approved);
      setBatchOutcomes(refused);
      if (result.approved > 0) {
        toast.success(
          `${result.approved} message${result.approved === 1 ? "" : "s"} approved — nothing sent yet`,
        );
      }
      if (refused.length > 0) {
        toast.error(
          `${refused.length} could not be approved — each one says why below`,
        );
      }
      // The one open draft may itself have been in the batch.
      if (draftId && result.outcomes.some((o) => o.draft_id === draftId && o.approved)) {
        setApprovedAt(new Date().toISOString());
      }
      onResolved();
    } catch (error) {
      setProblem(readOutreachProblem(error));
    } finally {
      setBusy(null);
    }
  }, [busy, pendingRead, draftId, onResolved]);

  // Keyboard triage. Never fires while the reviewer is typing — an editor that
  // eats your keystrokes as commands is worse than no shortcuts at all.
  useEffect(() => {
    if (index === null) return;
    function onKey(event: KeyboardEvent) {
      const target = event.target as HTMLElement | null;
      const typing =
        target?.tagName === "TEXTAREA" ||
        target?.tagName === "INPUT" ||
        target?.isContentEditable === true;
      if ((event.metaKey || event.ctrlKey) && event.key === "Enter") {
        event.preventDefault();
        if (mode === "edit") void saveEdits();
        else if (approvedAt) void send();
        else void approve();
        return;
      }
      if (typing || event.metaKey || event.ctrlKey || event.altKey) return;
      switch (event.key) {
        case "j":
        case "ArrowDown":
          event.preventDefault();
          step(1);
          break;
        case "k":
        case "ArrowUp":
          event.preventDefault();
          step(-1);
          break;
        case "a":
          event.preventDefault();
          void approve();
          break;
        case "s":
          event.preventDefault();
          void send();
          break;
        case "e":
          event.preventDefault();
          if (personalization) setMode("edit");
          break;
        case "r":
          event.preventDefault();
          setMode((current) => (current === "reject" ? "read" : "reject"));
          break;
        default:
          break;
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [index, mode, approvedAt, personalization, approve, send, saveEdits, step]);

  if (index === null || !row) return null;

  return (
    <Dialog open onOpenChange={(open) => (open ? undefined : onClose())}>
      <DialogContent
        ref={dialogRef}
        className="max-h-[92dvh] gap-3 overflow-y-auto sm:max-w-3xl"
      >
        <DialogHeader className="space-y-1">
          <div className="flex items-center justify-between gap-2">
            <DialogTitle className="text-base">
              Draft for {row.party_name ?? "this contact"}
            </DialogTitle>
            <div className="flex items-center gap-1 text-xs text-muted-foreground">
              <Button
                size="icon"
                variant="ghost"
                className="h-7 w-7"
                onClick={() => step(-1)}
                disabled={index === 0}
                title="Previous draft (K)"
              >
                <ChevronLeft className="h-4 w-4" aria-hidden />
              </Button>
              <span className="tabular-nums">
                {index + 1} of {rows.length}
              </span>
              <Button
                size="icon"
                variant="ghost"
                className="h-7 w-7"
                onClick={() => step(1)}
                disabled={index >= rows.length - 1}
                title="Next draft (J)"
              >
                <ChevronRight className="h-4 w-4" aria-hidden />
              </Button>
            </div>
          </div>
          <DialogDescription>
            {row.outreach_list_id ? (
              <Link
                href={`/crm/outreach-lists/${row.outreach_list_id}`}
                className="underline underline-offset-2 hover:text-foreground"
              >
                {row.outreach_list_name ?? "Campaign"}
              </Link>
            ) : null}
            {row.step != null ? ` · step ${row.step}` : ""} — the sequence wrote
            this and stopped for your approval. Nothing has been sent.
          </DialogDescription>
        </DialogHeader>

        {loadError && (
          <div className="rounded-md border border-destructive/30 bg-destructive/10 p-3 text-sm text-destructive">
            <p className="flex gap-2 font-medium">
              <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
              {loadError}
            </p>
          </div>
        )}

        {!draft && !loadError && (
          <div className="flex items-center gap-2 py-6 text-sm text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
            Loading the exact message…
          </div>
        )}

        {draft && (
          <div className="space-y-3">
            <div className="rounded-md border">
              <div className="border-b px-3 py-2 text-sm font-medium">
                {draft.subject || "(no subject)"}
              </div>
              <pre className="whitespace-pre-wrap px-3 py-3 font-sans text-sm leading-relaxed">
                {draft.body || "(this draft has no body)"}
              </pre>
            </div>

            {/* WHAT THE AI CLAIMED, AND WHERE IT READ IT. */}
            {personalization && (
              <div className="rounded-md border border-primary/30 bg-primary/5">
                <div className="flex items-center gap-1.5 border-b border-primary/20 px-3 py-1.5 text-xs font-medium">
                  <Sparkles className="h-3.5 w-3.5 text-primary" aria-hidden />
                  Written for this contact from their own pages
                  {personalization.humanEdited && (
                    <span className="text-muted-foreground">· edited by a person</span>
                  )}
                </div>
                <ul className="divide-y divide-primary/15">
                  {personalization.fields.map((field) => (
                    <li key={field.name} className="space-y-1 px-3 py-2">
                      <p className="text-xs font-medium text-muted-foreground">
                        {field.label}
                      </p>
                      {mode === "edit" ? (
                        <Textarea
                          value={edits[field.name] ?? field.text}
                          onChange={(event) =>
                            setEdits((current) => ({
                              ...current,
                              [field.name]: event.target.value,
                            }))
                          }
                          rows={3}
                          className="text-sm"
                          aria-label={`${field.label} text`}
                        />
                      ) : (
                        <p className="text-sm">{field.text}</p>
                      )}
                      {field.fact && (
                        <p className="text-xs text-muted-foreground">
                          Because: {field.fact}
                        </p>
                      )}
                      {field.sourceUrl && (
                        <a
                          href={field.sourceUrl}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="inline-flex items-center gap-1 text-xs text-primary underline underline-offset-2"
                        >
                          {field.sourceUrl}
                          <ExternalLink className="h-3 w-3" aria-hidden />
                        </a>
                      )}
                    </li>
                  ))}
                </ul>
                {mode === "edit" && (
                  <p className="border-t border-primary/20 px-3 py-1.5 text-xs text-muted-foreground">
                    Only these lines are editable — the rest of the message is the
                    campaign template. Saving re-renders the message, so it needs
                    approving again.
                  </p>
                )}
              </div>
            )}

            {/* WHAT THIS REPLY IS ANSWERING, AND WHAT IT STANDS ON.
                A reply's evidence is a different question from a
                personalization line's ("where did that claim come from") — it
                is "what am I answering, and what am I standing on" — so it gets
                its own panel rather than being folded into the list above. */}
            {reply && (
              <div className="rounded-md border border-sky-500/30 bg-sky-500/5">
                <div className="flex flex-wrap items-center gap-1.5 border-b border-sky-500/20 px-3 py-1.5 text-xs font-medium">
                  <MessageSquareReply
                    className="h-3.5 w-3.5 text-sky-600 dark:text-sky-400"
                    aria-hidden
                  />
                  Written as the next message in a real conversation
                  {reply.threadMessageCount != null && (
                    <span className="text-muted-foreground">
                      · {reply.threadMessageCount} message
                      {reply.threadMessageCount === 1 ? "" : "s"} so far
                    </span>
                  )}
                </div>
                <div className="space-y-2 px-3 py-2">
                  <div className="flex flex-wrap items-center gap-2 text-sm">
                    <span className="font-medium">
                      {replyIntentLabel(reply.intent)}
                    </span>
                    {reply.latestInboundLabel && (
                      <span className="text-xs text-muted-foreground">
                        answering a reply read as{" "}
                        {INBOUND_LABEL_META[reply.latestInboundLabel].label.toLowerCase()}
                      </span>
                    )}
                  </div>
                  {reply.groundedOn.length > 0 ? (
                    <ul className="space-y-1">
                      {reply.groundedOn.map((claim) => {
                        const { text, source } = splitClaim(claim);
                        return (
                          <li key={claim} className="text-xs">
                            <span className="text-foreground">{text}</span>
                            {source && (
                              <span className="text-muted-foreground">
                                {" "}
                                — from {CLAIM_SOURCE_LABELS[source] ?? source}
                              </span>
                            )}
                          </li>
                        );
                      })}
                    </ul>
                  ) : (
                    // Never silently blank: a traced claim is required for a
                    // reply to be written at all, so an empty list means an
                    // older generation, not an untraced message.
                    <p className="text-xs text-muted-foreground">
                      This reply was written before claim tracing was recorded.
                      Read it against the conversation before approving.
                    </p>
                  )}
                  {/* THE DOOR: the message this one answers. */}
                  {reply.replyingToInteractionId && row.party_id && (
                    <Link
                      href={`/crm/${row.party_id}?interaction=${reply.replyingToInteractionId}`}
                      className="inline-flex items-center gap-1 text-xs text-primary underline underline-offset-2"
                    >
                      Read what they actually said
                      <ExternalLink className="h-3 w-3" aria-hidden />
                    </Link>
                  )}
                </div>
              </div>
            )}

            {approvedAt && mode === "read" && (
              <p className="flex items-center gap-1 text-sm text-emerald-600 dark:text-emerald-400">
                <Check className="h-4 w-4" aria-hidden />
                Approved for this exact rendered message
              </p>
            )}

            {mode === "reject" && (
              <div className="space-y-2 rounded-md border border-destructive/30 bg-destructive/5 p-3">
                <p className="text-sm font-medium">
                  Reject this message and take {row.party_name ?? "this contact"}{" "}
                  out of the campaign?
                </p>
                <p className="text-xs text-muted-foreground">
                  Nothing is sent and nothing is suppressed — their contact record
                  is untouched. You can put them back with Requeue on the campaign.
                </p>
                <Textarea
                  value={rejectReason}
                  onChange={(event) => setRejectReason(event.target.value)}
                  rows={2}
                  placeholder="Why? (optional — the next person reviewing sees this)"
                  className="text-sm"
                  aria-label="Reason for rejecting"
                />
              </div>
            )}
          </div>
        )}

        {/* PER-DRAFT refusals from "approve the rest" — never a count. A batch
            that quietly approved 9 of 10 and said "done" is worse than one that
            approved none, so each one names itself and its fix. */}
        {batchOutcomes.length > 0 && (
          <div className="rounded-md border border-amber-500/40 bg-amber-500/10 p-3 text-sm">
            <p className="font-medium">
              {batchOutcomes.length} message
              {batchOutcomes.length === 1 ? "" : "s"} still need you
            </p>
            <ul className="mt-1 space-y-1">
              {batchOutcomes.map((outcome) => {
                const position = rows.findIndex(
                  (candidate) => candidate.interaction_id === outcome.draft_id,
                );
                return (
                  <li key={outcome.draft_id} className="text-xs">
                    <button
                      type="button"
                      className="underline underline-offset-2 disabled:no-underline"
                      disabled={position < 0}
                      onClick={() => onIndexChange(position)}
                    >
                      {position >= 0
                        ? (rows[position].party_name ?? "This contact")
                        : "A draft that has left this page"}
                    </button>
                    <span className="text-muted-foreground">
                      {" "}
                      — {outcome.message ?? "could not be approved"}
                      {outcome.fix ? ` Fix: ${outcome.fix}` : ""}
                    </span>
                  </li>
                );
              })}
            </ul>
          </div>
        )}

        {problem && (
          <div className="rounded-md border border-destructive/30 bg-destructive/10 p-3 text-sm">
            <div className="flex gap-2 font-medium text-destructive">
              <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
              {problem.message}
            </div>
            <p className="mt-1 pl-6 text-muted-foreground">Fix: {problem.fix}</p>
            {problem.unresolved.length > 0 && (
              <p className="mt-1 pl-6 font-mono text-xs">
                {problem.unresolved.join(", ")}
              </p>
            )}
          </div>
        )}

        <DialogFooter className="flex-col items-stretch gap-2 sm:flex-row sm:items-center sm:justify-between">
          <p className="order-last text-xs text-muted-foreground sm:order-first">
            J/K move · A approve · S send · E edit · R reject
          </p>
          {/* The plan gates the ACTION, on the org that owns the record — never
              the active-org selection, and never the reading surface. */}
          <CapabilityGate
            capability="outreach.send"
            organizationId={row.organization_id}
            compact
          >
            <div className="flex flex-wrap gap-2">
              {mode === "edit" ? (
                <>
                  <Button variant="ghost" onClick={() => setMode("read")}>
                    Cancel
                  </Button>
                  <Button onClick={() => void saveEdits()} disabled={busy !== null}>
                    {busy === "save" && (
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" aria-hidden />
                    )}
                    Save line
                  </Button>
                </>
              ) : mode === "reject" ? (
                <>
                  <Button variant="ghost" onClick={() => setMode("read")}>
                    Keep it
                  </Button>
                  <Button
                    variant="destructive"
                    onClick={() => void reject()}
                    disabled={!draftId || busy !== null || resolved}
                  >
                    {busy === "reject" ? (
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" aria-hidden />
                    ) : (
                      <X className="mr-2 h-4 w-4" aria-hidden />
                    )}
                    Reject and remove
                  </Button>
                </>
              ) : (
                <>
                  {/* APPROVE THE REST — only ever the drafts this reviewer
                      actually opened. Inside the same capability gate as every
                      other verb here, because approving in bulk is exactly as
                      governed as approving one: same server path, same
                      fingerprint check, and still nothing sent. */}
                  {pendingRead.length > 1 && (
                    <Button
                      variant="ghost"
                      onClick={() => void approveRest()}
                      disabled={busy !== null}
                      title={`Approve the ${pendingRead.length} drafts you have opened. Nothing is sent.`}
                    >
                      {busy === "approve-rest" ? (
                        <Loader2 className="mr-2 h-4 w-4 animate-spin" aria-hidden />
                      ) : (
                        <CheckCheck className="mr-2 h-4 w-4" aria-hidden />
                      )}
                      Approve the {pendingRead.length} you have read
                    </Button>
                  )}
                  <Button
                    variant="ghost"
                    onClick={() => setMode("reject")}
                    disabled={!draftId || busy !== null || resolved}
                  >
                    <X className="mr-2 h-4 w-4" aria-hidden />
                    Reject
                  </Button>
                  {personalization && (
                    <Button
                      variant="outline"
                      onClick={() => setMode("edit")}
                      disabled={!draftId || busy !== null || resolved}
                    >
                      <Pencil className="mr-2 h-4 w-4" aria-hidden />
                      Edit line
                    </Button>
                  )}
                  {!approvedAt && (
                    <Button
                      variant="outline"
                      onClick={() => void approve()}
                      disabled={!draftId || busy !== null || resolved}
                    >
                      {busy === "approve" && (
                        <Loader2 className="mr-2 h-4 w-4 animate-spin" aria-hidden />
                      )}
                      Approve exact message
                    </Button>
                  )}
                  <Button
                    onClick={() => void send()}
                    disabled={!draftId || !approvedAt || busy !== null || resolved}
                    title={approvedAt ? undefined : "Approve the exact message first."}
                  >
                    {busy === "send" ? (
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" aria-hidden />
                    ) : (
                      <Send className="mr-2 h-4 w-4" aria-hidden />
                    )}
                    Send email
                  </Button>
                </>
              )}
            </div>
          </CapabilityGate>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
