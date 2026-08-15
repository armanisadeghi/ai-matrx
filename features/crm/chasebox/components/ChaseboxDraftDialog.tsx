"use client";

/**
 * ChaseboxDraftDialog — approve and send a draft the sequence runner held.
 *
 * IC-6 / D-W1-2: when the earned-trust ladder says a step needs a human, the
 * runner leaves the `crm.interaction` row `planned` and stops. Surfacing those
 * is a first-class Chasebox job, and an unapproved draft is a stopped campaign.
 *
 * It shows the EXACT rendered message before either button is live — approving
 * something you have not read is the failure this whole ladder exists to
 * prevent — then calls the SAME `approveOutreachDraft` / `sendOutreachDraft`
 * client the outreach-list workspace uses, and renders a governed refusal
 * through the SAME `readOutreachProblem`. There is no second send path.
 */

import { useEffect, useState } from "react";
import { AlertTriangle, Check, Loader2, Send } from "lucide-react";
import { Button } from "@/components/ui/button";
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
  sendOutreachDraft,
  type OutreachProblem,
} from "@/features/crm/outreach-single-send/service";
import { fetchInteractionById } from "@/features/crm/inbox/service";
import {
  readOutreachDraftId,
  readOutreachSendAttributes,
} from "@/features/crm/inbox/attributes";
import type { InteractionRow } from "@/features/crm/types";
import type { ChaseboxRow } from "../types";

interface Props {
  row: ChaseboxRow | null;
  onClose: () => void;
  onSent: () => void;
}

export function ChaseboxDraftDialog({ row, onClose, onSent }: Props) {
  const [draft, setDraft] = useState<InteractionRow | null>(null);
  const [problem, setProblem] = useState<OutreachProblem | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [approvedAt, setApprovedAt] = useState<string | null>(null);
  const [busy, setBusy] = useState<"approve" | "send" | null>(null);
  const interactionId = row?.interaction_id ?? null;

  useEffect(() => {
    if (!interactionId) return;
    let cancelled = false;
    setDraft(null);
    setProblem(null);
    setLoadError(null);
    setApprovedAt(null);
    void fetchInteractionById(interactionId)
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
  }, [interactionId]);

  if (!row) return null;

  const draftId = draft ? readOutreachDraftId(draft.id, draft.attributes) : null;

  async function approve() {
    if (!draftId) return;
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
  }

  async function send() {
    if (!draftId) return;
    setBusy("send");
    setProblem(null);
    try {
      const result = await sendOutreachDraft(draftId);
      toast.success(`Email sent to ${result.draft.recipient}`);
      onSent();
    } catch (error) {
      setProblem(readOutreachProblem(error));
    } finally {
      setBusy(null);
    }
  }

  return (
    <Dialog open onOpenChange={(open) => (open ? undefined : onClose())}>
      <DialogContent className="max-h-[90dvh] overflow-y-auto sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>
            Draft for {row.party_name ?? "this contact"}
          </DialogTitle>
          <DialogDescription>
            {row.outreach_list_name
              ? `${row.outreach_list_name} · step ${row.step ?? "?"}. `
              : ""}
            The sequence wrote this and stopped for your approval. Nothing has
            been sent.
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
            {approvedAt && (
              <p className="flex items-center gap-1 text-sm text-emerald-600 dark:text-emerald-400">
                <Check className="h-4 w-4" aria-hidden />
                Approved for this exact rendered message
              </p>
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

        <DialogFooter className="gap-2 sm:gap-2">
          {/* The plan gates the ACTION, on the org that owns the record — never
              the active-org selection, and never the reading surface. */}
          <CapabilityGate
            capability="outreach.send"
            organizationId={row.organization_id}
            compact
          >
            <div className="flex gap-2">
              {!approvedAt && (
                <Button
                  variant="outline"
                  onClick={() => void approve()}
                  disabled={!draftId || busy !== null}
                >
                  {busy === "approve" && (
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" aria-hidden />
                  )}
                  Approve exact message
                </Button>
              )}
              <Button
                onClick={() => void send()}
                disabled={!draftId || !approvedAt || busy !== null}
                title={
                  approvedAt ? undefined : "Approve the exact message first."
                }
              >
                {busy === "send" ? (
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" aria-hidden />
                ) : (
                  <Send className="mr-2 h-4 w-4" aria-hidden />
                )}
                Send email
              </Button>
            </div>
          </CapabilityGate>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
