"use client";

/**
 * GmailComposePanel — write an email from a CRM record and send it through the
 * EXISTING reviewed-send path.
 *
 * 🚨 THIS PANEL DOES NOT SEND. It composes; `GmailReviewCard` sends. That card
 * is the authorization Google approved us on: every field editable, the bytes
 * on screen are the bytes that leave, one message per approval. A second Send
 * button here would be a second send path, and a send path that can skip the
 * outbound gate eventually skips it (crm/compliance/FEATURE.md).
 *
 * So the panel has exactly two steps:
 *   1. COMPOSE — to (from this record's own addresses, or typed), cc, subject,
 *      body, and the sending account chosen from the person's own connected
 *      Google accounts and the organization's shared ones.
 *   2. REVIEW — the canonical card, mounted verbatim, with the consequence of
 *      pressing its Send spelled out above it.
 *
 * Between the two sits `crm.check_send_eligibility`, the ONE send authority
 * (unsubscribes, blocklist, jurisdiction, the sender's standing). A refused
 * recipient never reaches step 2, because the card's Send posts straight to the
 * reviewed-send endpoint and cannot be gated from outside it.
 *
 * When it resolves sent, `recordGmailSendInteraction` puts the message on the
 * record's timeline — associated with the Person, and with the deal when the
 * panel was opened from one (HubSpot's "Associated with", which is the whole
 * point of sending from a record instead of from Gmail).
 */

import { useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { AlertTriangle, ArrowLeft, Mail, UserRound } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Input } from "@ai-matrx/design-system";
import { ProTextarea } from "@/components/official/ProTextarea";
import { Skeleton } from "@ai-matrx/design-system";
import { EntityRef } from "@/components/official/entity-ref/EntityRef";
import { toast } from "@/lib/toast";
import { cn } from "@/lib/utils";
import { useAppSelector } from "@/lib/redux/hooks";
import { selectUserId } from "@/lib/redux/selectors/userSelectors";
import { GmailReviewCard } from "@/features/google-workspace/agent/GmailReviewCard";
import { GoogleAccountSelect } from "@/features/google-workspace/GoogleAccountSelect";
import {
  GOOGLE_WORKSPACE_SETTINGS_HREF,
  eligibleGoogleConnections,
  preferredGoogleConnectionId,
  rememberGoogleConnection,
} from "@/features/google-workspace/connection";
import { useGoogleConnectionInventory } from "@/features/marketing/google/hooks";
import { registerAskResolver } from "@/features/agents/ui-first-tools/redux/ask-resolver-registry";
import type { PendingAsk } from "@/features/agents/ui-first-tools/redux/pending-asks.slice";
import { checkSendEligibility } from "@/features/crm/compliance/service";
import { usePartyDetail } from "@/features/crm/hooks/usePartyDetail";
import {
  defaultGmailRecipient,
  gmailRecipientOptions,
  parseAddressList,
  type GmailRecipientOption,
} from "./recipients";
import {
  GMAIL_AUDIT_PENDING_MESSAGE,
  recordGmailSendInteraction,
} from "./service";
import type { GmailDraftedBy } from "./types";

export interface GmailComposePanelProps {
  partyId: string;
  /** Explicit, always — no resolver picks an organization for a write. */
  organizationId: string;
  /** The person or company the message is about. */
  partyLabel: string;
  /** Present when composed from a deal — the sent record is associated with it. */
  dealId?: string | null;
  dealLabel?: string | null;
  /** Present when composed from a project (carried, associated, not a column). */
  projectId?: string | null;
  initialTo?: string | null;
  initialSubject?: string | null;
  initialBody?: string | null;
  /** Present when an agent wrote the draft this panel opened with. */
  draftedBy?: GmailDraftedBy | null;
  /** Called after the send is recorded, so the host can refresh the timeline. */
  onSent?: (interactionId: string | null) => void;
  onClose: () => void;
}

type Step = "compose" | "review";

function AddressChip({
  option,
  selected,
  onSelect,
}: {
  option: GmailRecipientOption;
  selected: boolean;
  onSelect: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onSelect}
      title={option.warning ?? undefined}
      className={cn(
        "inline-flex min-h-11 items-center gap-1.5 rounded-md border px-2 text-xs transition-colors sm:min-h-7",
        selected
          ? "border-primary bg-primary/10 text-foreground"
          : "border-border text-muted-foreground hover:bg-accent hover:text-foreground",
      )}
    >
      <UserRound className="h-3.5 w-3.5 shrink-0" aria-hidden />
      <span className="truncate">{option.address}</span>
      {option.label ? (
        <span className="shrink-0 text-[11px] text-muted-foreground">
          {option.label}
        </span>
      ) : null}
      {option.warning ? (
        <AlertTriangle
          className="h-3.5 w-3.5 shrink-0 text-warning"
          aria-hidden
        />
      ) : null}
    </button>
  );
}

export function GmailComposePanel({
  partyId,
  organizationId,
  partyLabel,
  dealId,
  dealLabel,
  projectId,
  initialTo,
  initialSubject,
  initialBody,
  draftedBy,
  onSent,
  onClose,
}: GmailComposePanelProps) {
  const viewerId = useAppSelector(selectUserId);
  const { detail, isLoading, error } = usePartyDetail(partyId);
  const inventory = useGoogleConnectionInventory();

  const [step, setStep] = useState<Step>("compose");
  const [to, setTo] = useState(initialTo?.trim() ?? "");
  const [cc, setCc] = useState("");
  const [subject, setSubject] = useState(initialSubject ?? "");
  const [body, setBody] = useState(initialBody ?? "");
  const [connectionId, setConnectionId] = useState<string | null>(() =>
    preferredGoogleConnectionId("gmail-send"),
  );
  const [recording, setRecording] = useState(false);

  // No useMemo anywhere in this file — the React Compiler is on (CLAUDE.md).
  const options = gmailRecipientOptions(detail?.contactPoints ?? []);

  // The record's own default address, once, and only when the caller did not
  // name one. Re-running this on every load would fight the person's typing.
  const [seeded, setSeeded] = useState(Boolean(initialTo?.trim()));
  useEffect(() => {
    if (seeded || options.length === 0) return;
    const preferred = defaultGmailRecipient(options);
    if (preferred) setTo(preferred.address);
    setSeeded(true);
  }, [options, seeded]);

  const matched =
    options.find(
      (option) =>
        option.address.toLocaleLowerCase() === to.trim().toLocaleLowerCase(),
    ) ?? null;

  const mailboxes = eligibleGoogleConnections(
    inventory.data?.connections ?? [],
    "gmail-send",
    connectionId,
  );
  const mailbox =
    mailboxes.find((entry) => entry.id === connectionId) ?? mailboxes[0] ?? null;

  /**
   * The outbound gate. Only asked when the recipient IS a contact point we
   * hold — an address typed by hand has no suppression record to look up, and
   * the panel says so rather than implying it was cleared.
   */
  const eligibility = useQuery({
    queryKey: ["crm", "gmail-compose", "eligibility", matched?.mediumId ?? null],
    queryFn: () => checkSendEligibility({ mediumId: matched?.mediumId ?? "" }),
    enabled: Boolean(matched?.mediumId),
    staleTime: 60_000,
  });

  const gated = Boolean(matched?.mediumId);
  const checking = gated && eligibility.isLoading;
  const verdict = eligibility.data;
  const spineUnreadable = eligibility.isError;
  // 🚨 "No verdict yet" is never permission (the same rule the approval queue
  // learned the hard way): review opens only once the checks have answered.
  const refused = gated && (spineUnreadable || (verdict ? !verdict.allowed : true));

  const composed = Boolean(
    mailbox && to.trim().includes("@") && subject.trim() && body.trim(),
  );

  function selectMailbox(next: string) {
    setConnectionId(next);
    rememberGoogleConnection("gmail-send", next);
  }

  function selectAddress(option: GmailRecipientOption) {
    setTo(option.address);
  }

  /**
   * The review step's ask. The card resolves through the ask-resolver registry,
   * so the panel registers a resolver against a call id of its own and writes
   * the record when the card reports what it sent.
   */
  const callId = `crm-gmail-compose:${partyId}`;
  const ask: PendingAsk | null = mailbox
    ? {
        callId,
        conversationId: callId,
        toolName: "crm_gmail_compose",
        kind: "email_review",
        status: "pending",
        createdAtMs: Date.now(),
        email: {
          connectionId: mailbox.id,
          fromEmail: mailbox.account_email,
          to: to.trim(),
          cc: parseAddressList(cc),
          subject,
          body,
        },
      }
    : null;

  useEffect(() => {
    if (step !== "review" || !mailbox) return;
    registerAskResolver(callId, (response) => {
      if (response.confirmed !== true) {
        // Declined or dismissed in the card: nothing left, nothing recorded.
        setStep("compose");
        return;
      }
      const receiptData = response.data;
      const messageId =
        receiptData && typeof receiptData === "object"
          ? (receiptData as { message_id?: unknown }).message_id
          : null;
      if (typeof messageId !== "string") {
        // The message went out but the card did not name it. Say so — the
        // record cannot carry an external id it was never given.
        toast.error(
          "The message was sent but Gmail's message id did not come back, so it could not be recorded on the timeline.",
        );
        onClose();
        return;
      }
      setRecording(true);
      void (async () => {
        const result = await recordGmailSendInteraction({
          receipt: {
            messageId,
            connectionId: mailbox.id,
            fromEmail: mailbox.account_email,
            to: to.trim(),
            cc: parseAddressList(cc),
            subject,
            body,
          },
          association: {
            partyId,
            organizationId,
            dealId: dealId ?? null,
            projectId: projectId ?? null,
            contactPointId: matched?.contactPointId ?? null,
            mediumId: matched?.mediumId ?? null,
          },
          approvedByUserId: viewerId ?? null,
          draftedBy: draftedBy ?? null,
        });
        setRecording(false);
        if (result.failure) {
          // The message HAS LEFT. Never a silent failure and never a retry the
          // person did not ask for — a second attempt could send it twice.
          toast.error(
            `The message was sent, but it could not be recorded on ${partyLabel}'s timeline. Log it by hand so the history is true.`,
            { description: result.failure },
          );
        } else if (result.auditTrailPending) {
          toast.warning(GMAIL_AUDIT_PENDING_MESSAGE);
        } else {
          toast.success(`Sent, and recorded on ${partyLabel}'s timeline.`);
        }
        onSent?.(result.interactionId);
        onClose();
      })();
    });
  }, [step, mailbox?.id, callId]);

  if (isLoading && !detail) {
    return (
      <div className="space-y-3 p-3">
        <Skeleton className="h-9 w-full rounded-md" />
        <Skeleton className="h-9 w-full rounded-md" />
        <Skeleton className="h-40 w-full rounded-md" />
      </div>
    );
  }

  if (error && !detail) {
    return (
      <div className="p-3 text-sm text-muted-foreground">
        <p className="text-foreground">
          This record could not be loaded, so there is nobody to write to.
        </p>
        <p className="mt-1">{error}</p>
      </div>
    );
  }

  const associations = (
    <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
      <span>Will be recorded on</span>
      {/* THE DOOR LAW: every record this panel names, the reader can open. */}
      <EntityRef token="party" id={partyId} name={partyLabel} />
      {dealId ? (
        <>
          <span>and</span>
          <EntityRef token="crm_deal" id={dealId} name={dealLabel ?? "the deal"} />
        </>
      ) : null}
    </div>
  );

  if (step === "review" && ask && mailbox) {
    return (
      <div className="flex min-h-0 flex-1 flex-col gap-2 overflow-y-auto p-3">
        <div className="flex items-center justify-between gap-2">
          <Button
            variant="ghost"
            size="sm"
            onClick={() => setStep("compose")}
            disabled={recording}
          >
            <ArrowLeft className="mr-1.5 h-4 w-4" />
            Back to editing
          </Button>
          {recording ? (
            <span className="text-xs text-muted-foreground">
              Recording it on the timeline…
            </span>
          ) : null}
        </div>
        {/* THE CONSEQUENCE, before the click that causes it. */}
        <p className="rounded-md border border-border bg-muted/40 px-2.5 py-2 text-xs text-foreground">
          Pressing Send delivers this message to {to.trim()} from{" "}
          {mailbox.account_email ?? "your connected Google account"}. Email
          cannot be unsent. It will be recorded on {partyLabel}&apos;s timeline
          with the message id, the account it went out through, and your name as
          the person who approved it.
        </p>
        {associations}
        <GmailReviewCard ask={ask} />
      </div>
    );
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-3 overflow-y-auto p-3">
      {mailbox ? (
        <div className="grid gap-1">
          <GoogleAccountSelect
            connections={mailboxes}
            connectionId={mailbox.id}
            onConnectionChange={selectMailbox}
            label="Send from"
          />
          <p className="text-[11px] text-muted-foreground">
            {mailbox.owner_type === "organization"
              ? "Shared by your organization — everyone here can send from it."
              : "Your own connected Google account."}
          </p>
        </div>
      ) : (
        <div className="rounded-md border border-border bg-muted/40 p-2.5 text-xs">
          <p className="text-foreground">
            No connected Google account currently has permission to send mail.
          </p>
          <a
            href={GOOGLE_WORKSPACE_SETTINGS_HREF}
            className="mt-1 inline-flex text-primary underline-offset-2 hover:underline"
          >
            Connect a Google account
          </a>
        </div>
      )}

      <div className="grid gap-1.5">
        <Label htmlFor="crm-gmail-to">To</Label>
        <Input
          id="crm-gmail-to"
          value={to}
          onChange={(event) => setTo(event.target.value)}
          placeholder="name@example.com"
          className="text-base"
        />
        {options.length > 0 ? (
          <div className="flex flex-wrap gap-1.5">
            {options.map((option) => (
              <AddressChip
                key={option.contactPointId}
                option={option}
                selected={option.address === to.trim()}
                onSelect={() => selectAddress(option)}
              />
            ))}
          </div>
        ) : (
          <p className="text-[11px] text-muted-foreground">
            This record holds no email address yet — type one, and it will be
            sent on your own judgement.
          </p>
        )}
        {matched?.warning ? (
          <p className="text-[11px] text-warning">{matched.warning}</p>
        ) : null}
        {!gated && to.trim().includes("@") ? (
          <p className="text-[11px] text-warning">
            This address is not a contact point on this record, so the
            unsubscribe and blocklist checks have nothing to check. You are
            sending it on your own judgement.
          </p>
        ) : null}
      </div>

      <div className="grid gap-1.5">
        <Label htmlFor="crm-gmail-cc">
          Cc <span className="text-muted-foreground">(optional)</span>
        </Label>
        <Input
          id="crm-gmail-cc"
          value={cc}
          onChange={(event) => setCc(event.target.value)}
          placeholder="Separate addresses with commas"
          className="text-base"
        />
      </div>

      <div className="grid gap-1.5">
        <Label htmlFor="crm-gmail-subject">Subject</Label>
        <Input
          id="crm-gmail-subject"
          value={subject}
          onChange={(event) => setSubject(event.target.value)}
          className="text-base"
        />
      </div>

      <div className="grid gap-1.5">
        <Label htmlFor="crm-gmail-body">Message</Label>
        <ProTextarea
          id="crm-gmail-body"
          value={body}
          onChange={(event) => setBody(event.target.value)}
          rows={10}
          autoGrow
          minHeight={160}
          maxHeight={420}
          className="text-base"
          aria-label="Message body"
        />
      </div>

      {/* The gate's verdict, in its own words and with its own fixes. */}
      {checking ? (
        <p className="text-xs text-muted-foreground">
          Checking this recipient against the unsubscribes, the blocklist and
          this sender&apos;s standing…
        </p>
      ) : null}
      {spineUnreadable ? (
        <p className="rounded-md border border-destructive/40 bg-destructive/10 px-2.5 py-2 text-xs text-foreground">
          The outbound checks could not be read, so this message is not offered
          for sending. Nothing has been sent — try again in a moment.
        </p>
      ) : null}
      {verdict && !verdict.allowed ? (
        <div className="space-y-1 rounded-md border border-destructive/40 bg-destructive/10 px-2.5 py-2">
          <p className="text-xs font-medium text-foreground">
            This message cannot be sent to that address right now.
          </p>
          {verdict.blocks.map((block) => (
            <p key={block.code} className="break-words text-[11px]">
              <span className="text-foreground">{block.message}</span>{" "}
              <span className="text-muted-foreground">{block.fix}</span>
            </p>
          ))}
        </div>
      ) : null}

      {associations}

      <div className="flex items-center justify-between gap-2 border-t border-border pt-2">
        <span className="text-[11px] text-muted-foreground">
          Nothing sends from this step — the next screen is the one that sends.
        </span>
        <div className="flex items-center gap-2">
          <Button variant="ghost" size="sm" onClick={onClose}>
            Cancel
          </Button>
          <Button
            size="sm"
            onClick={() => setStep("review")}
            disabled={!composed || refused || checking}
          >
            <Mail className="mr-1.5 h-4 w-4" />
            Review before sending
          </Button>
        </div>
      </div>
    </div>
  );
}
