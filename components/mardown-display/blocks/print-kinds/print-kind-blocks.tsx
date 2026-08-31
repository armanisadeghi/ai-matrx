"use client";

/**
 * Canonical renderers for the Lulu print kind family (`print_lulu`).
 *
 * The shapes are Python-owned (`aidream/aidream/kinds/print_lulu.py`, registered
 * through the `@kind` SDK) and the payload types are generated from the live
 * kind registry — these files never declare a payload interface of their own.
 * Every renderer accepts the uniform streaming bridge or a bare nested value
 * and reads every field defensively, because a mid-stream value is a partial.
 *
 * 🚨 MONEY IS A DECIMAL STRING AND STAYS ONE. Lulu hands us `"6.01"`, never
 * `6.01`, precisely so a quote cannot drift by a cent on the way to a screen.
 * `money()` below prefixes the currency symbol and renders the digits Lulu
 * sent, VERBATIM. Nothing here parses, rounds, sums, or re-computes an amount —
 * a renderer formats; the quote is the server's answer.
 */

import React from "react";
import {
  AlertTriangle,
  BookOpen,
  Boxes,
  Factory,
  Package,
  ReceiptText,
  Ruler,
  Tag,
  Truck,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { KindHeaderBar } from "@/components/kind-kit/KindHeaderBar";
import { KindPanel } from "@/components/kind-kit/KindPanel";
import { KindPanelGrid } from "@/components/kind-kit/KindPanelGrid";
import { TagList } from "@/components/kind-kit/TagList";
import {
  items,
  num,
  readSearchKindValue,
  text,
} from "../search-kinds/search-kind-data";

interface PrintBlockProps {
  serverData?: unknown;
  className?: string;
}

// ---------------------------------------------------------------- formatting

/**
 * The currency symbol for a code, WITHOUT touching the amount. We format zero
 * only to learn what the locale calls the currency, then discard the digits and
 * concatenate Lulu's decimal string untouched.
 */
function currencyPrefix(currency: string | null): string {
  if (!currency) return "";
  try {
    const parts = new Intl.NumberFormat(undefined, {
      style: "currency",
      currency,
    }).formatToParts(0);
    const symbol = parts.find((part) => part.type === "currency")?.value;
    return symbol ?? `${currency} `;
  } catch {
    return `${currency} `;
  }
}

/**
 * Render a decimal-string amount. The digits are Lulu's, character for
 * character — this only puts a symbol in front of them.
 */
function money(value: unknown, currency: string | null): string | null {
  const amount = text(value);
  if (amount === null) return null;
  return `${currencyPrefix(currency)}${amount}`;
}

/** A rate arrives as a decimal string like "0.06" — shown as-is, labelled. */
function rate(value: unknown): string | null {
  const raw = text(value);
  return raw === null ? null : `rate ${raw}`;
}

function humanize(value: string | null | undefined): string {
  return value ? value.replaceAll("_", " ") : "Not supplied";
}

function isoDate(value: unknown): string | null {
  const raw = text(value);
  if (raw === null) return null;
  const parsed = new Date(raw);
  if (Number.isNaN(parsed.getTime())) return raw;
  return parsed.toLocaleString(undefined, {
    year: "numeric",
    month: "short",
    day: "numeric",
    hour: raw.includes("T") ? "numeric" : undefined,
    minute: raw.includes("T") ? "2-digit" : undefined,
  });
}

// -------------------------------------------------------------------- chrome

function PrintShell({
  slug,
  title,
  subtitle,
  icon,
  value,
  isComplete,
  stats,
  className,
  children,
}: {
  slug: string;
  title: string;
  subtitle?: React.ReactNode;
  icon: React.ComponentType<{ className?: string }>;
  value: object;
  isComplete: boolean;
  stats?: { label: string; value: React.ReactNode }[];
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <section
      data-kind-renderer={slug}
      className={cn(
        "my-3 space-y-3 rounded-xl border border-border bg-card p-4 shadow-sm",
        className,
      )}
    >
      <KindHeaderBar
        icon={icon}
        title={title}
        subtitle={subtitle}
        stats={stats}
        streaming={!isComplete}
        copy={{
          label: title,
          human: () => JSON.stringify(value, null, 2),
          json: () => value,
          agent: () => ({
            kind: slug,
            location: "AI Matrx Lulu print kind renderer",
            description: `One ${slug} payload from the Lulu print lane.`,
            data: value,
          }),
        }}
      />
      {children}
    </section>
  );
}

function Fact({
  label,
  children,
  strong,
}: {
  label: string;
  children: React.ReactNode;
  strong?: boolean;
}) {
  return (
    <div className="min-w-0 rounded-md bg-muted/40 px-2.5 py-2">
      <dt className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
        {label}
      </dt>
      <dd
        className={cn(
          "mt-0.5 break-words tabular-nums text-foreground",
          strong ? "text-base font-semibold" : "text-sm",
        )}
      >
        {children ?? "—"}
      </dd>
    </div>
  );
}

function FactGrid({ children }: { children: React.ReactNode }) {
  return (
    <dl className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-4">
      {children}
    </dl>
  );
}

function StatusPill({
  value,
  tone = "neutral",
}: {
  value: string;
  tone?: "good" | "warn" | "bad" | "neutral";
}) {
  return (
    <span
      className={cn(
        "inline-flex rounded-full border px-2 py-0.5 text-xs font-medium capitalize",
        tone === "good" && "border-success/40 bg-success/10 text-success",
        tone === "warn" && "border-warning/40 bg-warning/10 text-warning",
        tone === "bad" &&
          "border-destructive/40 bg-destructive/10 text-destructive",
        tone === "neutral" && "border-border bg-muted text-muted-foreground",
      )}
    >
      {humanize(value)}
    </span>
  );
}

/** A scrolling frame — a wide table never makes the page scroll sideways. */
function TableScroll({ children }: { children: React.ReactNode }) {
  return (
    <div className="overflow-x-auto rounded-md border border-border">
      <table className="w-full min-w-[36rem] text-sm">{children}</table>
    </div>
  );
}

function Th({
  children,
  numeric,
}: {
  children: React.ReactNode;
  numeric?: boolean;
}) {
  return (
    <th
      className={cn(
        "whitespace-nowrap bg-muted/50 px-2.5 py-1.5 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground",
        numeric ? "text-right" : "text-left",
      )}
    >
      {children}
    </th>
  );
}

function Td({
  children,
  numeric,
}: {
  children: React.ReactNode;
  numeric?: boolean;
}) {
  return (
    <td
      className={cn(
        "border-t border-border px-2.5 py-1.5 align-top text-foreground",
        numeric ? "text-right tabular-nums" : "text-left",
      )}
    >
      {children ?? "—"}
    </td>
  );
}

// ------------------------------------------------- lulu_print_cost_calculation

/** One cost bucket (shipping & handling, fulfillment) as a compact panel. */
function CostBucket({
  title,
  icon,
  bucket,
  currency,
}: {
  title: string;
  icon: React.ComponentType<{ className?: string }>;
  bucket:
    | {
        total_cost_excl_tax?: string | null;
        total_cost_incl_tax?: string | null;
        total_tax?: string | null;
        tax_rate?: string | null;
      }
    | null
    | undefined;
  currency: string | null;
}) {
  if (!bucket) return null;
  return (
    <KindPanel
      title={title}
      icon={icon}
      dense
      badge={rate(bucket.tax_rate) ?? undefined}
    >
      <FactGrid>
        <Fact label="Excl. tax">{money(bucket.total_cost_excl_tax, currency)}</Fact>
        <Fact label="Tax">{money(bucket.total_tax, currency)}</Fact>
        <Fact label="Incl. tax" strong>
          {money(bucket.total_cost_incl_tax, currency)}
        </Fact>
      </FactGrid>
    </KindPanel>
  );
}

export function LuluPrintCostBlock({ serverData, className }: PrintBlockProps) {
  const { value, isComplete } =
    readSearchKindValue<"lulu_print_cost_calculation">(serverData);
  const currency = text(value.currency);
  // `null` is a REAL state here — Lulu has not priced the basket yet — and it
  // is reported below rather than shown as an empty table.
  const lines = items(value.line_item_costs ?? undefined);
  const fees = items(value.fees);
  const hasLineBreakdown = value.line_item_costs != null;

  return (
    <PrintShell
      slug="lulu_print_cost_calculation"
      title="Print cost quote"
      subtitle="Lulu's priced quote. Every amount is Lulu's own decimal string, shown exactly as sent."
      icon={ReceiptText}
      value={value}
      isComplete={isComplete}
      stats={[
        { label: "currency", value: currency ?? "—" },
        { label: "lines", value: lines.length },
        { label: "fees", value: fees.length },
      ]}
      className={className}
    >
      {/* The number a buyer pays leads, and it is bold. */}
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        <Fact label="Total excl. tax" strong>
          {money(value.total_cost_excl_tax, currency)}
        </Fact>
        <Fact label="Total incl. tax" strong>
          {money(value.total_cost_incl_tax, currency)}
        </Fact>
        <Fact label="Total tax">{money(value.total_tax, currency)}</Fact>
        <Fact label="Discounts applied">
          {money(value.total_discount_amount, currency)}
        </Fact>
      </div>

      {hasLineBreakdown ? (
        <TableScroll>
          <thead>
            <tr>
              <Th numeric>Qty</Th>
              <Th numeric>Unit tier</Th>
              <Th numeric>Unit pre-discount</Th>
              <Th numeric>Line pre-discount</Th>
              <Th numeric>Excl. tax</Th>
              <Th numeric>Tax</Th>
              <Th numeric>Incl. tax</Th>
              <Th>Discounts</Th>
            </tr>
          </thead>
          <tbody>
            {lines.map((line, index) => {
              const discounts = items(line.discounts);
              return (
                <tr key={index}>
                  <Td numeric>{num(line.quantity) ?? "—"}</Td>
                  <Td numeric>{money(line.unit_tier_cost, currency)}</Td>
                  <Td numeric>{money(line.cost_excl_discounts, currency)}</Td>
                  <Td numeric>
                    {money(line.total_cost_excl_discounts, currency)}
                  </Td>
                  <Td numeric>{money(line.total_cost_excl_tax, currency)}</Td>
                  <Td numeric>
                    {money(line.total_tax, currency)}
                    {line.tax_rate ? (
                      <span className="ml-1 text-xs text-muted-foreground">
                        ({text(line.tax_rate)})
                      </span>
                    ) : null}
                  </Td>
                  <Td numeric>
                    <span className="font-semibold">
                      {money(line.total_cost_incl_tax, currency)}
                    </span>
                  </Td>
                  <Td>
                    {discounts.length === 0 ? (
                      <span className="text-xs text-muted-foreground">
                        None applied
                      </span>
                    ) : (
                      <ul className="space-y-0.5">
                        {discounts.map((discount, discountIndex) => (
                          <li key={discountIndex} className="text-xs">
                            <span className="font-medium tabular-nums text-foreground">
                              {money(discount.amount, currency) ?? "—"}
                            </span>{" "}
                            <span className="text-muted-foreground">
                              {text(discount.description) ?? "no reason given"}
                            </span>
                          </li>
                        ))}
                      </ul>
                    )}
                  </Td>
                </tr>
              );
            })}
          </tbody>
        </TableScroll>
      ) : (
        <p className="rounded-md border border-border bg-muted/40 px-3 py-2 text-sm text-muted-foreground">
          Lulu has not priced the basket yet, so there is no per-line breakdown.
          The totals above are the whole quote.
        </p>
      )}

      <KindPanelGrid minColumnWidth={260}>
        <CostBucket
          title="Shipping and handling"
          icon={Truck}
          bucket={value.shipping_cost}
          currency={currency}
        />
        <CostBucket
          title="Fulfillment"
          icon={Factory}
          bucket={value.fulfillment_cost}
          currency={currency}
        />
      </KindPanelGrid>

      {fees.length > 0 ? (
        <KindPanel title="Fees" icon={Tag} count={fees.length} dense>
          <TableScroll>
            <thead>
              <tr>
                <Th>Fee type</Th>
                <Th>SKU</Th>
                <Th numeric>Excl. tax</Th>
                <Th numeric>Tax</Th>
                <Th numeric>Incl. tax</Th>
              </tr>
            </thead>
            <tbody>
              {fees.map((fee, index) => (
                <tr key={index}>
                  <Td>{humanize(text(fee.fee_type))}</Td>
                  <Td>{text(fee.sku) ?? "—"}</Td>
                  <Td numeric>
                    {money(fee.total_cost_excl_tax, text(fee.currency) ?? currency)}
                  </Td>
                  <Td numeric>
                    {money(fee.total_tax, text(fee.currency) ?? currency)}
                  </Td>
                  <Td numeric>
                    {money(fee.total_cost_incl_tax, text(fee.currency) ?? currency)}
                  </Td>
                </tr>
              ))}
            </tbody>
          </TableScroll>
        </KindPanel>
      ) : null}
    </PrintShell>
  );
}

// ------------------------------------------------------ lulu_shipping_options

export function LuluShippingOptionsBlock({
  serverData,
  className,
}: PrintBlockProps) {
  const { value, isComplete } =
    readSearchKindValue<"lulu_shipping_options">(serverData);
  const currency = text(value.currency);
  const options = items(value.options);
  const country = text(value.country_code);
  const state = text(value.state_code);
  const destination = [state, country].filter(Boolean).join(", ") || "—";

  return (
    <PrintShell
      slug="lulu_shipping_options"
      title="Shipping options"
      subtitle="The levels Lulu will actually ship this line item to this destination with — never a generic rate card."
      icon={Truck}
      value={value}
      isComplete={isComplete}
      stats={[
        { label: "destination", value: destination },
        { label: "levels", value: options.length },
        { label: "currency", value: currency ?? "—" },
      ]}
      className={className}
    >
      {options.length === 0 ? (
        <p className="rounded-md border border-border bg-muted/40 px-3 py-2 text-sm text-muted-foreground">
          Lulu returned no shipping levels for this destination and line item.
        </p>
      ) : (
        <TableScroll>
          <thead>
            <tr>
              <Th>Level</Th>
              <Th numeric>Cost excl. tax</Th>
              <Th numeric>Transit days</Th>
              <Th numeric>Total days</Th>
              <Th>Dispatch window</Th>
              <Th>Delivery window</Th>
              <Th>Restrictions</Th>
            </tr>
          </thead>
          <tbody>
            {options.map((option, index) => {
              const flags: string[] = [];
              if (option.traceable) flags.push("Traceable");
              if (option.postbox_ok) flags.push("PO box OK");
              if (option.home_only) flags.push("Residential only");
              if (option.business_only) flags.push("Business only");
              const minDays = num(option.total_days_min);
              const maxDays = num(option.total_days_max);
              const totalDays =
                minDays !== null && maxDays !== null
                  ? `${minDays}–${maxDays}`
                  : (minDays ?? maxDays ?? null);
              const dispatch = [
                isoDate(option.min_dispatch_date),
                isoDate(option.max_dispatch_date),
              ].filter(Boolean);
              const delivery = [
                isoDate(option.min_delivery_date),
                isoDate(option.max_delivery_date),
              ].filter(Boolean);
              return (
                <tr key={num(option.id) ?? index}>
                  <Td>
                    <span className="font-medium">
                      {text(option.level) ?? "—"}
                    </span>
                    <span className="ml-1.5 text-xs text-muted-foreground">
                      #{num(option.id) ?? "—"}
                    </span>
                  </Td>
                  <Td numeric>
                    {money(
                      option.cost_excl_tax,
                      text(option.currency) ?? currency,
                    )}
                  </Td>
                  <Td numeric>{num(option.transit_time) ?? "—"}</Td>
                  <Td numeric>{totalDays ?? "—"}</Td>
                  <Td>{dispatch.join(" → ") || "—"}</Td>
                  <Td>{delivery.join(" → ") || "—"}</Td>
                  <Td>
                    {flags.length === 0 ? (
                      <span className="text-xs text-muted-foreground">
                        None stated
                      </span>
                    ) : (
                      <TagList items={flags} size="sm" />
                    )}
                  </Td>
                </tr>
              );
            })}
          </tbody>
        </TableScroll>
      )}
    </PrintShell>
  );
}

// ------------------------------------------------------ lulu_cover_dimensions

export function LuluCoverDimensionsBlock({
  serverData,
  className,
}: PrintBlockProps) {
  const { value, isComplete } =
    readSearchKindValue<"lulu_cover_dimensions">(serverData);
  const width = text(value.width);
  const height = text(value.height);
  const unit = text(value.unit);

  return (
    <PrintShell
      slug="lulu_cover_dimensions"
      title="Cover dimensions"
      subtitle="The full-wrap cover canvas for this book at this interior page count."
      icon={Ruler}
      value={value}
      isComplete={isComplete}
      stats={[{ label: "unit", value: unit ?? "—" }]}
      className={className}
    >
      <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1 rounded-md bg-muted/40 px-3 py-3">
        <span className="text-2xl font-semibold tabular-nums text-foreground">
          {width ?? "—"}
        </span>
        <span className="text-lg text-muted-foreground">×</span>
        <span className="text-2xl font-semibold tabular-nums text-foreground">
          {height ?? "—"}
        </span>
        <span className="text-sm text-muted-foreground">{unit ?? ""}</span>
      </div>
      <p className="text-sm leading-relaxed text-muted-foreground">
        Width is the <strong className="text-foreground">full wrap</strong> —
        back cover + spine + front cover + bleed. There is deliberately no
        separate spine measurement: the spine is what the width grows by as the
        interior page count grows, and Lulu owns the paper-caliper maths. Height
        includes bleed.
      </p>
    </PrintShell>
  );
}

// ------------------------------------------------------------ lulu_print_job

/**
 * Print-job lifecycle tones. Delivered/shipped is the good end, rejected and
 * cancelled are the destructive end, and every other state — created, unpaid,
 * in production, delayed, unmapped — is simply where the job currently is.
 */
function jobStatusTone(name: string | null): "good" | "bad" | "neutral" {
  const key = (name ?? "").toUpperCase();
  if (key === "SHIPPED" || key === "DELIVERED") return "good";
  if (key === "REJECTED" || key === "CANCELED" || key === "CANCELLED")
    return "bad";
  return "neutral";
}

export function LuluPrintJobBlock({ serverData, className }: PrintBlockProps) {
  const { value, isComplete } =
    readSearchKindValue<"lulu_print_job">(serverData);
  const jobId = num(value.id);
  const statusName = text(value.status?.name);
  const lines = items(value.line_items);
  const costs = value.costs;
  // `LuluPrintJobCosts` carries no currency field — the job's amounts arrive as
  // bare decimal strings, so they are rendered bare rather than mislabelled.
  const costCurrency = null;

  return (
    <PrintShell
      slug="lulu_print_job"
      title={jobId !== null ? `Print job ${jobId}` : "Print job"}
      subtitle="A real print job — this is the thing that spends money and ships physical books."
      icon={Package}
      value={value}
      isComplete={isComplete}
      stats={[
        { label: "lines", value: lines.length },
        { label: "shipping", value: text(value.shipping_level) ?? "—" },
      ]}
      className={className}
    >
      <div className="flex flex-wrap items-center gap-2">
        {statusName ? (
          <StatusPill value={statusName} tone={jobStatusTone(statusName)} />
        ) : (
          <span className="text-xs text-muted-foreground">
            Lulu reported no job status.
          </span>
        )}
        {value.status?.changed ? (
          <span className="text-xs text-muted-foreground">
            changed {isoDate(value.status.changed)}
          </span>
        ) : null}
      </div>
      {text(value.status?.message) ? (
        <p className="text-sm leading-relaxed text-muted-foreground">
          {text(value.status?.message)}
        </p>
      ) : null}

      <FactGrid>
        <Fact label="Job id" strong>
          {jobId ?? "—"}
        </Fact>
        <Fact label="Order id">{text(value.order_id) ?? "—"}</Fact>
        <Fact label="External id">
          {text(value.external_id) ?? "Not supplied"}
        </Fact>
        <Fact label="Contact email">{text(value.contact_email) ?? "—"}</Fact>
        <Fact label="Shipping level">
          {text(value.shipping_level) ?? "—"}
        </Fact>
        <Fact label="Tax country">{text(value.tax_country) ?? "—"}</Fact>
        <Fact label="Cancel deadline">
          {isoDate(value.production_due_time) ?? "—"}
        </Fact>
        <Fact label="Production delay">
          {num(value.production_delay) !== null
            ? `${num(value.production_delay)} min`
            : "—"}
        </Fact>
        <Fact label="Created">{isoDate(value.date_created) ?? "—"}</Fact>
        <Fact label="Modified">{isoDate(value.date_modified) ?? "—"}</Fact>
      </FactGrid>

      <KindPanel
        title="Line items"
        icon={BookOpen}
        count={lines.length}
        dense
        subline="Each line carries its own status — file normalization lands here, not on the job."
      >
        {lines.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            This job has no line items.
          </p>
        ) : (
          <TableScroll>
            <thead>
              <tr>
                <Th>Title</Th>
                <Th>SKU</Th>
                <Th numeric>Qty</Th>
                <Th numeric>Pages</Th>
                <Th>Status</Th>
                <Th>External id</Th>
                <Th>Tracking</Th>
              </tr>
            </thead>
            <tbody>
              {lines.map((line, index) => {
                const lineStatus = text(line.status?.name);
                const messages = line.status?.messages;
                const hasMessages =
                  messages != null &&
                  typeof messages === "object" &&
                  Object.keys(messages).length > 0;
                const trackingUrls = Array.isArray(line.tracking_urls)
                  ? line.tracking_urls.filter(
                      (url): url is string => typeof url === "string",
                    )
                  : [];
                return (
                  <tr key={num(line.id) ?? index}>
                    <Td>{text(line.title) ?? "—"}</Td>
                    <Td>
                      <span className="break-all font-mono text-xs">
                        {text(line.pod_package_id) ?? "—"}
                      </span>
                    </Td>
                    <Td numeric>{num(line.quantity) ?? "—"}</Td>
                    <Td numeric>{num(line.page_count) ?? "—"}</Td>
                    <Td>
                      {lineStatus ? (
                        <StatusPill
                          value={lineStatus}
                          tone={jobStatusTone(lineStatus)}
                        />
                      ) : (
                        "—"
                      )}
                      {hasMessages ? (
                        <pre className="mt-1 max-w-xs overflow-x-auto whitespace-pre-wrap break-words rounded bg-muted/60 p-1.5 text-[11px] text-muted-foreground">
                          {JSON.stringify(messages, null, 2)}
                        </pre>
                      ) : null}
                    </Td>
                    <Td>{text(line.external_id) ?? "Not supplied"}</Td>
                    <Td>
                      {text(line.tracking_id) ?? "Not shipped"}
                      {trackingUrls.length > 0 ? (
                        <ul className="mt-0.5 space-y-0.5">
                          {trackingUrls.map((url) => (
                            <li key={url}>
                              <a
                                href={url}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="break-all text-xs text-primary underline underline-offset-2"
                              >
                                {url}
                              </a>
                            </li>
                          ))}
                        </ul>
                      ) : null}
                    </Td>
                  </tr>
                );
              })}
            </tbody>
          </TableScroll>
        )}
      </KindPanel>

      {costs ? (
        <KindPanel title="What Lulu charges us" icon={ReceiptText} dense>
          <FactGrid>
            <Fact label="Excl. tax">
              {money(costs.total_cost_excl_tax, costCurrency)}
            </Fact>
            <Fact label="Tax">{money(costs.total_tax, costCurrency)}</Fact>
            <Fact label="Incl. tax" strong>
              {money(costs.total_cost_incl_tax, costCurrency)}
            </Fact>
          </FactGrid>
        </KindPanel>
      ) : null}

      {value.estimated_shipping_dates ? (
        <KindPanel title="Estimated shipping dates" icon={Truck} dense>
          <FactGrid>
            <Fact label="Dispatch from">
              {isoDate(value.estimated_shipping_dates.dispatch_min) ?? "—"}
            </Fact>
            <Fact label="Dispatch by">
              {isoDate(value.estimated_shipping_dates.dispatch_max) ?? "—"}
            </Fact>
            <Fact label="Arrives from">
              {isoDate(value.estimated_shipping_dates.arrival_min) ?? "—"}
            </Fact>
            <Fact label="Arrives by">
              {isoDate(value.estimated_shipping_dates.arrival_max) ?? "—"}
            </Fact>
          </FactGrid>
        </KindPanel>
      ) : null}
    </PrintShell>
  );
}

// ------------------------------------------------- lulu_print_product_matches

export function LuluPrintProductMatchesBlock({
  serverData,
  className,
}: PrintBlockProps) {
  const { value, isComplete } =
    readSearchKindValue<"lulu_print_product_matches">(serverData);
  const products = items(value.products);
  const matchCount = num(value.match_count);
  const returnedCount = num(value.returned_count);
  const truncated = value.truncated === true;

  return (
    <PrintShell
      slug="lulu_print_product_matches"
      title="Print product matches"
      subtitle="Catalog products that satisfy the filters. List prices are the spec sheet's estimate — a quote is the authority."
      icon={Boxes}
      value={value}
      isComplete={isComplete}
      stats={[
        { label: "matched", value: matchCount ?? "—" },
        { label: "shown", value: returnedCount ?? products.length },
        { label: "catalog", value: text(value.catalog_source) ?? "—" },
      ]}
      className={className}
    >
      {truncated ? (
        <div className="flex items-start gap-2 rounded-md border border-warning/40 bg-warning/10 px-3 py-2 text-sm text-warning">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
          <span>
            Results were cut by the limit
            {matchCount !== null && returnedCount !== null
              ? ` — ${returnedCount} of ${matchCount} matches are shown`
              : ""}
            . Narrow the filters to see the rest; do not guess from this subset.
          </span>
        </div>
      ) : null}

      {products.length === 0 ? (
        <p className="rounded-md border border-border bg-muted/40 px-3 py-2 text-sm text-muted-foreground">
          No catalog product matched these filters.
        </p>
      ) : (
        <TableScroll>
          <thead>
            <tr>
              <Th>SKU</Th>
              <Th>Trim</Th>
              <Th>Binding</Th>
              <Th>Interior</Th>
              <Th>Paper</Th>
              <Th>Pages</Th>
              <Th numeric>List base</Th>
              <Th numeric>List / page</Th>
            </tr>
          </thead>
          <tbody>
            {products.map((product, index) => {
              const trimWidth = text(product.trim_width_in);
              const trimHeight = text(product.trim_height_in);
              const trim =
                trimWidth && trimHeight
                  ? `${trimWidth}" × ${trimHeight}"`
                  : (text(product.trim_sku) ?? null);
              const minPages = num(product.min_page_count);
              const maxPages = num(product.max_page_count);
              const pageWindow =
                minPages !== null && maxPages !== null
                  ? `${minPages}–${maxPages}`
                  : (minPages ?? maxPages ?? null);
              const paperWeight = num(product.paper_weight);
              const paper = [
                text(product.paper_type),
                paperWeight !== null ? `${paperWeight} gsm` : null,
              ]
                .filter(Boolean)
                .join(" · ");
              const listCurrency = text(product.list_price_currency);
              return (
                <tr key={text(product.pod_package_id) ?? index}>
                  <Td>
                    <span className="break-all font-mono text-xs">
                      {text(product.pod_package_id) ?? "—"}
                    </span>
                    {text(product.book_type) ? (
                      <span className="mt-0.5 block text-xs text-muted-foreground">
                        {text(product.book_type)}
                      </span>
                    ) : null}
                  </Td>
                  <Td>
                    {trim ?? "—"}
                    {text(product.trim_sku) && trimWidth && trimHeight ? (
                      <span className="mt-0.5 block font-mono text-[11px] text-muted-foreground">
                        {text(product.trim_sku)}
                      </span>
                    ) : null}
                  </Td>
                  <Td>{text(product.binding) ?? "—"}</Td>
                  <Td>
                    {text(product.interior_color) ?? "—"}
                    {text(product.print_quality) ? (
                      <span className="ml-1 text-xs text-muted-foreground">
                        {text(product.print_quality)}
                      </span>
                    ) : null}
                  </Td>
                  <Td>
                    {paper || "—"}
                    {text(product.lamination) ? (
                      <span className="mt-0.5 block text-xs text-muted-foreground">
                        {text(product.lamination)}
                      </span>
                    ) : null}
                  </Td>
                  <Td>{pageWindow ?? "—"}</Td>
                  <Td numeric>
                    {money(product.list_price_base, listCurrency)}
                  </Td>
                  <Td numeric>
                    {money(product.list_price_per_page, listCurrency)}
                  </Td>
                </tr>
              );
            })}
          </tbody>
        </TableScroll>
      )}

      <p className="text-xs text-muted-foreground">
        Catalog source {text(value.catalog_source) ?? "unknown"}
        {isoDate(value.catalog_retrieved_at)
          ? `, retrieved ${isoDate(value.catalog_retrieved_at)}`
          : ""}
        . List prices are published estimates and never the authoritative price
        — that is always a live price quote, which applies bulk tiers, tax,
        shipping and fees.
      </p>
    </PrintShell>
  );
}
