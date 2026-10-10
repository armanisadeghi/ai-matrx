"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { AlertTriangle, Check, ClipboardCheck, Loader2, Mail, Send } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { fetchOrganizationMessageTemplates } from "@/features/message-templates/services/message-templates-service";
import {
  readMessageTemplateMetadata,
  type MessageTemplateDB,
} from "@/features/message-templates/types/message-templates-db";
import {
  getReputationCaseById,
  listOrganizationReputationCases,
} from "@/features/marketing/data/reputation-queries";
import type { ReputationCaseRow } from "@/features/marketing/data/reputation-types";
import {
  approveOutreachDraft,
  createOutreachDraft,
  readOutreachProblem,
  sendOutreachDraft,
  type OutreachDraft,
  type OutreachProblem,
} from "@/features/crm/outreach-single-send/service";
import { CapabilityGate } from "@/features/entitlements/components/CapabilityGate";
import { toast } from "@/lib/toast";
import type {
  OutreachListMemberWithParty,
  OutreachListRow,
} from "../../outreach-lists/types";
import { ErrorAlchemyMenu } from "@/components/errors/ErrorAlchemyMenu";
import { PitchAdvisoryPanel } from "@/features/crm/pitch-advisories/PitchAdvisoryPanel";
import { usePitchAdvisories } from "@/features/crm/pitch-advisories/usePitchAdvisories";
import {
  canPerformOutreachOffer,
  performOutreachOffer,
} from "@/features/crm/pitch-advisories/outreachOffers";
import { PreSendCheckPanel } from "@/features/crm/pre-send-check/PreSendCheckPanel";
import { RecipientFitBadge } from "@/features/crm/pre-send-check/RecipientFitBadge";
import { usePreSendCheck } from "@/features/crm/pre-send-check/usePreSendCheck";

interface SingleSendDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  list: OutreachListRow;
  member: OutreachListMemberWithParty | null;
  onSent: () => void;
}

function subjectTemplate(template: MessageTemplateDB): string | null {
  const value = readMessageTemplateMetadata(template.metadata).subject_template;
  return typeof value === "string" && value.trim() ? value : null;
}

function metadataId(value: unknown, key: string): string | undefined {
  const metadata = readMessageTemplateMetadata(value);
  const id = metadata[key];
  return typeof id === "string" ? id : undefined;
}

export function SingleSendDialog({
  open,
  onOpenChange,
  list,
  member,
  onSent,
}: SingleSendDialogProps) {
  const [templates, setTemplates] = useState<MessageTemplateDB[]>([]);
  const [templateId, setTemplateId] = useState("");
  const [reputationCases, setReputationCases] = useState<ReputationCaseRow[]>(
    [],
  );
  const [reputationCaseId, setReputationCaseId] = useState("none");
  const [draft, setDraft] = useState<OutreachDraft | null>(null);
  const [problem, setProblem] = useState<OutreachProblem | null>(null);
  // The template/case read failed: its failure is the problem box below, so
  // "No email-ready template" must not also claim there are none.
  const [templatesReadFailed, setTemplatesReadFailed] = useState(false);
  const [busy, setBusy] = useState<
    "loading" | "preview" | "approve" | "send" | null
  >(open ? "loading" : null);
  const memberReputationCaseId = metadataId(
    member?.metadata,
    "reputation_case_id",
  );

  useEffect(() => {
    if (!open) return;
    void Promise.all([
      fetchOrganizationMessageTemplates(list.organization_id),
      listOrganizationReputationCases(list.organization_id),
    ])
      .then(async ([rows, cases]) => {
        setTemplatesReadFailed(false);
        setReputationCaseId(memberReputationCaseId ?? "none");
        const emailTemplates = rows.filter((row) => subjectTemplate(row));
        setTemplates(emailTemplates);
        const pitchable = cases.filter((row) =>
          Boolean(row.pitch_angle?.trim()),
        );
        // A member enrolled by "Start outreach" can be bound to a case with no
        // pitch angle (`correct` / `request_update` often have none), which
        // the org inventory deliberately excludes. Without adding it back the
        // selector renders EMPTY over a real binding — the UI would be lying
        // about what this message is attached to.
        if (
          memberReputationCaseId &&
          !pitchable.some((row) => row.id === memberReputationCaseId)
        ) {
          const bound = await getReputationCaseById(memberReputationCaseId);
          if (bound) pitchable.unshift(bound);
        }
        setReputationCases(pitchable);
        if (emailTemplates.length === 1) setTemplateId(emailTemplates[0].id);
      })
      .catch((error: unknown) => {
        setTemplatesReadFailed(true);
        setProblem(readOutreachProblem(error));
      })
      .finally(() => setBusy(null));
  }, [list.organization_id, memberReputationCaseId, open]);

  // THE PR FLOOR (pitch advisories E1–E17): the one shared check, run on the
  // exact previewed message. Warnings and offers only — Send stays live, and
  // pressing it records that the person saw them.
  const advisories = usePitchAdvisories(
    list.organization_id,
    draft && !draft.sent_at
      ? {
          surface: "single_send",
          draft_id: draft.id,
          recipient_party_ids: [draft.party_id],
          attachment_count: 0,
          is_exclusive: false,
        }
      : null,
  );

  // THE PRE-SEND CHECK. `fit` is the cheap read beside the recipient (stored
  // verdict, no model call) and its "Check fit" (fresh, against this draft);
  // `review` is "Review before send": critique + fact check (knob
  // pr.auto_factcheck_on_review) + fit + the PR floor, in one report. Neither
  // ever disables Send — validation offers, never blocks.
  const fit = usePreSendCheck(list.organization_id);
  const review = usePreSendCheck(list.organization_id);
  const recipientPartyId = member?.party_id ?? null;
  const runFit = fit.run;
  const resetFit = fit.reset;
  const resetReview = review.reset;
  useEffect(() => {
    if (!open || !recipientPartyId) return;
    void runFit({
      surface: "single_send",
      recipient_party_ids: [recipientPartyId],
      run_critique: false,
      run_fact_check: false,
    });
    return () => {
      resetFit();
      resetReview();
    };
  }, [open, recipientPartyId, runFit, resetFit, resetReview]);
  const recipientFit =
    (review.report?.recipients ?? []).find((r) => r.party_id === recipientPartyId) ??
    (fit.report?.recipients ?? []).find((r) => r.party_id === recipientPartyId) ??
    null;

  function checkFit() {
    if (!recipientPartyId) return;
    void fit.run({
      surface: "single_send",
      recipient_party_ids: [recipientPartyId],
      ...(draft ? { draft_id: draft.id } : {}),
      run_critique: false,
      run_fact_check: false,
      fresh_fit: true,
    });
  }

  function reviewBeforeSend() {
    if (!draft) return;
    void review.run({
      surface: "single_send",
      draft_id: draft.id,
      recipient_party_ids: [draft.party_id],
      fresh_fit: true,
    });
  }

  // REVIEWING NEVER NEEDS A MAILBOX. The server previews a draft for a campaign
  // with none and says so with a null sender; only Send needs one, and pressing
  // it then offers the connect step instead of failing.
  const mailboxMissing = Boolean(draft && !draft.from_address);
  const [mailboxOffer, setMailboxOffer] = useState(false);

  const approved = Boolean(draft?.approved_at);
  const canSend = Boolean(
    draft?.eligibility.allowed &&
    (!draft.approval.required_for_this_message || approved),
  );
  const approvalLabel = useMemo(() => {
    if (!draft) return "";
    if (draft.approval.requirement === "sampled") {
      return `Trust stage ${draft.approval.trust_stage}: ${draft.approval.sample_percent}% review sample`;
    }
    return draft.approval.required_for_this_message
      ? `Trust stage ${draft.approval.trust_stage}: approval required`
      : `Trust stage ${draft.approval.trust_stage}: approval not required`;
  }, [draft]);

  async function preview() {
    if (!member || !templateId) return;
    setBusy("preview");
    setProblem(null);
    try {
      setDraft(
        await createOutreachDraft({
          organizationId: list.organization_id,
          outreachListId: list.id,
          memberId: member.id,
          templateId,
          reputationCaseId:
            reputationCaseId === "none" ? undefined : reputationCaseId,
          backlinkId: metadataId(member.metadata, "backlink_id"),
        }),
      );
    } catch (error) {
      setProblem(readOutreachProblem(error));
    } finally {
      setBusy(null);
    }
  }

  async function approve() {
    if (!draft) return;
    setBusy("approve");
    setProblem(null);
    try {
      setDraft(await approveOutreachDraft(draft.id, list.organization_id));
      toast.success("Exact message approved");
    } catch (error) {
      setProblem(readOutreachProblem(error));
    } finally {
      setBusy(null);
    }
  }

  async function send() {
    if (!draft) return;
    if (mailboxMissing) {
      setMailboxOffer(true);
      return;
    }
    setBusy("send");
    setProblem(null);
    try {
      await advisories.recordGoAhead({
        entityType: "crm_interaction",
        entityId: draft.id,
      });
      const result = await sendOutreachDraft(draft.id, list.organization_id);
      setDraft(result.draft);
      toast.success(`Email sent to ${result.draft.recipient}`);
      onSent();
    } catch (error) {
      setProblem(readOutreachProblem(error));
    } finally {
      setBusy(null);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90dvh] overflow-y-auto sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Mail className="h-4 w-4" /> Write one email
          </DialogTitle>
          <DialogDescription>
            Lane B · {member?.party?.display_name ?? "Recipient"}. Previewed
            against the live CRM record; blank merge fields cannot be sent.
          </DialogDescription>
        </DialogHeader>

        {recipientPartyId && (
          <div className="flex flex-wrap items-center gap-2 text-xs" data-testid="single-send-recipient-fit">
            <span className="text-muted-foreground">Fit for {member?.party?.display_name ?? "recipient"}:</span>
            {fit.running && !recipientFit ? (
              <Loader2 className="h-3 w-3 animate-spin" />
            ) : recipientFit ? (
              <RecipientFitBadge fit={recipientFit} />
            ) : (
              fit.error ? (
                <span className="flex items-center gap-1 text-muted-foreground">
                  Could not read <ErrorAlchemyMenu error={fit.error} />
                </span>
              ) : (
                <span className="text-muted-foreground">Not checked</span>
              )
            )}
            <Button
             
              variant="quiet"
             
              onClick={checkFit}
              disabled={fit.running || !draft}
              title={draft ? undefined : "Preview the message first"}
              icon={fit.running && recipientFit ? <Loader2 className="animate-spin" /> : undefined}
            >
              Check fit
            </Button>
          </div>
        )}

        {!draft && (
          <div className="space-y-3">
            <Select value={templateId} onValueChange={setTemplateId}>
              <SelectTrigger>
                <SelectValue
                  placeholder={
                    busy === "loading"
                      ? "Loading templates…"
                      : "Choose a template"
                  }
                />
              </SelectTrigger>
              <SelectContent>
                {templates.map((template) => (
                  <SelectItem key={template.id} value={template.id}>
                    {template.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Select
              value={reputationCaseId}
              onValueChange={setReputationCaseId}
            >
              <SelectTrigger>
                <SelectValue placeholder="Choose the real case behind this message" />
              </SelectTrigger>
              <SelectContent>
                {/* read-gate-exempt: "No reputation case" is the choice to attach none, not an empty list (a failed read sets templatesReadFailed and shows the problem) */}
                <SelectItem value="none">No reputation case</SelectItem>
                {reputationCases.map((reputationCase) => (
                  <SelectItem key={reputationCase.id} value={reputationCase.id}>
                    {reputationCase.headline ||
                      reputationCase.source_title ||
                      reputationCase.source_domain ||
                      "Reputation case"}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            {reputationCaseId !== "none" && (
              <p className="text-xs text-muted-foreground">
                The preview binds to this live reputation record; changing it
                requires a fresh preview and approval.
              </p>
            )}
            {busy !== "loading" && !templatesReadFailed && templates.length === 0 && (
              <p className="text-sm text-muted-foreground">
                No email-ready template exists yet. Add a subject and body in{" "}
                <Link className="underline" href="/chat/message-templates/new">
                  New template
                </Link>
                .
              </p>
            )}
          </div>
        )}

        {problem && (
          <div className="rounded-md border border-destructive/30 bg-destructive/10 p-3 text-sm">
            <div className="flex gap-2 font-medium text-destructive">
              <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />{" "}
              {problem.message}
            </div>
            <p className="mt-1 pl-6 text-muted-foreground">
              Fix: {problem.fix}
            </p>
            {problem.unresolved.length > 0 && (
              <p className="mt-1 pl-6 font-mono text-xs">
                {problem.unresolved.join(", ")}
              </p>
            )}
            {problem.code === "identity_required" && (
              <p className="mt-1 pl-6">
                <Link className="font-medium text-primary underline" href="/crm/sending-identities">
                  Connect a mailbox
                </Link>
              </p>
            )}
            <ErrorAlchemyMenu error={problem.message} />
          </div>
        )}

        {draft && (
          <div className="space-y-3">
            <div className="grid gap-1 rounded-md border bg-muted/30 p-3 text-sm sm:grid-cols-2">
              <span>
                <span className="text-muted-foreground">From:</span>{" "}
                {draft.from_address || (
                  <span className="text-amber-700 dark:text-amber-300" data-testid="single-send-no-mailbox">
                    {/* read-gate-exempt: the draft has no from address; templates and mailbox read failures show their own notices */}
                    No mailbox yet. Review works; sending needs one.{" "}
                    <Link className="font-medium underline" href="/crm/sending-identities">
                      Connect a mailbox
                    </Link>
                  </span>
                )}
              </span>
              <span>
                <span className="text-muted-foreground">To:</span>{" "}
                {draft.recipient}
              </span>
            </div>
            <div className="rounded-md border">
              <div className="border-b px-3 py-2 text-sm font-medium">
                {draft.subject}
              </div>
              <pre /* rich-content-exempt: plain-text email or Google Doc body exchanged verbatim */ className="whitespace-pre-wrap px-3 py-3 font-sans text-sm leading-relaxed">
                {draft.body}
              </pre>
            </div>
            <p className="text-xs text-muted-foreground">
              Resolved: {draft.variables.join(", ") || "No merge fields"}
            </p>
            <div className="rounded-md border p-3 text-sm">
              <p className="font-medium">{approvalLabel}</p>
              {approved && (
                <p className="mt-1 flex items-center gap-1 text-emerald-600">
                  <Check className="h-4 w-4" /> Approved for this exact rendered
                  message
                </p>
              )}
            </div>
            {!draft.sent_at && (
              <PitchAdvisoryPanel
                state={advisories}
                organizationId={list.organization_id}
                actionLabel="the send"
                surfaceName="crm-outreach-single-send"
                canPerformLocal={(offer) =>
                  canPerformOutreachOffer(
                    { memberId: member?.id ?? null, templateId: draft.template_id },
                    offer,
                  )
                }
                onLocalOffer={(_advisory, offer) => {
                  const target = {
                    memberId: member?.id ?? null,
                    templateId: draft.template_id,
                  };
                  void (async () => {
                    try {
                      await advisories.recordGoAhead({
                        entityType: "crm_interaction",
                        entityId: draft.id,
                        choice: offer.action,
                      });
                      const said = await performOutreachOffer(target, offer);
                      toast.success(said);
                      if (offer.action === "schedule_at" || offer.action === "hold_until") {
                        onSent();
                        onOpenChange(false);
                      } else if (offer.action !== "label_cold") {
                        // The template changed: the previewed bytes are stale.
                        setDraft(null);
                      }
                    } catch (failure) {
                      toast.error(failure instanceof Error ? failure.message : String(failure));
                    }
                  })();
                  return true;
                }}
              />
            )}
            {(review.running || review.report || review.error) && (
              <PreSendCheckPanel state={review} onRerun={reviewBeforeSend} />
            )}
            {mailboxOffer && mailboxMissing && (
              <div
                className="rounded-md border border-amber-500/30 bg-amber-500/10 p-3 text-sm"
                data-testid="single-send-connect-mailbox"
              >
                <p className="font-medium">Sending needs a mailbox. This campaign has none.</p>
                <p className="mt-1 text-muted-foreground">
                  Connect one, choose it as the campaign&apos;s sending mailbox, then preview again.
                </p>
                <Link
                  className="mt-1 inline-block font-medium text-primary underline"
                  href="/crm/sending-identities"
                >
                  Connect a mailbox
                </Link>
              </div>
            )}
            {(draft.eligibility.blocks ?? []).map((block) => (
              <div
                key={block.code}
                className="rounded-md border border-amber-500/30 bg-amber-500/10 p-3 text-sm"
              >
                <p className="font-medium">{block.message}</p>
                <p className="mt-1 text-muted-foreground">Fix: {block.fix}</p>
              </div>
            ))}
          </div>
        )}

        {/*
          THE PLAN GATES THE ACTION, and it is gated HERE — inside the one send
          dialog — so every consumer inherits it and none can forget. The
          outreach-list workspace had no gate at all before this; the inbox's
          reply flow would have needed a second one beside it, which is how two
          surfaces end up disagreeing about who may send.

          `organizationId` is the org that OWNS the campaign, never the
          active-org selection. Compact, and inside the footer, so a blocked
          user sees the reason where they were about to press the button rather
          than as a banner somewhere else on the page. Reading, previewing and
          approving stay ungated — only the actual send is a plan capability.
        */}
        <DialogFooter className="gap-2 sm:gap-2">
          {!draft ? (
            <Button
              icon={busy === "preview" && (
                <Loader2 className="animate-spin" />
              )}
              variant="primary"
              onClick={() => void preview()}
              disabled={!templateId || busy !== null}
            >
              Preview real message
            </Button>
          ) : draft.sent_at ? (
            <Button variant="primary" onClick={() => onOpenChange(false)}>Done</Button>
          ) : (
            <>
              <Button
                icon={review.running ? <Loader2 className="animate-spin" /> : <ClipboardCheck />}
                variant="outline"
                onClick={reviewBeforeSend}
                disabled={review.running || busy !== null}
              >
                Review before send
              </Button>
              {draft.approval.required_for_this_message && !approved && (
                <Button
                  icon={busy === "approve" && (
                    <Loader2 className="animate-spin" />
                  )}
                  variant="outline"
                  onClick={() => void approve()}
                  disabled={busy !== null}
                >
                  Approve exact message
                </Button>
              )}
              <CapabilityGate
                capability="outreach.send"
                organizationId={list.organization_id}
                compact
              >
                <Button
                  icon={busy === "send" ? (
                    <Loader2 className="animate-spin" />
                  ) : (
                    <Send />
                  )}
                  variant="primary"
                  onClick={() => void send()}
                  disabled={!canSend || busy !== null}
                >
                  Send email
                </Button>
              </CapabilityGate>
            </>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
