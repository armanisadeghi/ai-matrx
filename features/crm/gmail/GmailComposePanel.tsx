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
 * 🚨 THIS PANEL WRITES NOTHING EITHER. The SERVER puts the message on the
 * record's timeline — associated with the Person, and with the deal or project
 * the panel was opened from (HubSpot's "Associated with", which is the whole
 * point of sending from a record instead of from Gmail) — inside the same
 * reviewed-send request that sends it. What this panel owns is the PLAN: which
 * Person the row belongs to, which contact point, and whose address each Cc is,
 * decided from the recipients on the card at the click (`planSend`). The card
 * shows every gap the server reports; this panel claims a timeline row only when
 * the answer named one.
 */

import { useEffect, useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { AlertTriangle, ArrowLeft, Mail, UserRound } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Input } from "@ai-matrx/design-system";
import { ProTextarea } from "@/components/official/ProTextarea";
import { Skeleton } from "@ai-matrx/design-system";
import { EntityRef } from "@/components/official/entity-ref/EntityRef";
import { recordToast, toast } from "@/lib/toast";
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
  type GmailRecipientOption,
} from "./recipients";
import { addressOfMailbox, splitMailboxField } from "./mailbox";
import {
  interactionIdOfSendData,
  type ReviewedGmailSendPlan,
} from "./reviewed-send-contract";
import { preflightGmailRecipients } from "./preflight";
import { assessGmailRecipientIntegrity } from "./recipient-integrity";
import type { GmailDraftedBy } from "./types";
import { ErrorAlchemyMenu } from "@/components/errors/ErrorAlchemyMenu";

export interface GmailComposePanelProps {
  partyId: string;
  /**
   * The organization the row is filed under. The PARTY's own organization always
   * wins (two live triggers on `crm.interaction` insist, and the timeline is the
   * Person's), so an opener that knows only the Person — the chat entrance —
   * passes null and this panel reads it off the loaded record. Nothing is ever
   * resolved from the active organization.
   */
  organizationId?: string | null;
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
  // The party's own organization, with the caller's value only as the value
  // before the record has loaded (the write waits for the record either way).
  const recordOrganizationId =
    detail?.party.organization_id ?? organizationId ?? "";
  const inventory = useGoogleConnectionInventory();

  const [step, setStep] = useState<Step>("compose");
  const [to, setTo] = useState(initialTo?.trim() ?? "");
  const [cc, setCc] = useState("");
  const [subject, setSubject] = useState(initialSubject ?? "");
  const [body, setBody] = useState(initialBody ?? "");
  const [connectionId, setConnectionId] = useState<string | null>(() =>
    preferredGoogleConnectionId("gmail-send"),
  );
  const [seeded, setSeeded] = useState(Boolean(initialTo?.trim()));

  /**
   * 🚨 THE DRAFT BELONGS TO ONE RECORD. `gmailComposeWindow` is a singleton, so
   * opening compose on Ada, navigating to Bo and opening it again reuses this
   * component instance with a new `partyId`. Without this, Ada's half-written
   * message would still be on screen while every write used Bo's id and Bo's
   * organization (Bugbot MEDIUM #3, 2026-09-17). The window also mounts this
   * panel under `key={partyId}`; this reset is the belt to that's braces, so
   * the panel is correct wherever it is mounted.
   */
  const [ownerPartyId, setOwnerPartyId] = useState(partyId);
  if (ownerPartyId !== partyId) {
    setOwnerPartyId(partyId);
    setStep("compose");
    setTo(initialTo?.trim() ?? "");
    setCc("");
    setSubject(initialSubject ?? "");
    setBody(initialBody ?? "");
    setSeeded(Boolean(initialTo?.trim()));
  }

  // No useMemo anywhere in this file — the React Compiler is on (CLAUDE.md).
  const options = gmailRecipientOptions(detail?.contactPoints ?? []);
  // The resolver below runs long after render; a ref keeps it reading the
  // CURRENT options rather than the ones captured when review opened.
  const optionsRef = useRef(options);
  optionsRef.current = options;

  // The record's own default address, once, and only when the caller did not
  // name one. Re-running this on every load would fight the person's typing.
  useEffect(() => {
    if (seeded || options.length === 0) return;
    const preferred = defaultGmailRecipient(options);
    if (preferred) setTo(preferred.address);
    setSeeded(true);
  }, [options, seeded]);

  // 🚨 THE TYPED FIELD IS PARSED, never compared as text: a person who writes
  // `Ada Lovelace <ada@example.com>` — the form every mail client shows — is
  // writing the record's OWN address, and comparing strings made this step say
  // the record does not hold it (VERIFY-B1-B2-R2 break A / N2).
  const typedAddress = addressOfMailbox(to);
  const matched =
    (typedAddress
      ? options.find(
          (option) => option.address.toLocaleLowerCase() === typedAddress,
        )
      : null) ?? null;

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
          // Quote-aware split: `"Doe, John" <john@x.com>` is ONE recipient, and
          // each piece keeps the form the person wrote (the send authority and
          // the server both parse it — `./mailbox.ts`).
          cc: splitMailboxField(cc),
          subject,
          body,
        },
      }
    : null;

  /**
   * 🚨 WHERE THE SERVER FILES THE ROW, DECIDED AT THE CLICK — never from this
   * panel's draft. The card's fields are editable up to Send, so the Person the
   * row belongs to, the contact point, and whose address each Cc is, are all
   * decided from what is on the card at that moment. Before the server owned the
   * record, this ran AFTER the send on the reported receipt; it now runs just
   * before the post, over the same parsed addresses (the two parsers agree case
   * by case — `./mailbox-agreement.test.ts`).
   */
  function planSend(sent: { to: string; cc: string[] }): ReviewedGmailSendPlan {
    const integrity = assessGmailRecipientIntegrity({
      sentTo: sent.to,
      // A Cc is a recipient: it is attributed onto the row so the timeline can
      // say whose address it is (N9).
      sentCc: sent.cc,
      source: { kind: "record", heldAddresses: optionsRef.current },
    });
    if (!integrity.recordOnRecord) {
      /**
       * 🚨 A CHANGED RECIPIENT IS A DIFFERENT PERSON UNTIL SOMETHING PROVES
       * OTHERWISE (`./recipient-integrity.ts`, the ONE primitive both send paths
       * consume). The message still goes — it is a legitimate message — but NO
       * record fields go with it, so the server files nothing, and the refusal
       * sentence (which names the address) is shown afterwards. Until 2026-09-17
       * this panel recorded such a send on the open record and said "Sent, and
       * recorded on Ada's timeline" — a row on a customer's history for a message
       * she never received (VERIFY-B1-B2 D1).
       */
      return {
        context: { organizationId: recordOrganizationId || null },
        attributedAddress: null,
        unattributed: integrity.refusal,
      };
    }
    return {
      context: {
        // 🚨 THE PARTY'S OWN ORGANIZATION WINS: `crm._inherit_parent_org` RAISES
        // when the request's organization differs from the party's (D8).
        organizationId: recordOrganizationId || null,
        partyId,
        dealId: dealId ?? null,
        projectId: projectId ?? null,
        contactPointId: integrity.contactPointId,
        mediumId: integrity.mediumId,
        ccAttribution: integrity.cc,
        draftedBy: draftedBy ?? null,
      },
      attributedAddress: integrity.attributedAddress,
      unattributed: null,
    };
  }

  useEffect(() => {
    if (step !== "review" || !mailbox) return;
    registerAskResolver(callId, (response) => {
      if (response.confirmed !== true) {
        // Declined or dismissed in the card: nothing left, nothing recorded.
        setStep("compose");
        return;
      }
      /**
       * 🚨 THE SERVER WROTE THE ROW, OR SAID WHY IT DID NOT — and the card has
       * already shown every one of those sentences (a record that did not land, a
       * missing sending event, a refused association edge, a recipient warning).
       * This panel therefore claims a timeline row ONLY when the server named
       * one, and never repeats what the card already said.
       */
      const interactionId = interactionIdOfSendData(response.data);
      if (interactionId) {
        // This sentence NAMES A RECORD, so it is raised through `recordToast`
        // with its identity: dismissed if the record is renamed, deleted, or
        // simply left behind (lib/toast.ts, FIX-R17).
        recordToast.success(
          { type: "party", id: partyId, title: partyLabel },
          `Sent, and recorded on ${partyLabel}'s timeline.`,
        );
      }
      onSent?.(interactionId);
      onClose();
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
          <ErrorAlchemyMenu />
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
      {/* The project the message is composed from is ASSOCIATED with the sent
          row (`./associations.ts`), so it is named here before the send — an
          association nobody was told about is not disclosure. */}
      {projectId ? (
        <>
          <span>and</span>
          <EntityRef token="project" id={projectId} />
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
          >
            <ArrowLeft className="mr-1.5 h-4 w-4" />
            Back to editing
          </Button>
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
        <GmailReviewCard
          ask={ask}
          /* THE LAST GATE, on the card's own recipients, at Send time. The
             compose step's check was about the address that was in ITS To
             field; this one is about whoever is about to receive it. */
          preflight={(draft) =>
            preflightGmailRecipients({
              to: draft.to,
              cc: draft.cc,
              options: optionsRef.current,
              // Every address is asked about, held or not: an address this
              // record does not hold is resolved against the organization's own
              // contact mediums, where the unsubscribes live (D2).
              organizationId: recordOrganizationId || null,
            })
          }
          /* WHERE THE SERVER FILES THE ROW — decided from the card's own
             recipients at the click, not from this panel's draft. */
          plan={planSend}
        />
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
            This address is not one this record holds. It is still checked
            against your organization&apos;s unsubscribes and blocklist before it
            sends — but the message will be recorded on no record&apos;s
            timeline, because we cannot tell whose address it is.
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
          <ErrorAlchemyMenu />
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
