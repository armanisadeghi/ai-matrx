"use client";

// features/connectors/ConnectorsSettingsPanel.tsx
//
// SETTINGS → CONNECTORS, for one provider: every connected account with its
// per-capability health rows, and the same consent body the dialog uses for
// adding or changing what the provider may do. One component, two mounts
// (PLAN §2) — the page cannot drift from the dialog because it IS the dialog's
// body.
//
// This is also the only file in the panel path that names Google: it wires the
// Google adapter into the generic components. The second provider adds a
// sibling host, or a provider id prop, and nothing else changes.
//
// 🚨 WHICH ORGANIZATIONS AN ACCOUNT SERVES IS NOT AN EDITOR HERE, on purpose
// (chair ruling 2026-09-17). A personal connection has `organization_id` NULL
// and is already reachable by its owner in every organization they belong to; an
// organization-owned one is reachable by that organization's members. A personal
// and an organization connection to the same provider login already resolve
// identically (`dedupeGoogleConnectionsForPicker`). So the whole mechanism is
// the dialog's "Connect for <org>" switch, and this panel states which of the
// two each account is. A list of served organizations would be a second, weaker
// copy of the access rule.

import { useState, type ReactNode } from "react";
import { Building2, ChevronDown, Loader2, Plug } from "lucide-react";
import { toast } from "@/lib/toast";
import { confirm } from "@/components/dialogs/confirm/ConfirmDialogHost";
import { useAppSelector } from "@/lib/redux/hooks";
import { useSurfaceScopeContribution } from "@ai-matrx/chat/surfaces/runtime/SurfaceRuntimeContext";
import { selectOrganizationsList } from "@/features/scopes/redux/selectors/tree";
import { selectUserId } from "@/lib/redux/selectors/userSelectors";
import { useEffectiveKnob } from "@/lib/scoped-config/effectiveKnobs.client";
import type { OrgRole } from "@/features/scopes/types";
import { LazyGoogleAPIProvider } from "@/providers/google-provider/LazyGoogleAPIProvider";
import { isGoogleAuthorizationCancelled } from "@/providers/google-provider/GoogleApiProvider";
import { useDisconnectGoogle } from "@/features/marketing/google/hooks";
import { cn } from "@/lib/utils";
import {
  ConnectedAccountHealth,
  busyActionKey,
  type ConnectorBusyAction,
} from "./ConnectedAccountHealth";
import {
  MANAGEMENT_ALLOWED,
  SHARED_CONNECTOR_MEMBER_LEVEL_KNOB,
  resolveSharedConnectorManagement,
} from "./shared-account-level";
import { useOrganizationRequired } from "@/features/organizations/useOrganizationRequired";
import { OrganizationContextNotice } from "@/features/organizations/components/OrganizationRequiredNotice";
import { ConsentFailureNotice } from "./ConsentFailureNotice";
import { ConnectorConsentBody } from "./ConnectorConsentDialog";
import { ConnectorPromptCard } from "./ConnectorPromptCard";
import {
  accountHealth,
  accountRenewalProductKeys,
  anyProductConnected,
  revokeConsequence,
  type ConnectorAccount,
  type ConnectorCapabilityRollout,
  type ConnectorProductHealth,
} from "./health";
import {
  buildConsentPlan,
  buildPermissionsReviewPlan,
  consentOutcomes,
  emptyPlanAnswer,
} from "./consent-plan";
import {
  consentRunOwnerForAccount,
  consentFailureAnswer,
  useGoogleConnectorState,
  useGoogleConsentRunner,
  type ConsentFailureAnswer,
} from "./google-adapter";
import {
  GOOGLE_CONNECTOR_PROVIDER,
  userOwnedGoogleProductNames,
  type ConnectorProviderConfig,
} from "./provider-config";
import { confirmGmailChangesDisclosure, confirmGmailReadDisclosure } from "./gmail-read-disclosure";
import { splitConnectionsByOwnership } from "./connection-ownership";
import { useConnectionViewer } from "./useConnectionViewer";
import { ConnectorTile } from "./ConnectorMark";
import { getConnector } from "./registry";

export function ConnectorsSettingsPanel({
  className,
  searchFocus,
}: {
  className?: string;
  searchFocus?: { productKey: string; request: number } | null;
}) {
  return (
    <LazyGoogleAPIProvider>
      <ProviderConnectorsPanel
        provider={GOOGLE_CONNECTOR_PROVIDER}
        className={className}
        searchFocus={searchFocus}
      />
    </LazyGoogleAPIProvider>
  );
}

function ProviderConnectorsPanel({
  provider,
  className,
  searchFocus,
}: {
  provider: ConnectorProviderConfig;
  className?: string;
  searchFocus?: { productKey: string; request: number } | null;
}) {
  const state = useGoogleConnectorState();
  const runner = useGoogleConsentRunner();
  const disconnect = useDisconnectGoogle();
  const organizations = useAppSelector(selectOrganizationsList);
  /**
   * 🚨 YOURS AND SHARED ARE TWO LISTS (Arman, 2026-10-05). The inventory holds
   * the person's own Google accounts AND every account an organization they
   * belong to connected. Rendered as one list, AI Matrx's shared Google — the
   * one Search Console runs on — read as Arman's personal account, hid the
   * offer to connect his own, and invited a Disconnect that would have cut the
   * whole organization off. Your accounts lead; an organization's sit below,
   * named by whose they are, and managing one is a deliberate step.
   */
  const viewer = useConnectionViewer();
  const { mine: myAccounts, shared: sharedAccounts } = splitConnectionsByOwnership(
    state.accounts,
    viewer,
  );
  /**
   * 🚨 THE FOURTH STATE IS SAID OUT LOUD HERE (V-24 NEW-3, 2026-09-18). With
   * every Supabase read aborted, this page said NOTHING about the organization
   * at any second — no sentence, no notice, no retry — while the row controls
   * below quietly lost the organization they need and the consent body's
   * "Connect for <org>" switch silently could not appear. A screen is absent or
   * honest, never dead (law 4). Only the FAILED read gets a notice: `resolving`
   * is a beat the rest of this page already spends loading, and `required` is
   * not a problem here at all — a personal connection needs no organization.
   */
  const organizationGate = useOrganizationRequired();
  /**
   * WHICH PRESSES ARE RUNNING, AND ON WHICH ACCOUNTS. A SET, and each entry
   * names its account — two defects, two lessons. One bare product key was
   * handed to every account card, so a press on one account spun the same
   * product's control on all the others (VERIFY-U-P2-R2, N6). Then one slot held
   * one press: with account one's provider window open, account two's press
   * moved the marker, the runner refused it immediately, and that refusal's
   * `finally` cleared busy entirely — account one's Reconnect stopped spinning
   * and invited a press that could only be refused (VERIFY-U-P2-R3, N17). A
   * press now removes only its own entry.
   */
  const [busy, setBusy] = useState<readonly ConnectorBusyAction[]>([]);
  // Keep the consent panel's visible account aligned with a card action.
  // Without this, its independent default can name another connected mailbox
  // while the card sends a correctly targeted provider request.
  const [cardConsent, setCardConsent] = useState<{
    accountId: string;
    productKeys: string[];
    press: number;
  } | null>(null);
  const [revokingId, setRevokingId] = useState<string | null>(null);
  const [failure, setFailure] = useState<ConsentFailureAnswer | null>(null);

  /**
   * ONE consent run for both presses a card can raise: a product's own
   * Connect/Reconnect, and the account-level Reconnect a dead credential needs
   * (`productKey: null`), which renews every product the account holds in one
   * window. Both go through `buildConsentPlan`, so neither surface derives a
   * renewal itself.
   */
  const runConsent = async (
    accountId: string,
    productKeys: string[],
    pressed: ConnectorBusyAction,
  ) => {
    const account = state.accounts.find((row) => row.id === accountId);
    if (!account) return;
    if (
      account.ownerKind === "organization" &&
      userOwnedGoogleProductNames(productKeys).length > 0
    ) {
      setFailure({
        sentence: "This selection can connect only to a user-owned Google account. Choose your own account in the consent panel below.",
        details: null,
      });
      return;
    }
    const rows = accountHealth({ provider, account, rollout: state.rollout });
    // The row's own verb, so the toast matches the button that was pressed: a
    // product this account never granted says Connect, not Reconnect (D3).
    const verb =
      productKeys.length === 1
        ? (rows.find((row) => row.product.key === productKeys[0])?.actionLabel ??
          "Connect")
        : "Reconnect";
    const plan = buildConsentPlan({
      provider,
      selectedProductKeys: productKeys,
      account,
      rollout: state.rollout,
    });
    if (!plan.request) {
      // Never a silent no-op, and never "already connected" over a row that says
      // otherwise: the ONE answer function names every blocked row (N1).
      setFailure({
        sentence: emptyPlanAnswer(plan, productKeys.length),
        details: null,
      });
      return;
    }
    setCardConsent((previous) => ({
      accountId,
      productKeys,
      press: (previous?.press ?? 0) + 1,
    }));
    setBusy((running) =>
      running.some((entry) => busyActionKey(entry) === busyActionKey(pressed))
        ? running
        : [...running, pressed],
    );
    setFailure(null);
    try {
      const disclosed = await confirmGmailReadDisclosure(plan.request);
      if (!disclosed) {
        setCardConsent(null);
        return;
      }
      const changesDisclosed = await confirmGmailChangesDisclosure(plan.request);
      if (!changesDisclosed) {
        setCardConsent(null);
        return;
      }
      const result = await runner.run(plan.request, {
        owner:
          account.ownerKind === "organization" && account.organizationId
            ? { type: "organization", organizationId: account.organizationId }
            : { type: "user" },
        loginHint: account.label,
      });
      const freshAccounts = await state.refetch();
      const freshAccount = freshAccounts?.find((row) => row.id === result.connectionId);
      if (!freshAccount) {
        setFailure({
          sentence: `${provider.name} approval finished, but we could not confirm this account in your connections. Refresh Settings → Connectors before trying again.`,
          details: null,
        });
        return;
      }
      const refused = consentOutcomes({
        provider,
        plan,
        account: freshAccount,
        rollout: state.rollout,
        exchange: { completed: true },
      }).filter((outcome) => outcome.state === "refused");
      if (refused.length > 0) {
        setFailure({
          sentence: refused.map((outcome) => `${outcome.product.name}: ${outcome.message}`).join(" "),
          details: null,
        });
        return;
      }
      toast.success(verb === "Connect" ? "Connected." : "Reconnected.");
    } catch (cause) {
      if (isGoogleAuthorizationCancelled(cause)) {
        // A cancelled press leaves no card focus behind: the body goes back
        // to defaulting to the viewer's own account.
        setCardConsent(null);
        toast.info("Authorization cancelled — nothing changed.");
        return;
      }
      setFailure(consentFailureAnswer(cause));
      await state.refetch();
    } finally {
      // Only this press. Clearing the whole set is what un-spun another
      // account's open window (N17).
      setBusy((running) =>
        running.filter((entry) => busyActionKey(entry) !== busyActionKey(pressed)),
      );
    }
  };

  const reconnect = (accountId: string, productKey: string) =>
    runConsent(accountId, [productKey], { accountId, productKey });

  /**
   * The account's own repair: every product whose action is scoped to the
   * account (a dead credential), renewed in one approval. The keys come from
   * the one derivation, so this press and the dialog's default press make the
   * same request (N2).
   */
  const reconnectAccount = (accountId: string) => {
    const account = state.accounts.find((row) => row.id === accountId);
    if (!account) return;
    void runConsent(
      accountId,
      accountRenewalProductKeys({
        provider,
        account,
        rollout: state.rollout,
      }),
      { accountId, productKey: null },
    );
  };

  const reviewPermissions = async (accountId: string, inThisTab = false) => {
    const account = state.accounts.find((row) => row.id === accountId);
    if (!account) return;
    const review = buildPermissionsReviewPlan({
      provider,
      account,
      rollout: state.rollout,
    });
    if (!review.request) {
      setFailure({ sentence: review.refusal, details: null });
      return;
    }
    const request = review.request;
    const owner = consentRunOwnerForAccount(account);
    if (!owner) {
      setFailure({
        sentence: "This shared connection has no organization owner to approve changes.",
        details: null,
      });
      return;
    }
    const pressed = { accountId, productKey: null } satisfies ConnectorBusyAction;
    setBusy((running) =>
      running.some((entry) => busyActionKey(entry) === busyActionKey(pressed))
        ? running
        : [...running, pressed],
    );
    setFailure(null);
    try {
      if (!(await confirmGmailReadDisclosure(request))) return;
      if (!(await confirmGmailChangesDisclosure(request))) return;
      if (inThisTab) {
        await runner.runInThisTab(request, { owner, loginHint: account.label });
        return;
      }
      await runner.run(request, { owner, loginHint: account.label });
      await state.refetch();
      toast.success("Permissions reviewed.");
    } catch (cause) {
      if (isGoogleAuthorizationCancelled(cause)) {
        toast.info("Authorization cancelled — nothing changed.");
        return;
      }
      setFailure(consentFailureAnswer(cause));
      await state.refetch();
    } finally {
      setBusy((running) =>
        running.filter(
          (entry) => busyActionKey(entry) !== busyActionKey(pressed),
        ),
      );
    }
  };

  const revoke = async (accountId: string) => {
    const account = state.accounts.find((row) => row.id === accountId);
    if (!account) return;
    const health = accountHealth({
      provider,
      account,
      rollout: state.rollout,
    });
    // A destructive click STATES ITS CONSEQUENCE, by name — never a generic
    // "Are you sure?" (common-docs/policies/no-dead-ends.md).
    const ok = await confirm({
      title: `Disconnect ${account.label}?`,
      description: revokeConsequence(
        provider,
        account,
        health,
        state.resourceCountByAccount[account.id] ?? 0,
      ),
      confirmLabel: "Disconnect",
    });
    if (!ok) return;
    setRevokingId(accountId);
    setFailure(null);
    try {
      await disconnect.mutateAsync(accountId);
      await state.refetch();
      toast.success(`${account.label} disconnected.`);
    } catch (cause) {
      setFailure(consentFailureAnswer(cause));
    } finally {
      setRevokingId(null);
    }
  };

  // Carried over from the retired `DirectoryConnectorCards`, key unchanged so
  // anything reading this contribution keeps finding it — now per PRODUCT
  // rather than per connector id, which is what the health rows show.
  useSurfaceScopeContribution(
    "matrx-user/settings",
    "google-directory-cards",
    () =>
      state.isLoading || state.isError
        ? {}
        : {
            google_connections: state.accounts.flatMap((account) =>
              accountHealth({ provider, account, rollout: state.rollout }).map(
                (row) => ({
                  id: `${account.id}:${row.product.key}`,
                  name: row.product.name,
                  description: row.product.promise,
                  status: row.state,
                  account_email: account.label,
                }),
              ),
            ),
          },
  );

  const connectedAnywhere = state.accounts.some((account) =>
    anyProductConnected(
      accountHealth({ provider, account, rollout: state.rollout }),
    ),
  );

  // Rendered in BOTH branches below: the read that failed is just as true while
  // this page is still loading its connections, and a page that waits for one
  // read to finish before admitting another one failed is the silence V-24 saw.
  const organizationNotice =
    organizationGate.organizationState === "unavailable" ? (
      <OrganizationContextNotice
        state="unavailable"
        compact
        className="rounded-xl border border-border bg-textured"
      />
    ) : null;

  if (state.isLoading) {
    return (
      <div className={cn("flex flex-col gap-4", className)}>
        {organizationNotice}
        <div className="flex items-center gap-2 rounded-xl border border-border p-4 text-sm text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
          Loading your {provider.name} connections…
        </div>
      </div>
    );
  }

  return (
    <div className={cn("flex flex-col gap-4", className)}>
      {organizationNotice}
      {failure ? <ConsentFailureNotice failure={failure} /> : null}

      {myAccounts.length === 0 ? (
        <ConnectorPromptCard
          provider={provider}
          connected={false}
          onConnect={() => {
            document
              .getElementById("connector-consent-body")
              ?.scrollIntoView({ behavior: "smooth", block: "start" });
          }}
        />
      ) : (
        myAccounts.map((account) => {
          const org = organizations.find(
            (candidate) => candidate.id === account.organizationId,
          );
          return (
            <AccountCard
              key={account.id}
              provider={provider}
              account={account}
              health={accountHealth({
                provider,
                account,
                rollout: state.rollout,
              })}
              rollout={state.rollout}
              organizationName={org?.name ?? null}
              orgRole={org?.role ?? null}
              onReconnect={(productKey) =>
                void reconnect(account.id, productKey)
              }
              onReconnectAccount={() => reconnectAccount(account.id)}
              onReviewPermissions={() => void reviewPermissions(account.id)}
              onReviewPermissionsInThisTab={() => void reviewPermissions(account.id, true)}
              onRevoke={() => void revoke(account.id)}
              busy={busy}
              revoking={revokingId === account.id}
            />
          );
        })
      )}

      {sharedAccounts.length > 0 ? (
        <section aria-label="Shared with you" className="flex flex-col gap-2">
          <h3 className="px-1 text-xs font-medium uppercase tracking-wide text-muted-foreground">
            Shared with you
          </h3>
          {sharedAccounts.map((account) => {
            const org = organizations.find(
              (candidate) => candidate.id === account.organizationId,
            );
            return (
              <SharedAccountRow
                key={account.id}
                provider={provider}
                account={account}
                organizationName={org?.name ?? null}
                canManage={org?.role === "owner" || org?.role === "admin"}
              >
                <AccountCard
                  provider={provider}
                  account={account}
                  health={accountHealth({
                    provider,
                    account,
                    rollout: state.rollout,
                  })}
                  rollout={state.rollout}
                  organizationName={org?.name ?? null}
                  orgRole={org?.role ?? null}
                  onReconnect={(productKey) =>
                    void reconnect(account.id, productKey)
                  }
                  onReconnectAccount={() => reconnectAccount(account.id)}
                  onReviewPermissions={() => void reviewPermissions(account.id)}
                  onReviewPermissionsInThisTab={() => void reviewPermissions(account.id, true)}
                  onRevoke={() => void revoke(account.id)}
                  busy={busy}
                  revoking={revokingId === account.id}
                />
              </SharedAccountRow>
            );
          })}
        </section>
      ) : null}

      <section
        id="connector-consent-body"
        className="flex flex-col border-t border-border bg-textured px-1 py-3 sm:rounded-xl sm:border sm:p-3"
      >
        <header className="mb-2.5 flex items-start gap-2">
          <Plug className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" aria-hidden />
          <div>
            <h3 className="text-sm font-semibold text-foreground">
              {connectedAnywhere
                ? `Change what ${provider.name} can do`
                : provider.dialog.title}
            </h3>
            <p className="text-xs text-muted-foreground">
              {provider.dialog.subtitle}
            </p>
          </div>
        </header>
        <ConnectorConsentBody
          key={cardConsent
            ? `card-press-${cardConsent.press}`
            : "default"}
          provider={provider}
          rowAnchorPrefix="integration-google-product-"
          searchFocus={searchFocus}
          accounts={state.accounts}
          // Only your own accounts are ever the silent default, so "Connect"
          // never lands on an organization's credential.
          defaultAccountIds={myAccounts.map((account) => account.id)}
          rollout={state.rollout}
          isLoading={false}
          rolloutUnavailable={state.rolloutUnavailable}
          errorMessage={state.errorMessage}
          refetch={state.refetch}
          initialAccountId={cardConsent?.accountId ?? null}
          initialProductKeys={cardConsent?.productKeys}
        />
      </section>
    </div>
  );
}

/**
 * ONE ACCOUNT, WITH ITS ORGANIZATION'S ANSWER ABOUT IT.
 *
 * 🚨 The knob is read HERE, per card, for the account's OWN organization —
 * never once for the active organization and reused. A person can hold a
 * personal Google account and their employer's shared one on the same screen,
 * and `connectors / shared_account.member_default_level` is organization-rung:
 * resolving it against the wrong organization would be one organization's
 * policy applied to another's credential. `useEffectiveKnob` de-duplicates the
 * snapshot per organization, so N cards on one organization cost ONE fetch.
 *
 * A personal account passes `organizationId = null`, the hook answers
 * `undefined` for it, and `resolveSharedConnectorManagement` never consults the
 * value — a personal credential is the person's own.
 */
function AccountCard({
  provider,
  account,
  health,
  rollout,
  organizationName,
  orgRole,
  onReconnect,
  onReconnectAccount,
  onReviewPermissions,
  onReviewPermissionsInThisTab,
  onRevoke,
  busy,
  revoking,
}: {
  provider: ConnectorProviderConfig;
  account: ConnectorAccount;
  health: readonly ConnectorProductHealth[];
  rollout: readonly ConnectorCapabilityRollout[];
  organizationName: string | null;
  orgRole: OrgRole | null;
  onReconnect: (productKey: string) => void;
  onReconnectAccount: () => void;
  onReviewPermissions: () => void;
  onReviewPermissionsInThisTab: () => void;
  onRevoke: () => void;
  busy: readonly ConnectorBusyAction[];
  revoking: boolean;
}) {
  const userId = useAppSelector(selectUserId);
  const memberLevel = useEffectiveKnob(
    account.organizationId,
    userId,
    SHARED_CONNECTOR_MEMBER_LEVEL_KNOB,
  );
  const management =
    account.ownerKind === "organization"
      ? resolveSharedConnectorManagement({
          ownerKind: account.ownerKind,
          organizationName,
          orgRole,
          knobValue: memberLevel,
        })
      : MANAGEMENT_ALLOWED;
  const permissionsReview = buildPermissionsReviewPlan({
    provider,
    account,
    rollout,
  });

  return (
    <>
    <ConnectedAccountHealth
      provider={provider}
      account={account}
      anchorId={`integration-google-account-${account.id}`}
      health={account.ownerKind === "organization"
        ? health.filter((row) => row.product.key !== "gmail_modify")
        : health}
      organizationName={organizationName}
      onReconnect={onReconnect}
      onReconnectAccount={onReconnectAccount}
      onReviewPermissions={
        permissionsReview.request
          ? onReviewPermissions
          : undefined
      }
      onReviewPermissionsInThisTab={
        permissionsReview.request
          ? onReviewPermissionsInThisTab
          : undefined
      }
      permissionsReviewUnavailableReason={
        account.usable ? permissionsReview.refusal : null
      }
      onRevoke={onRevoke}
      busy={busy}
      revoking={revoking}
      management={management}
    />
    {account.ownerKind === "organization" ? (
      <p className="-mt-2 px-3 text-xs text-muted-foreground">
        Gmail changes are available only on personal Google connections. Use the consent panel below with your own account.
      </p>
    ) : null}
    </>
  );
}

/**
 * AN ORGANIZATION'S ACCOUNT, AS ONE QUIET ROW. Whose it is leads; the full
 * health card — and, for that organization's owners and admins, Reconnect and
 * Disconnect — opens only on a deliberate press, because acting on it acts for
 * everyone in the organization.
 */
function SharedAccountRow({
  provider,
  account,
  organizationName,
  canManage,
  children,
}: {
  provider: ConnectorProviderConfig;
  account: ConnectorAccount;
  organizationName: string | null;
  canManage: boolean;
  children: ReactNode;
}) {
  const [open, setOpen] = useState(false);
  const connector = getConnector(provider.markConnectorId);
  const org = organizationName ?? "your organization";
  return (
    <div className="overflow-hidden rounded-xl border border-border bg-card">
      <button
        type="button"
        aria-expanded={open}
        onClick={() => setOpen((value) => !value)}
        className="flex w-full items-center gap-3 px-3 py-2.5 text-left hover:bg-muted/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring"
      >
        {connector ? <ConnectorTile connector={connector} size="sm" /> : null}
        <span className="min-w-0 flex-1">
          <span className="block truncate text-sm font-medium text-foreground">
            {account.label}
          </span>
          <span className="flex items-center gap-1 truncate text-xs text-muted-foreground">
            <Building2 className="h-3 w-3 shrink-0" aria-hidden />
            Connected by {org} · {account.statusLabel}
          </span>
        </span>
        <span className="shrink-0 text-xs text-muted-foreground">
          {canManage ? `Manage for ${org}` : "Details"}
        </span>
        <ChevronDown
          className={cn(
            "h-4 w-4 shrink-0 text-muted-foreground transition-transform",
            open && "rotate-180",
          )}
          aria-hidden
        />
      </button>
      {open ? <div className="border-t border-border p-2">{children}</div> : null}
    </div>
  );
}
