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
  ChevronLeft,
  ChevronRight,
  ExternalLink,
  Loader2,
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
  readOutreachProblem,
  rejectOutreachDraft,
  reviseOutreachPersonalization,
  sendOutreachDraft,
  type OutreachProblem,
} from "@/features/crm/outreach-single-send/service";
import { fetchInteractionById } from "@/features/crm/inbox/service";
import {
  readOutreachDraftId,
  readOutreachSendAttributes,
  readPersonalizationProvenance,
  type PersonalizationProvenance,
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

type Busy = "approve" | "send" | "reject" | "save" | null;

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
  const [problem, setProblem] = useState<OutreachProblem | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [approvedAt, setApprovedAt] = useState<string | null>(null);
  const [busy, setBusy] = useState<Busy>(null);
  const [mode, setMode] = useState<"read" | "edit" | "reject">("read");
  const [edits, setEdits] = useState<Record<string, string>>({});
  const [rejectReason, setRejectReason] = useState("");
  const [resolvedIds, setResolvedIds] = useState<string[]>([]);
  const interactionId = row?.interaction_id ?? null;
  const dialogRef = useRef<HTMLDivElement | null>(null);

  const load = useCallback(
    (id: string) => {
      let cancelled = false;
      setDraft(null);
      setPersonalization(null);
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
    });
  }, [draft, approvedAt, personalization, onDraftLoaded]);

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
