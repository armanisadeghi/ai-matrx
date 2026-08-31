"use client";

/**
 * The order half of the calculator: turn the configured book into a PAID
 * print order.
 *
 * Money model (ruled 2026-08-30): the server re-quotes authoritatively,
 * applies the buyer's plan rate, and answers with a real Stripe Checkout URL —
 * this component never computes a price. Payment fulfils server-side (the
 * Lulu job is placed only after Stripe confirms), and a rejected file
 * auto-refunds. The orders list below is the buyer's live view of that
 * lifecycle.
 */

import { useCallback, useEffect, useState } from "react";
import { CreditCard, PackageCheck, RefreshCcw, XCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@ai-matrx/design-system";
import { Label } from "@/components/ui/label";
import { confirm } from "@/components/dialogs/confirm/ConfirmDialogHost";
import { cn } from "@/utils/cn";
import { formatMoney, toFetchState } from "./lulu-api";
import {
  ORDER_STATUS_LABELS,
  cancelOrder,
  createOrder,
  isCancelable,
  listOrders,
  type PrintOrder,
} from "./order-api";
import type { LuluFetchState } from "./types";

/** A publicly fetchable PDF so the sandbox flow can be exercised end to end. */
const SAMPLE_PDF = "https://assets.lulu.com/media/guides/en/lulu-book-creation-guide.pdf";

interface OrderFlowProps {
  /** Null until the configuration resolves to a priceable package. */
  podPackageId: string | null;
  pageCount: number | null;
  quantity: number;
  shippingLevel: string | null;
  destination: {
    countryCode: string;
    city: string;
    postcode: string;
    street1: string;
    stateCode: string | null;
  };
  disabled: boolean;
}

interface OrderForm {
  title: string;
  name: string;
  email: string;
  phone: string;
  street1: string;
  interiorUrl: string;
  coverUrl: string;
}

const EMPTY_FORM: OrderForm = {
  title: "",
  name: "",
  email: "",
  phone: "",
  street1: "",
  interiorUrl: SAMPLE_PDF,
  coverUrl: SAMPLE_PDF,
};

function Field({
  id,
  label,
  value,
  onChange,
  placeholder,
  type = "text",
  disabled,
}: {
  id: string;
  label: string;
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  type?: string;
  disabled?: boolean;
}) {
  return (
    <div className="space-y-1.5">
      <Label htmlFor={id} className="text-xs">
        {label}
      </Label>
      <Input
        id={id}
        type={type}
        value={value}
        placeholder={placeholder}
        disabled={disabled}
        onChange={(event) => onChange(event.target.value)}
        className="h-11"
      />
    </div>
  );
}

function StatusChip({ status }: { status: string }) {
  const tone =
    status === "delivered" || status === "shipped"
      ? "bg-success/15 text-success"
      : status === "rejected" || status === "fulfillment_failed" || status === "payment_expired"
        ? "bg-destructive/15 text-destructive"
        : status === "refunded" || status === "refund_due" || status === "canceled"
          ? "bg-muted text-muted-foreground"
          : "bg-primary/15 text-primary";
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium",
        tone,
      )}
    >
      {ORDER_STATUS_LABELS[status] ?? status}
    </span>
  );
}

export function OrderFlow({
  podPackageId,
  pageCount,
  quantity,
  shippingLevel,
  destination,
  disabled,
}: OrderFlowProps) {
  const [form, setForm] = useState<OrderForm>(EMPTY_FORM);
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);

  const [ordersState, setOrdersState] = useState<LuluFetchState<PrintOrder[]>>({
    status: "idle",
  });
  const [cancelingId, setCancelingId] = useState<string | null>(null);

  const refreshOrders = useCallback(() => {
    setOrdersState({ status: "loading" });
    listOrders()
      .then((orders) => setOrdersState({ status: "ready", data: orders }))
      .catch((error: unknown) => setOrdersState(toFetchState<PrintOrder[]>(error)));
  }, []);

  useEffect(() => {
    refreshOrders();
  }, [refreshOrders]);

  const ready =
    !disabled &&
    podPackageId !== null &&
    pageCount !== null &&
    shippingLevel !== null;

  const formComplete =
    ready &&
    form.title.trim().length > 0 &&
    form.name.trim().length > 0 &&
    form.email.includes("@") &&
    form.phone.trim().length >= 7 &&
    form.street1.trim().length > 0 &&
    form.interiorUrl.startsWith("http") &&
    form.coverUrl.startsWith("http");

  async function submit() {
    if (!formComplete || podPackageId === null || pageCount === null || shippingLevel === null) {
      return;
    }
    setSubmitting(true);
    setSubmitError(null);
    try {
      const origin = window.location.origin;
      const here = window.location.pathname;
      const checkout = await createOrder({
        title: form.title.trim(),
        pod_package_id: podPackageId,
        page_count: pageCount,
        quantity,
        interior_source_url: form.interiorUrl.trim(),
        cover_source_url: form.coverUrl.trim(),
        contact_email: form.email.trim(),
        shipping_address: {
          name: form.name.trim(),
          street1: form.street1.trim(),
          city: destination.city,
          country_code: destination.countryCode,
          postcode: destination.postcode,
          phone_number: form.phone.trim(),
          email: form.email.trim(),
          ...(destination.stateCode ? { state_code: destination.stateCode } : {}),
        },
        shipping_level: shippingLevel as never,
        success_url: `${origin}${here}?ordered=1`,
        cancel_url: `${origin}${here}?ordered=0`,
      });
      window.location.assign(checkout.checkout_url);
    } catch (error: unknown) {
      const state = toFetchState<never>(error);
      setSubmitError(
        state.status === "error"
          ? state.headline
          : state.status === "awaiting_credentials"
            ? state.detail
            : "Could not start checkout.",
      );
      setSubmitting(false);
    }
  }

  async function handleCancel(order: PrintOrder) {
    const total = formatMoney(order.charge_amount_cents / 100, order.currency);
    const confirmed = await confirm({
      title: "Cancel this print order?",
      description:
        order.status === "pending_payment"
          ? `"${order.title}" hasn't been paid yet — canceling just closes it.`
          : `"${order.title}" will not be printed, and the ${total} you paid is refunded in full. This can't be undone once production starts.`,
      confirmLabel: "Cancel the order",
      cancelLabel: "Keep it",
      variant: "destructive",
    });
    if (!confirmed) return;
    setCancelingId(order.id);
    try {
      await cancelOrder(order.id);
      refreshOrders();
    } catch {
      refreshOrders();
    } finally {
      setCancelingId(null);
    }
  }

  return (
    <section className="space-y-6">
      {/* ── Order form ─────────────────────────────────────────────────── */}
      <div className="rounded-2xl border border-border bg-card p-5">
        <h2 className="flex items-center gap-2 text-base font-semibold text-foreground">
          <CreditCard className="size-4 text-muted-foreground" />
          Order this book
        </h2>
        <p className="mt-1 text-xs text-muted-foreground">
          Pays through secure checkout; printing starts only after payment, and
          a file we can&apos;t print is refunded in full automatically. Orders
          currently run against the print sandbox — nothing physical ships yet.
        </p>

        <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-2">
          <Field
            id="order-title"
            label="Book title"
            value={form.title}
            onChange={(title) => setForm((f) => ({ ...f, title }))}
            placeholder="My Course Workbook"
            disabled={!ready || submitting}
          />
          <Field
            id="order-name"
            label="Recipient name"
            value={form.name}
            onChange={(name) => setForm((f) => ({ ...f, name }))}
            placeholder="Full name"
            disabled={!ready || submitting}
          />
          <Field
            id="order-email"
            label="Email"
            type="email"
            value={form.email}
            onChange={(email) => setForm((f) => ({ ...f, email }))}
            placeholder="you@example.com"
            disabled={!ready || submitting}
          />
          <Field
            id="order-phone"
            label="Phone"
            type="tel"
            value={form.phone}
            onChange={(phone) => setForm((f) => ({ ...f, phone }))}
            placeholder="+1 555 555 0100"
            disabled={!ready || submitting}
          />
          <div className="sm:col-span-2">
            <Field
              id="order-street"
              label={`Street address (${destination.city}, ${destination.countryCode})`}
              value={form.street1}
              onChange={(street1) => setForm((f) => ({ ...f, street1 }))}
              placeholder="Street and number"
              disabled={!ready || submitting}
            />
          </div>
          <Field
            id="order-interior"
            label="Interior PDF URL"
            value={form.interiorUrl}
            onChange={(interiorUrl) => setForm((f) => ({ ...f, interiorUrl }))}
            disabled={!ready || submitting}
          />
          <Field
            id="order-cover"
            label="Cover PDF URL"
            value={form.coverUrl}
            onChange={(coverUrl) => setForm((f) => ({ ...f, coverUrl }))}
            disabled={!ready || submitting}
          />
        </div>

        <div className="mt-4 flex flex-wrap items-center gap-3">
          <Button onClick={submit} disabled={!formComplete || submitting}>
            <CreditCard className="size-4" />
            {submitting ? "Opening checkout…" : "Order & pay"}
          </Button>
          {!ready ? (
            <span className="text-xs text-muted-foreground">
              Finish the book configuration above first.
            </span>
          ) : null}
          {submitError ? (
            <span className="text-xs text-destructive">{submitError}</span>
          ) : null}
        </div>
      </div>

      {/* ── Orders ─────────────────────────────────────────────────────── */}
      <div className="rounded-2xl border border-border bg-card p-5">
        <div className="flex items-center justify-between gap-2">
          <h2 className="flex items-center gap-2 text-base font-semibold text-foreground">
            <PackageCheck className="size-4 text-muted-foreground" />
            Your print orders
          </h2>
          <Button
            variant="ghost"
            size="sm"
            onClick={refreshOrders}
            disabled={ordersState.status === "loading"}
          >
            <RefreshCcw className="size-3.5" />
            Refresh
          </Button>
        </div>

        {ordersState.status === "ready" && ordersState.data.length === 0 ? (
          <p className="mt-3 text-sm text-muted-foreground">
            No orders yet — your first one shows up here the moment checkout
            opens.
          </p>
        ) : null}

        {ordersState.status === "error" ? (
          <p className="mt-3 text-sm text-destructive">{ordersState.headline}</p>
        ) : null}

        {ordersState.status === "ready" && ordersState.data.length > 0 ? (
          <ul className="mt-3 divide-y divide-border">
            {ordersState.data.map((order) => (
              <li
                key={order.id}
                className="flex flex-wrap items-center justify-between gap-x-4 gap-y-1 py-2.5"
              >
                <div className="min-w-0">
                  <p className="truncate text-sm font-medium text-foreground">
                    {order.title}
                    <span className="ml-2 text-xs font-normal text-muted-foreground">
                      {order.quantity} × {order.page_count} pages
                    </span>
                  </p>
                  {order.status_message ? (
                    <p className="truncate text-xs text-muted-foreground">
                      {order.status_message}
                    </p>
                  ) : null}
                </div>
                <div className="flex items-center gap-3">
                  <span className="text-sm font-medium tabular-nums text-foreground">
                    {formatMoney(order.charge_amount_cents / 100, order.currency)}
                  </span>
                  <StatusChip status={order.status} />
                  {isCancelable(order) ? (
                    <Button
                      variant="ghost"
                      size="sm"
                      className="text-destructive hover:text-destructive"
                      disabled={cancelingId === order.id}
                      onClick={() => handleCancel(order)}
                    >
                      <XCircle className="size-3.5" />
                      Cancel
                    </Button>
                  ) : null}
                </div>
              </li>
            ))}
          </ul>
        ) : null}
      </div>
    </section>
  );
}
