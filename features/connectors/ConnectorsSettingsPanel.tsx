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

import { useState } from "react";
import { Loader2, Plug } from "lucide-react";
import { toast } from "@/lib/toast";
import { confirm } from "@/components/dialogs/confirm/ConfirmDialogHost";
import { useAppSelector } from "@/lib/redux/hooks";
import { useSurfaceScopeContribution } from "@/features/surfaces/runtime/SurfaceRuntimeContext";
import { selectOrganizationsList } from "@/features/scopes/redux/selectors/tree";
import { LazyGoogleAPIProvider } from "@/providers/google-provider/LazyGoogleAPIProvider";
import { isGoogleAuthorizationCancelled } from "@/providers/google-provider/GoogleApiProvider";
import { useDisconnectGoogle } from "@/features/marketing/google/hooks";
import { extractErrorMessage } from "@/utils/errors";
import { cn } from "@/lib/utils";
import { ConnectedAccountHealth } from "./ConnectedAccountHealth";
import { ConnectorConsentBody } from "./ConnectorConsentDialog";
import { ConnectorPromptCard } from "./ConnectorPromptCard";
import { accountHealth, anyProductConnected, revokeConsequence } from "./health";
import { buildConsentPlan } from "./consent-plan";
import {
  MULTI_PRODUCT_CONSENT_UNSUPPORTED_MESSAGE,
  multiProductConsentUnsupported,
  useGoogleConnectorState,
  useGoogleConsentRunner,
} from "./google-adapter";
import {
  GOOGLE_CONNECTOR_PROVIDER,
  type ConnectorProviderConfig,
} from "./provider-config";

export function ConnectorsSettingsPanel({
  className,
}: {
  className?: string;
}) {
  return (
    <LazyGoogleAPIProvider>
      <ProviderConnectorsPanel
        provider={GOOGLE_CONNECTOR_PROVIDER}
        className={className}
      />
    </LazyGoogleAPIProvider>
  );
}

function ProviderConnectorsPanel({
  provider,
  className,
}: {
  provider: ConnectorProviderConfig;
  className?: string;
}) {
  const state = useGoogleConnectorState();
  const runner = useGoogleConsentRunner();
  const disconnect = useDisconnectGoogle();
  const organizations = useAppSelector(selectOrganizationsList);
  const [busyProduct, setBusyProduct] = useState<string | null>(null);
  const [revokingId, setRevokingId] = useState<string | null>(null);
  const [failure, setFailure] = useState<string | null>(null);

  const reconnect = async (accountId: string, productKey: string) => {
    const account = state.accounts.find((row) => row.id === accountId);
    if (!account) return;
    // The row's own verb, so the confirmation matches the button that was
    // pressed: a product this account never granted says Connect, not
    // Reconnect (VERIFY-U-P2 D3).
    const pressed = accountHealth({
      provider,
      account,
      rollout: state.rollout,
    }).find((row) => row.product.key === productKey);
    const verb = pressed?.actionLabel ?? "Connect";
    // A row offering Reconnect with nothing missing is a row the provider
    // refused on a grant it will not honour any more; the plan reads that off
    // the account itself and renews the grant instead of asking for a scope, on
    // this surface and in the dialog alike (see `consent-plan.ts`).
    const plan = buildConsentPlan({
      provider,
      selectedProductKeys: [productKey],
      account,
      rollout: state.rollout,
    });
    if (!plan.request) {
      // Never a silent no-op: say why the click did nothing.
      setFailure(
        plan.blocked[0]?.reason ??
          "There is nothing left to approve for this one.",
      );
      return;
    }
    setBusyProduct(productKey);
    setFailure(null);
    try {
      await runner.run(plan.request, {
        owner:
          account.ownerKind === "organization" && account.organizationId
            ? { type: "organization", organizationId: account.organizationId }
            : { type: "user" },
        loginHint: account.label,
      });
      await state.refetch();
      toast.success(verb === "Connect" ? "Connected." : "Reconnected.");
    } catch (cause) {
      if (isGoogleAuthorizationCancelled(cause)) {
        toast.info("Authorization cancelled — nothing changed.");
        return;
      }
      setFailure(
        multiProductConsentUnsupported(cause)
          ? MULTI_PRODUCT_CONSENT_UNSUPPORTED_MESSAGE
          : extractErrorMessage(cause),
      );
      await state.refetch();
    } finally {
      setBusyProduct(null);
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
    // "Are you sure?" (common-docs/policies/destructive-and-expensive-actions.md).
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
      setFailure(extractErrorMessage(cause));
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

  if (state.isLoading) {
    return (
      <div
        className={cn(
          "flex items-center gap-2 rounded-xl border border-border p-4 text-sm text-muted-foreground",
          className,
        )}
      >
        <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
        Loading your {provider.name} connections…
      </div>
    );
  }

  return (
    <div className={cn("flex flex-col gap-4", className)}>
      {failure ? (
        <div
          role="alert"
          className="rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive"
        >
          {failure}
        </div>
      ) : null}

      {state.accounts.length === 0 ? (
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
        state.accounts.map((account) => (
          <ConnectedAccountHealth
            key={account.id}
            provider={provider}
            account={account}
            health={accountHealth({
              provider,
              account,
              rollout: state.rollout,
            })}
            organizationName={
              organizations.find((org) => org.id === account.organizationId)
                ?.name ?? null
            }
            onReconnect={(productKey) => void reconnect(account.id, productKey)}
            onRevoke={() => void revoke(account.id)}
            busyProductKey={busyProduct}
            revoking={revokingId === account.id}
          />
        ))
      )}

      <section
        id="connector-consent-body"
        className="rounded-xl border border-border bg-textured p-3"
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
          provider={provider}
          accounts={state.accounts}
          rollout={state.rollout}
          isLoading={false}
          rolloutUnavailable={state.rolloutUnavailable}
          errorMessage={state.errorMessage}
          refetch={state.refetch}
        />
      </section>
    </div>
  );
}
