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
  const [read, setRead] = useState<BillingSummaryRead | null>(null);
  const [invoice, setInvoice] = useState<InvoiceRecovery | null>(null);
  const catalog = usePlanCatalog();
  const organizationId = scope.kind === "organization" ? scope.organizationId : null;

  useEffect(() => {
    let live = true;
    void fetch("/api/stripe/billing-summary")
      .then(async (response) => {
        const body: unknown = await response.json();
        if (!response.ok || !body || typeof body !== "object" || !("livemode" in body) || typeof body.livemode !== "boolean") throw new Error("Billing is unavailable.");
        if (live) setLivemode(body.livemode);
      })
      .catch(() => live && setRead({ ok: false, reason: "Billing is unavailable." }));
    return () => { live = false; };
  }, []);

  useEffect(() => {
    if (livemode === null) return;
    let live = true;
    void readBillingSummary(scope, livemode).then((result) => { if (live) setRead(result); });
    return () => { live = false; };
  }, [scope, livemode]);

  useEffect(() => {
    if (!read?.ok || !read.subscription || !["past_due", "unpaid", "incomplete"].includes(read.subscription.status)) return;
    let live = true;
    const headers = new Headers({ "Content-Type": "application/json" });
    if (organizationId) headers.set("X-Organization-Id", organizationId);
    void fetch("/api/stripe/billing-summary", {
      method: "POST",
      headers,
      body: JSON.stringify({ scope: scope.kind }),
    })
      .then(async (response) => response.ok ? response.json() : null)
      .then((result: unknown) => {
        if (!live || !result || typeof result !== "object" || !("invoice" in result)) return;
        const candidate = result.invoice;
        if (candidate && typeof candidate === "object" && "url" in candidate && "status" in candidate && "requiresAction" in candidate) setInvoice(candidate as InvoiceRecovery);
      });
    return () => { live = false; };
  }, [read, scope.kind, organizationId]);

  const title = scope.kind === "personal" ? "Personal billing" : "Organization billing";
  if (!read || livemode === null) return <div className="flex items-center gap-2 rounded-md border border-border bg-card p-4 text-sm text-muted-foreground"><Loader2 className="h-4 w-4 animate-spin" aria-hidden />Loading {title.toLowerCase()}…</div>;
  if (!read.ok) return <div className="rounded-md border border-destructive/40 bg-card p-4 text-sm text-destructive">{read.reason}</div>;
  if (!read.subscription) return <div className="rounded-md border border-border bg-card p-4 text-sm text-muted-foreground">No paid subscription for this account.</div>;

  const plan = catalog.status === "ready" ? catalog.plans.find((item) => item.planKey === read.subscription?.plan_key) : null;
  const periodEnd = dateLabel(read.subscription.current_period_end);
  const recovering = ["past_due", "unpaid", "incomplete"].includes(read.subscription.status);
  return (
    <section className="rounded-md border border-border bg-card p-4" aria-label={title}>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="text-sm font-semibold text-foreground">Purchased plan</p>
          <p className="mt-1 text-sm text-muted-foreground">{plan?.name ?? read.subscription.plan_key}{priceLabel(read.price) ? ` · ${priceLabel(read.price)}` : ""}</p>
        </div>
        <span className="rounded bg-muted px-2 py-1 text-xs font-medium text-foreground">{billingStatusLabel(read.subscription.status)}</span>
      </div>
      {periodEnd ? <p className="mt-3 text-sm text-muted-foreground">{periodEndLabel(read.subscription.cancel_at_period_end)} {periodEnd}</p> : null}
      {recovering ? <p className="mt-2 text-sm text-destructive">Payment needs attention.</p> : null}
      <div className="mt-4 flex flex-wrap gap-2">
        {invoice?.url ? <Button size="sm" onClick={() => window.location.assign(invoice.url!)}>{invoice.requiresAction ? "Complete payment" : "Pay invoice"}</Button> : null}
        <SubscriptionControls livemode={livemode} scope={scope.kind === "personal" ? { kind: "personal" } : { kind: "organization", organizationId: scope.organizationId }} label="Manage billing" />
      </div>
    </section>
  );
}
