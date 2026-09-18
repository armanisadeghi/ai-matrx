"use client";

/**
 * /crm/sending-identities — the mailboxes this organization may send from.
 *
 * THE LAW this screen exists to make real (docs/handoffs/outreach-system.md
 * §5.1): outreach leaves YOUR mailbox on YOUR domain. AI Matrx never sends on
 * your behalf from its own servers, which is why one careless sender can never
 * damage anybody else's delivery — including ours.
 *
 * Every row is a door (the identity, its issues, its fix). Every problem on the
 * list carries the action that resolves it; nothing here is a status a person
 * can only stare at.
 */

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  ArrowRight,
  CircleCheck,
  FileClock,
  Loader2,
  MailPlus,
  Power,
  ShieldAlert,
  TriangleAlert,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@ai-matrx/design-system";
import { CapabilityGate } from "@/features/entitlements/components/CapabilityGate";
import { cn } from "@/lib/utils";
import { toast } from "@/lib/toast";
import { OrganizationRequiredNotice } from "@/features/organizations/components/OrganizationRequiredNotice";
import { confirm } from "@/components/dialogs/confirm/ConfirmDialogHost";
import {
  useCorrespondenceIdentities,
  useSendingIdentities,
} from "@/features/crm/sending-identities/hooks";
import {
  promoteToOutreachMailbox,
  setSendingPolicy,
} from "@/features/crm/sending-identities/service";
import { STATUS_COPY } from "@/features/crm/sending-identities/types";
import type { SendingIdentityView } from "@/features/crm/sending-identities/types";
import {
  CORRESPONDENCE_BADGE_LABEL,
  CORRESPONDENCE_SECTION_EMPTY,
  CORRESPONDENCE_SECTION_TITLE,
  PROMOTE_TO_CAMPAIGNS_CONFIRM_LABEL,
  PROMOTE_TO_CAMPAIGNS_CONSEQUENCE,
  PROMOTE_TO_CAMPAIGNS_TITLE,
  correspondenceRevealLabel,
  correspondenceRowSentence,
} from "@/features/crm/sending-identities/purpose";
import { formatRelativeTime } from "@/utils/datetime";
import { ConnectMailboxDialog } from "./ConnectMailboxDialog";
import { OutreachBringUpSection } from "./OutreachBringUpSection";

function StatusBadge({ status }: { status: SendingIdentityView["status"] }) {
  const copy = STATUS_COPY[status];
  return (
    <Badge
      variant="outline"
      className={cn(
        "shrink-0",
        copy.tone === "good" &&
          "border-emerald-500/40 text-emerald-700 dark:text-emerald-400",
        copy.tone === "bad" && "border-destructive/40 text-destructive",
        copy.tone === "progress" &&
          "border-amber-500/40 text-amber-700 dark:text-amber-400",
      )}
    >
      {copy.label}
    </Badge>
  );
}

/**
 * A mailbox mid-setup is NOT broken. Red is reserved for something that
 * genuinely failed (a pause, a dead connection, the org switch); a gate the
 * user simply hasn't finished yet reads as the calm next step it is — in
 * neutral color, in next-step voice (Arman, 2026-08-16: the red "hasn't
 * proven that it owns" line read as an accusation).
 */
const SETUP_STAGE_FIXES = new Set([
  "publish_dns_record",
  "check_domain",
  "check_authentication",
  "start_warmup",
  "wait_for_warmup",
  "upgrade_plan",
  "connect_mailbox",
]);

function IdentityRow({ identity }: { identity: SendingIdentityView }) {
  const issues = identity.issues ?? [];
  const blocking = issues.filter((issue) => !issue.transient);
  const warming = identity.warmup;
  const firstBlocking = blocking[0];
  // A draft or verifying mailbox is mid-setup by definition — whatever its
  // first unmet gate is, it is a next step, not a failure.
  const setupStage =
    identity.status === "draft" ||
    identity.status === "verifying" ||
    (firstBlocking != null && SETUP_STAGE_FIXES.has(firstBlocking.fix_action));

  return (
    <Link
      href={`/crm/sending-identities/${identity.id}`}
      className="block rounded-lg border border-border bg-card p-3 transition-colors hover:border-foreground/20 hover:bg-accent/40"
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex min-w-0 items-center gap-2">
            <p className="truncate text-sm font-medium text-foreground">
              {identity.from_address}
            </p>
            <StatusBadge status={identity.status} />
          </div>
          <p className="mt-0.5 truncate text-xs text-muted-foreground">
            {identity.from_name ? `${identity.from_name} · ` : ""}
            {identity.sending_domain}
          </p>
        </div>
        <ArrowRight className="mt-1 h-4 w-4 shrink-0 text-muted-foreground" />
      </div>

      {identity.status === "warming" && warming ? (
        <div className="mt-2.5">
          <div className="flex items-center justify-between text-xs text-muted-foreground">
            <span>
              Warming up — day {warming.day} of {warming.total_days}
            </span>
            <span>{warming.daily_allowance} messages a day for now</span>
          </div>
          <div className="mt-1 h-1.5 w-full overflow-hidden rounded-full bg-muted">
            <div
              className="h-full rounded-full bg-amber-500 transition-all"
              style={{ width: `${warming.percent_complete}%` }}
            />
          </div>
        </div>
      ) : null}

      {identity.can_run_campaign ? (
        <p className="mt-2.5 flex items-center gap-1.5 text-xs text-emerald-600 dark:text-emerald-400">
          <CircleCheck className="h-3.5 w-3.5" />
          Ready for campaigns
        </p>
      ) : blocking.length > 0 ? (
        <p
          className={cn(
            "mt-2.5 flex items-start gap-1.5 text-xs",
            setupStage
              ? "text-amber-700 dark:text-amber-400"
              : "text-destructive",
          )}
        >
          {setupStage ? (
            <ArrowRight className="mt-0.5 h-3.5 w-3.5 shrink-0" />
          ) : (
            <TriangleAlert className="mt-0.5 h-3.5 w-3.5 shrink-0" />
          )}
          <span className="min-w-0">
            {setupStage ? "Next step: " : ""}
            {firstBlocking.message}
            {blocking.length > 1
              ? ` (+${blocking.length - 1} more to fix)`
              : ""}
          </span>
        </p>
      ) : null}
    </Link>
  );
}

/**
 * A CORRESPONDENCE MAILBOX, RENDERED AS WHAT IT IS (VERIFY-B1-B2-R5 W1).
 *
 * The outbound spine records a connected mailbox as `purpose='correspondence'`
 * on its first reviewed 1:1 send so that send has an audit trail. Rendered as an
 * ordinary row it read `Not set up` with the next step "prove you own this
 * domain" — on `gmail.com`, forever. So: no status badge, no setup step, no
 * issues list (every one of them is a campaign gate); what it says instead is
 * why the row exists and when it last sent, plus the promotion the server allows
 * with its consequence stated first.
 */
function CorrespondenceRow({
  identity,
  onPromoted,
}: {
  identity: SendingIdentityView;
  onPromoted: () => void;
}) {
  const [promoting, setPromoting] = useState(false);
  const [failure, setFailure] = useState<string | null>(null);

  async function promote() {
    const ok = await confirm({
      title: PROMOTE_TO_CAMPAIGNS_TITLE,
      description: PROMOTE_TO_CAMPAIGNS_CONSEQUENCE,
      confirmLabel: PROMOTE_TO_CAMPAIGNS_CONFIRM_LABEL,
    });
    if (!ok) return;
    setPromoting(true);
    setFailure(null);
    try {
      await promoteToOutreachMailbox(identity.id);
      toast.success(
        `${identity.from_address} is now a campaign mailbox — finish its setup.`,
      );
      onPromoted();
    } catch (error) {
      setFailure(error instanceof Error ? error.message : String(error));
    } finally {
      setPromoting(false);
    }
  }

  return (
    <div className="rounded-lg border border-border bg-card p-3">
      <div className="flex items-start justify-between gap-3">
        <Link
          href={`/crm/sending-identities/${identity.id}`}
          className="min-w-0 flex-1 rounded-sm hover:underline"
        >
          <div className="flex min-w-0 items-center gap-2">
            <p className="truncate text-sm font-medium text-foreground">
              {identity.from_address}
            </p>
            <Badge variant="outline" className="shrink-0">
              {CORRESPONDENCE_BADGE_LABEL}
            </Badge>
          </div>
          <p className="mt-0.5 flex items-start gap-1.5 text-xs text-muted-foreground">
            <FileClock className="mt-0.5 h-3.5 w-3.5 shrink-0" />
            <span className="min-w-0">
              {correspondenceRowSentence(identity)}{" "}
              {identity.last_send_at
                ? `Last sent ${formatRelativeTime(identity.last_send_at)}.`
                : "No send recorded on it yet."}
            </span>
          </p>
        </Link>
        <Button
          size="sm"
          variant="outline"
          className="shrink-0"
          disabled={promoting}
          onClick={() => void promote()}
        >
          {promoting ? (
            <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />
          ) : null}
          Use for campaigns
        </Button>
      </div>
      {failure ? (
        <p className="mt-2 text-xs text-destructive">{failure}</p>
      ) : null}
    </div>
  );
}

export function SendingIdentitiesPage() {
  const router = useRouter();
  const { identities, policy, loading, error, organizationRequired, reload } =
    useSendingIdentities();
  const [connectOpen, setConnectOpen] = useState(false);
  const [togglingPolicy, setTogglingPolicy] = useState(false);
  const [policyError, setPolicyError] = useState<string | null>(null);
  /**
   * THE DEFAULT LISTING IS OUTREACH MAILBOXES, and the rest is one click away
   * with its count named (the archived-items law's shape, applied to purpose).
   * The rows behind it are not hidden problems — they are audit records nobody
   * asked to manage.
   */
  const [showCorrespondence, setShowCorrespondence] = useState(false);
  /**
   * The audit rows come from a SECOND read, by name, only once asked for — the
   * list route filters by purpose and defaults to outreach (W1). Nothing is
   * hidden; it is one click, and a failed read says so instead of reading as
   * "there are none".
   */
  const correspondence = useCorrespondenceIdentities(showCorrespondence);

  async function togglePolicy(enabled: boolean) {
    setTogglingPolicy(true);
    setPolicyError(null);
    try {
      await setSendingPolicy(
        enabled,
        enabled ? undefined : "Switched off from the sending mailboxes screen.",
      );
      reload();
    } catch (err) {
      setPolicyError(err instanceof Error ? err.message : String(err));
    } finally {
      setTogglingPolicy(false);
    }
  }

  return (
    <div className="h-full overflow-y-auto">
      <div className="mx-auto max-w-4xl space-y-4 px-4 pb-16 pt-[calc(var(--shell-header-h)+1rem)]">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
          <p className="max-w-2xl text-sm text-muted-foreground">
            Outreach is sent from your own mailboxes, on your own domains — never
            from AI Matrx&apos;s servers or a shared address. That is what keeps
            one sender&apos;s mistakes from affecting anyone else&apos;s email.
          </p>
          <Button
            className="shrink-0"
            onClick={() => setConnectOpen(true)}
            disabled={policy ? !policy.outreach_enabled : false}
          >
            <MailPlus className="mr-1.5 h-4 w-4" />
            Connect a mailbox
          </Button>
        </div>

        {/*
          The plan gate, shown in the same order the server refuses in: the plan
          comes before the kill switch. Rendered as a NOTICE with no children —
          setting a mailbox up stays free on purpose, so this page never
          disappears behind a paywall. It tells the user, before they invest an
          afternoon in DNS records, that sending itself needs a plan, and hands
          them the one click that gets there.
        */}
        <CapabilityGate
          capability="outreach.send"
          organizationId={policy?.organization_id}
        >
          {null}
        </CapabilityGate>

        {policy && !policy.outreach_enabled ? (
          <Card className="border-destructive/40 bg-destructive/5">
            <CardContent className="flex flex-col gap-3 p-3 sm:flex-row sm:items-center sm:justify-between">
              <div className="flex items-start gap-2.5">
                <ShieldAlert className="mt-0.5 h-4 w-4 shrink-0 text-destructive" />
                <div className="min-w-0">
                  <p className="text-sm font-medium text-foreground">
                    Outreach sending is switched off for this organization
                  </p>
                  <p className="text-xs text-muted-foreground">
                    {policy.disabled_reason ??
                      "No message will leave any mailbox here until it is turned back on."}
                  </p>
                </div>
              </div>
              <Button
                size="sm"
                variant="outline"
                className="shrink-0"
                disabled={togglingPolicy}
                onClick={() => void togglePolicy(true)}
              >
                {togglingPolicy ? (
                  <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />
                ) : (
                  <Power className="mr-1.5 h-3.5 w-3.5" />
                )}
                Turn outreach back on
              </Button>
            </CardContent>
          </Card>
        ) : null}

        {policyError ? (
          <p className="text-sm text-destructive">{policyError}</p>
        ) : null}

        {/*
          The org-level bring-up checklist — everything between here and the
          first real outreach message, machine-checked where checkable. Mounted
          once the policy row has resolved the org (the checklist run persists
          per org, so it cannot mount against a guess).
        */}
        {policy ? (
          <OutreachBringUpSection
            organizationId={policy.organization_id}
            onIdentitiesChanged={reload}
          />
        ) : null}

        {loading ? (
          <div className="space-y-2">
            {Array.from({ length: 3 }).map((_, index) => (
              <Skeleton key={index} className="h-24 w-full rounded-lg" />
            ))}
          </div>
        ) : organizationRequired ? (
          <OrganizationRequiredNotice />
        ) : error ? (
          <Card className="border-destructive/40">
            <CardContent className="flex flex-col gap-3 p-4 sm:flex-row sm:items-center sm:justify-between">
              <p className="text-sm text-destructive">{error}</p>
              <Button size="sm" variant="outline" onClick={reload}>
                Try again
              </Button>
            </CardContent>
          </Card>
        ) : identities && identities.length > 0 ? (
          /*
            🚨 THIS LIST IS THE CAMPAIGN MAILBOXES, AND THAT IS THE SERVER'S
            FILTER. `listSendingIdentities` sends `purpose=outreach`, so a mailbox
            a reviewed 1:1 send recorded for audit is not here reading as an
            outreach mailbox stuck behind a DNS record nobody can publish
            (VERIFY-B1-B2-R5 W1). The audit rows are one click below, fetched by
            name. Complete in one answer, and not a PostgREST `.select()`, so there
            is no 1000-row cap for `readAllRows` to guard.
          */
          <div className="space-y-2">
            {identities.map((identity) => (
              <IdentityRow key={identity.id} identity={identity} />
            ))}
          </div>
        ) : (
          <Card>
            <CardContent className="space-y-3 p-6 text-center">
              <MailPlus className="mx-auto h-8 w-8 text-muted-foreground" />
              <div>
                <p className="text-sm font-medium text-foreground">
                  No sending mailbox yet
                </p>
                <p className="mx-auto mt-1 max-w-md text-xs text-muted-foreground">
                  Connect the mailbox you want your outreach to come from. You
                  will prove you own its domain, then it warms up for about four
                  weeks before campaigns can use it.
                </p>
              </div>
              <Button onClick={() => setConnectOpen(true)}>
                <MailPlus className="mr-1.5 h-4 w-4" />
                Connect a mailbox
              </Button>
            </CardContent>
          </Card>
        )}

        {/*
          🚨 THE MAILBOXES RECORDED FOR AUDIT — filtered out of the list above by
          the server, and ONE CLICK away here, never hidden (the archived-items
          law's shape applied to purpose). They are fetched only when asked for,
          because until a reviewed one-to-one send happens there are none, and a
          page that read them on every load would be asking for nothing.
        */}
        {loading || organizationRequired ? null : showCorrespondence ? (
          <div className="space-y-2">
            <div className="flex items-center justify-between gap-3 pt-1">
              <p className="text-xs font-medium text-muted-foreground">
                {CORRESPONDENCE_SECTION_TITLE}
              </p>
              <Button
                size="sm"
                variant="ghost"
                onClick={() => setShowCorrespondence(false)}
              >
                Hide
              </Button>
            </div>
            {correspondence.loading ? (
              <Skeleton className="h-16 w-full rounded-lg" />
            ) : correspondence.error ? (
              /* A read that failed says so — never an empty section reading as
                 "there are none". */
              <Card className="border-destructive/40">
                <CardContent className="flex flex-col gap-2 p-3 sm:flex-row sm:items-center sm:justify-between">
                  <p className="text-xs text-destructive">
                    {correspondence.error}
                  </p>
                  <Button size="sm" variant="outline" onClick={correspondence.reload}>
                    Try again
                  </Button>
                </CardContent>
              </Card>
            ) : correspondence.identities && correspondence.identities.length > 0 ? (
              correspondence.identities.map((identity) => (
                <CorrespondenceRow
                  key={identity.id}
                  identity={identity}
                  onPromoted={() => {
                    reload();
                    correspondence.reload();
                  }}
                />
              ))
            ) : (
              <p className="text-xs text-muted-foreground">
                {CORRESPONDENCE_SECTION_EMPTY}
              </p>
            )}
          </div>
        ) : (
          <Button
            size="sm"
            variant="ghost"
            className="self-start text-muted-foreground"
            onClick={() => setShowCorrespondence(true)}
          >
            <FileClock className="mr-1.5 h-3.5 w-3.5" />
            {correspondenceRevealLabel(
              correspondence.identities?.length ?? null,
            )}
          </Button>
        )}

        {policy?.outreach_enabled && identities && identities.length > 0 ? (
          <div className="flex items-center justify-between rounded-lg border border-border p-3">
            <div className="min-w-0">
              <p className="text-sm font-medium text-foreground">
                Emergency stop
              </p>
              <p className="text-xs text-muted-foreground">
                Immediately stops every mailbox in this organization from
                sending. Someone has to turn it back on by hand.
              </p>
            </div>
            <Button
              size="sm"
              variant="outline"
              className="shrink-0 border-destructive/40 text-destructive hover:bg-destructive/10"
              disabled={togglingPolicy}
              onClick={() => void togglePolicy(false)}
            >
              {togglingPolicy ? (
                <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />
              ) : (
                <Power className="mr-1.5 h-3.5 w-3.5" />
              )}
              Stop all sending
            </Button>
          </div>
        ) : null}
      </div>

      <ConnectMailboxDialog
        open={connectOpen}
        onOpenChange={setConnectOpen}
        onConnected={(identity) => {
          reload();
          // Success must be unmistakable: go straight to the new mailbox's
          // setup steps instead of leaving the user to spot it in the list.
          toast.success(`${identity.from_address} is connected — let's finish its setup.`);
          router.push(`/crm/sending-identities/${identity.id}`);
        }}
      />
    </div>
  );
}
