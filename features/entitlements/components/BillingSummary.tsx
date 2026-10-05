"use client";

import { useEffect, useState } from "react";
import { Loader2 } from "lucide-react";
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
import { ErrorNotice } from "@/components/errors/ErrorNotice";

interface InvoiceRecovery {
  url: string | null;
  status: string | null;
  requiresAction: boolean;
}

function dateLabel(value: string | null): string | null {
  return value ? new Date(value).toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" }) : null;
}

export function BillingSummary({ scope }: { scope: BillingScope }) {
  const [livemode, setLivemode] = useState<boolean | null>(null);
  const [modeError, setModeError] = useState<string | null>(null);
  const [read, setRead] = useState<BillingSummaryRead | null>(null);
  const [readScope, setReadScope] = useState<string | null>(null);
  const [invoice, setInvoice] = useState<InvoiceRecovery | null>(null);
  const [invoiceScope, setInvoiceScope] = useState<string | null>(null);
  const [recoveryError, setRecoveryError] = useState<{ scope: string; reason: string } | null>(null);
  const [retryNonce, setRetryNonce] = useState(0);
  const catalog = usePlanCatalog();
  const organizationId = scope.kind === "organization" ? scope.organizationId : null;
  const scopeKey = scope.kind === "personal" ? `personal:${scope.userId}` : `organization:${scope.organizationId}`;

  useEffect(() => {
    let live = true;
    void fetch("/api/stripe/billing-summary")
      .then(async (response) => {
        const body: unknown = await response.json();
        if (!response.ok || !body || typeof body !== "object" || !("livemode" in body) || typeof body.livemode !== "boolean") throw new Error("Billing is unavailable.");
        if (live) setLivemode(body.livemode);
      })
      .catch((error: unknown) => {
        if (!live) return;
        const reason = error instanceof Error ? error.message : "Billing is unavailable.";
        captureError({ source: "app-api-http", operation: "select", relation: "stripe/billing-summary", code: "billing_mode_read_failed", message: reason, raw: error });
        setModeError(reason);
      });
    return () => { live = false; };
  }, [retryNonce]);

  useEffect(() => {
    if (livemode === null) return;
    let live = true;
    void readBillingSummary(scope, livemode)
      .then((result) => { if (live) { setRead(result); setReadScope(scopeKey); } })
      .catch((error: unknown) => {
        if (!live) return;
        const reason = error instanceof Error ? error.message : "Billing could not be read.";
        captureError({ source: "supabase-exception", operation: "select", schema: "billing", relation: "subscription", code: "billing_summary_read_failed", message: reason, raw: error });
        setRead({ ok: false, reason });
        setReadScope(scopeKey);
      });
    return () => { live = false; };
  }, [scopeKey, livemode, retryNonce]);

  useEffect(() => {
    if (readScope !== scopeKey || !read?.ok || !read.subscription || !["past_due", "unpaid", "incomplete"].includes(read.subscription.status)) return;
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
        if (!live || !result || typeof result !== "object" || !("invoice" in result)) return;
        const candidate = result.invoice;
        if (candidate && typeof candidate === "object" && "url" in candidate && "status" in candidate && "requiresAction" in candidate) { setInvoice(candidate as InvoiceRecovery); setInvoiceScope(scopeKey); }
      })
      .catch((error: unknown) => {
        if (!live) return;
        const reason = error instanceof Error ? error.message : "Billing recovery could not be loaded.";
        captureError({ source: "app-api-http", operation: "select", relation: "stripe/billing-summary", code: "billing_recovery_read_failed", message: reason, raw: error });
        setRecoveryError({ scope: scopeKey, reason });
      });
    return () => { live = false; };
  }, [read, readScope, scopeKey, organizationId]);

  const title = scope.kind === "personal" ? "Personal billing" : "Organization billing";
  const activeRead = readScope === scopeKey ? read : null;
  const retry = () => { setModeError(null); setRecoveryError(null); setRetryNonce((value) => value + 1); };
  if (modeError) return <ErrorNotice title="Billing is unavailable" message={modeError} actions={<Button size="sm" variant="outline" onClick={retry}>Retry</Button>} />;
  if (!activeRead || livemode === null) return <div className="flex items-center gap-2 rounded-md border border-border bg-card p-4 text-sm text-muted-foreground"><Loader2 className="h-4 w-4 animate-spin" aria-hidden />Loading {title.toLowerCase()}…</div>;
  if (!activeRead.ok) return <ErrorNotice title="Billing could not be loaded" message={activeRead.reason} actions={<Button size="sm" variant="outline" onClick={retry}>Retry</Button>} />;
  if (!activeRead.subscription) return <div className="rounded-md border border-border bg-card p-4 text-sm text-muted-foreground">No paid subscription for this account.</div>;

  const plan = catalog.status === "ready" ? catalog.plans.find((item) => item.planKey === activeRead.subscription?.plan_key) : null;
  const periodEnd = dateLabel(activeRead.subscription.current_period_end);
  const recovering = ["past_due", "unpaid", "incomplete"].includes(activeRead.subscription.status);
  return (
    <section className="rounded-md border border-border bg-card p-4" aria-label={title}>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="text-sm font-semibold text-foreground">Purchased plan</p>
          <p className="mt-1 text-sm text-muted-foreground">{plan?.name ?? activeRead.subscription.plan_key}{priceLabel(activeRead.price) ? ` · ${priceLabel(activeRead.price)}` : ""}</p>
        </div>
        <span className="rounded bg-muted px-2 py-1 text-xs font-medium text-foreground">{billingStatusLabel(activeRead.subscription.status)}</span>
      </div>
      {periodEnd ? <p className="mt-3 text-sm text-muted-foreground">{periodEndLabel(activeRead.subscription.status, activeRead.subscription.cancel_at_period_end)} {periodEnd}</p> : null}
      {recovering ? <p className="mt-2 text-sm text-destructive">Payment needs attention.</p> : null}
      {recoveryError?.scope === scopeKey ? <ErrorNotice size="inline" message={recoveryError.reason} actions={<Button size="sm" variant="outline" onClick={retry}>Retry</Button>} /> : null}
      <div className="mt-4 flex flex-wrap gap-2">
        {recovering && invoiceScope === scopeKey && invoice?.url ? <Button size="sm" onClick={() => window.location.assign(invoice.url)}>{invoice.requiresAction ? "Complete payment" : "Pay invoice"}</Button> : null}
        <SubscriptionControls livemode={livemode} scope={scope.kind === "personal" ? { kind: "personal" } : { kind: "organization", organizationId: scope.organizationId }} label="Manage billing" />
      </div>
    </section>
  );
}
