"use client";

import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { SubscriptionControls } from "@/features/pricing/components/SubscriptionControls";
import {
  billingStatusLabel,
  periodEndLabel,
  priceLabel,
  readBillingSummary,
  type BillingScope,
  type BillingSummaryRead,
} from "../billing-summary";
import { usePlanCatalog } from "../catalog/usePlanCatalog";
import { captureError } from "@/lib/diagnostics/errorCaptureStore";
import { ErrorNotice } from "@ai-matrx/design-system";
import { InfoHint } from "@/components/official/InfoHint";
import { ScheduledPlanChange } from "./ScheduledPlanChange";
import { useOpenFeedbackWindow } from "@/features/overlays/openers/feedbackDialog";
import { RegionSkeleton, Select } from "@ai-matrx/design-system/controls";

interface InvoiceRecovery {
  id: string | null;
  url: string | null;
  status: string | null;
  requiresAction: boolean;
}

function isInvoiceRecovery(value: unknown): value is InvoiceRecovery {
  if (!value || typeof value !== "object") return false;
  const nullableString = (item: unknown) => item === null || typeof item === "string";
  return "id" in value && nullableString(value.id) && "url" in value && nullableString(value.url)
    && "status" in value && nullableString(value.status) && "requiresAction" in value && typeof value.requiresAction === "boolean";
}

interface SupportInvoice { id: string; status: string | null; number: string | null; created: number }
function isSupportInvoice(value: unknown): value is SupportInvoice {
  if (!value || typeof value !== "object") return false;
  return "id" in value && typeof value.id === "string" && "created" in value && typeof value.created === "number"
    && "status" in value && (value.status === null || typeof value.status === "string")
    && "number" in value && (value.number === null || typeof value.number === "string");
}

function dateLabel(value: string | null): string | null {
  return value
    ? new Date(value).toLocaleDateString(undefined, {
        month: "short",
        day: "numeric",
        year: "numeric",
      })
    : null;
}

export function BillingSummary({ scope }: { scope: BillingScope }) {
  const openFeedback = useOpenFeedbackWindow();
  const [livemode, setLivemode] = useState<boolean | null>(null);
  const [modeError, setModeError] = useState<string | null>(null);
  const [read, setRead] = useState<BillingSummaryRead | null>(null);
  const [readScope, setReadScope] = useState<string | null>(null);
  const [invoice, setInvoice] = useState<InvoiceRecovery | null>(null);
  const [invoiceScope, setInvoiceScope] = useState<string | null>(null);
  const [supportInvoices, setSupportInvoices] = useState<SupportInvoice[]>([]);
  const [selectedInvoice, setSelectedInvoice] = useState<string>("");
  const [recoveryError, setRecoveryError] = useState<{
    scope: string;
    reason: string;
  } | null>(null);
  const [retryNonce, setRetryNonce] = useState(0);
  const catalog = usePlanCatalog();
  const organizationId =
    scope.kind === "organization" ? scope.organizationId : null;
  const scopeKey =
    scope.kind === "personal"
      ? `personal:${scope.userId}`
      : `organization:${scope.organizationId}`;

  useEffect(() => {
    let live = true;
    void fetch("/api/stripe/billing-summary")
      .then(async (response) => {
        const body: unknown = await response.json();
        if (
          !response.ok ||
          !body ||
          typeof body !== "object" ||
          !("livemode" in body) ||
          typeof body.livemode !== "boolean"
        )
          throw new Error("Billing is unavailable.");
        if (live) setLivemode(body.livemode);
      })
      .catch((error: unknown) => {
        if (!live) return;
        const reason =
          error instanceof Error ? error.message : "Billing is unavailable.";
        captureError({
          source: "app-api-http",
          operation: "select",
          relation: "stripe/billing-summary",
          code: "billing_mode_read_failed",
          message: reason,
          raw: error,
        });
        setModeError(reason);
      });
    return () => {
      live = false;
    };
  }, [retryNonce]);

  useEffect(() => {
    if (livemode === null) return;
    let live = true;
    void readBillingSummary(scope, livemode)
      .then((result) => {
        if (live) {
          setRead(result);
          setReadScope(scopeKey);
        }
      })
      .catch((error: unknown) => {
        if (!live) return;
        const reason =
          error instanceof Error ? error.message : "Billing could not be read.";
        captureError({
          source: "supabase-exception",
          operation: "select",
          schema: "billing",
          relation: "subscription",
          code: "billing_summary_read_failed",
          message: reason,
          raw: error,
        });
        setRead({ ok: false, reason });
        setReadScope(scopeKey);
      });
    return () => {
      live = false;
    };
  }, [scopeKey, livemode, retryNonce]);

  useEffect(() => {
    if (
      readScope !== scopeKey ||
      !read?.ok ||
      !read.subscription
    )
      return;
    let live = true;
    const headers = new Headers({ "Content-Type": "application/json" });
    if (organizationId) headers.set("X-Organization-Id", organizationId);
    void fetch("/api/stripe/billing-summary", {
      method: "POST",
      headers,
      body: JSON.stringify({ scope: scope.kind }),
    })
      .then(async (response) => {
        if (response.ok) return response.json();
        throw new Error("Billing recovery could not be loaded.");
      })
      .then((result: unknown) => {
        if (!live) return;
        if (
          !result ||
          typeof result !== "object" ||
          !("invoice" in result)
        )
          throw new Error("Billing invoice data could not be read. Refresh billing.");
        const candidate = result.invoice;
        if ("supportInvoices" in result) {
          if (!Array.isArray(result.supportInvoices)) throw new Error("Billing invoice data could not be read. Refresh billing.");
          if (!result.supportInvoices.every(isSupportInvoice)) throw new Error("Billing invoice data could not be read. Refresh billing.");
          setSupportInvoices(result.supportInvoices);
          setSelectedInvoice("");
        }
        if (isInvoiceRecovery(candidate)) {
          setInvoice(candidate);
          setInvoiceScope(scopeKey);
        } else if (candidate === null) {
          setInvoice(null);
          setInvoiceScope(scopeKey);
        } else {
          throw new Error("Billing invoice data could not be read. Refresh billing.");
        }
      })
      .catch((error: unknown) => {
        if (!live) return;
        const reason =
          error instanceof Error
            ? error.message
            : "Billing recovery could not be loaded.";
        captureError({
          source: "app-api-http",
          operation: "select",
          relation: "stripe/billing-summary",
          code: "billing_recovery_read_failed",
          message: reason,
          raw: error,
        });
        setRecoveryError({ scope: scopeKey, reason });
      });
    return () => {
      live = false;
    };
  }, [read, readScope, scopeKey, organizationId]);

  const title =
    scope.kind === "personal" ? "Personal billing" : "Organization billing";
  const activeRead = readScope === scopeKey ? read : null;
  const supportInvoice = invoiceScope === scopeKey ? supportInvoices.find(item => item.id === selectedInvoice) : null;
  const supportButton = (
    <Button variant="quiet" onClick={() => openFeedback({
      title: "Billing support",
      subject: {
        kind: "billing_subscription",
        billingScope: scope.kind,
        subscriptionId: activeRead?.ok ? activeRead.subscription?.id ?? null : null,
        planKey: activeRead?.ok ? activeRead.subscription?.plan_key ?? null : null,
        subscriptionStatus: activeRead?.ok ? activeRead.subscription?.status ?? null : null,
        invoiceId: supportInvoice?.id ?? (invoiceScope === scopeKey ? invoice?.id ?? null : null),
        invoiceStatus: supportInvoice?.status ?? (invoiceScope === scopeKey ? invoice?.status ?? null : null),
      },
    })}>Billing support</Button>
  );
  const retry = () => {
    setModeError(null);
    setRecoveryError(null);
    setReadScope(null);
    setInvoice(null);
    setInvoiceScope(null);
    setSupportInvoices([]);
    setSelectedInvoice("");
    setRetryNonce((value) => value + 1);
  };
  if (modeError)
    return (
      <ErrorNotice
        title="Billing is unavailable"
        message={modeError}
        actions={
          <div className="flex flex-wrap gap-2">
          <Button variant="outline" onClick={retry}>
            Retry
          </Button>
          {supportButton}
          </div>
        }
      />
    );
  if (!activeRead || livemode === null)
    return (
      <RegionSkeleton aria-label={`Loading ${title.toLowerCase()}`} />
    );
  if (!activeRead.ok)
    return (
      <ErrorNotice
        title="Billing could not be loaded"
        message={activeRead.reason}
        actions={
          <div className="flex flex-wrap gap-2">
          <Button variant="outline" onClick={retry}>
            Retry
          </Button>
          {supportButton}
          </div>
        }
      />
    );
  const subscription = activeRead.subscription;
  if (!subscription)
    return (
      <div className="rounded-md border border-border bg-card p-4 text-sm text-muted-foreground">
        No paid subscription for this account.
        {supportButton}
      </div>
    );

  const plan =
    catalog.status === "ready"
      ? catalog.plans.find((item) => item.planKey === subscription.plan_key)
      : null;
  const periodEnd = dateLabel(subscription.current_period_end);
  const recovering = ["past_due", "unpaid", "incomplete"].includes(
    subscription.status,
  );
  const invoiceUrl =
    recovering && invoiceScope === scopeKey ? (invoice?.url ?? null) : null;
  return (
    <section
      className="rounded-md border border-border bg-card p-4"
      aria-label={title}
    >
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="text-sm font-semibold text-foreground">
            Purchased plan
          </p>
          <p className="mt-1 text-sm text-muted-foreground">
            {plan?.name ?? subscription.plan_key}
            {priceLabel(activeRead.price)
              ? ` · ${priceLabel(activeRead.price)}`
              : ""}
          </p>
        </div>
        <span className="rounded bg-muted px-2 py-1 text-xs font-medium text-foreground">
          {billingStatusLabel(subscription.status)}
        </span>
      </div>
      {periodEnd ? (
        <p className="mt-3 text-sm text-muted-foreground">
          {periodEndLabel(
            subscription.status,
            subscription.cancel_at_period_end,
          )}{" "}
          {periodEnd}
        </p>
      ) : null}
      {recovering ? (
        <p className="mt-2 text-sm text-destructive">
          Payment needs attention.
        </p>
      ) : null}
      {recoveryError?.scope === scopeKey ? (
        <ErrorNotice
          size="inline"
          message={recoveryError.reason}
          actions={
            <Button variant="outline" onClick={retry}>
              Retry
            </Button>
          }
        />
      ) : null}
      {scope.kind === "personal" && catalog.status === "ready" ? (
        <ScheduledPlanChange
          currentPlanKey={subscription.plan_key}
          currentInterval={
            activeRead.price?.interval === "month" ||
            activeRead.price?.interval === "year"
              ? activeRead.price.interval
              : null
          }
          plans={catalog.plans}
        />
      ) : null}
      <div className="mt-4 flex flex-wrap gap-2">
        {invoiceScope === scopeKey && supportInvoices.length > 0 ? (
          <Select aria-label="Support invoice" value={selectedInvoice || "latest"} onValueChange={value => setSelectedInvoice(value === "latest" ? "" : value)} options={[
            { value: "latest", label: "Latest invoice" },
            ...supportInvoices.map(item => ({ value: item.id, label: `${item.number ?? new Date(item.created * 1000).toLocaleDateString()} · ${item.status ?? "Unknown"}` })),
          ]} />
        ) : null}
        {invoiceUrl ? (
          <Button
            variant="primary"
            onClick={() => window.location.assign(invoiceUrl)}
          >
            {invoice?.requiresAction ? "Complete payment" : "Pay invoice"}
          </Button>
        ) : null}
        <SubscriptionControls
          hasPurchasedSubscription
          livemode={livemode}
          scope={
            scope.kind === "personal"
              ? { kind: "personal" }
              : { kind: "organization", organizationId: scope.organizationId }
          }
          label="Manage billing"
        />
        {supportButton}
        <InfoHint label="About billing support" text="Request help or a refund review for the selected invoice. Completed billing periods are non-refundable except where law requires otherwise." />
        <Button variant="quiet" onClick={retry}>
          Refresh billing
        </Button>
      </div>
    </section>
  );
}
