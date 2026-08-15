"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { AlertTriangle, Check, Loader2, Mail, Send } from "lucide-react";
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
      .catch((error: unknown) => setProblem(readOutreachProblem(error)))
      .finally(() => setBusy(null));
  }, [list.organization_id, memberReputationCaseId, open]);

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
      setDraft(await approveOutreachDraft(draft.id));
      toast.success("Exact message approved");
    } catch (error) {
      setProblem(readOutreachProblem(error));
    } finally {
      setBusy(null);
    }
  }

  async function send() {
    if (!draft) return;
    setBusy("send");
    setProblem(null);
    try {
      const result = await sendOutreachDraft(draft.id);
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
            {busy !== "loading" && templates.length === 0 && (
              <p className="text-sm text-muted-foreground">
                No email-ready template exists yet. Add a subject and body in{" "}
                <Link
                  className="underline"
                  href="/settings/message-templates/new"
                >
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
          </div>
        )}

        {draft && (
          <div className="space-y-3">
            <div className="grid gap-1 rounded-md border bg-muted/30 p-3 text-sm sm:grid-cols-2">
              <span>
                <span className="text-muted-foreground">From:</span>{" "}
                {draft.from_address}
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
              <pre className="whitespace-pre-wrap px-3 py-3 font-sans text-sm leading-relaxed">
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
              onClick={() => void preview()}
              disabled={!templateId || busy !== null}
            >
              {busy === "preview" && (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              )}
              Preview real message
            </Button>
          ) : draft.sent_at ? (
            <Button onClick={() => onOpenChange(false)}>Done</Button>
          ) : (
            <>
              {draft.approval.required_for_this_message && !approved && (
                <Button
                  variant="outline"
                  onClick={() => void approve()}
                  disabled={busy !== null}
                >
                  {busy === "approve" && (
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  )}
                  Approve exact message
                </Button>
              )}
              <CapabilityGate
                capability="outreach.send"
                organizationId={list.organization_id}
                compact
              >
                <Button
                  onClick={() => void send()}
                  disabled={!canSend || busy !== null}
                >
                  {busy === "send" ? (
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  ) : (
                    <Send className="mr-2 h-4 w-4" />
                  )}
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
