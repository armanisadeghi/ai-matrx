/**
 * Transport for the aidream `/lulu/*` service.
 *
 * Compute goes DIRECT to the Python backend — never through a Next.js route.
 * `/lulu/*` is not in the generated OpenAPI contract yet, so the typed client
 * (`lib/api/typed-client.ts`) has nothing to bind to; this uses the sanctioned
 * raw lane (`lib/python-client.ts`), which still owns active-server URL
 * resolution (the admin server toggle / `apiConfigSlice`), auth headers,
 * request ids, and structured HTTP error parsing. There is NO base URL in
 * this folder.
 *
 * `captureErrors: false` is deliberate: this surface classifies every outcome
 * itself (awaiting-credentials vs upstream error) and renders a durable
 * recovery path, so a pending-credentials 503 must not fill Error Inspector.
 */

import { getJson, postJson } from "@/lib/python-client";
import { BackendApiError, describeBackendFailure } from "@/lib/api/errors";
import type {
  LuluCatalog,
  LuluDiscount,
  LuluFee,
  LuluFetchState,
  LuluLineItemCost,
  LuluMoneyBlock,
  LuluPriceResult,
  LuluShippingOption,
} from "./types";
import { readCatalog } from "./catalog";

/** The server answers 503 until Arman completes the sandbox-account step. */
const AWAITING_CREDENTIALS_STATUS = 503;

function asRecord(value: unknown): Record<string, unknown> | null {
  return typeof value === "object" && value !== null && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function asArray(value: unknown): unknown[] {
  return Array.isArray(value) ? value : [];
}

function readString(
  record: Record<string, unknown>,
  ...keys: string[]
): string | null {
  for (const key of keys) {
    const value = record[key];
    if (typeof value === "string" && value.trim().length > 0) return value.trim();
    if (typeof value === "number" && Number.isFinite(value)) return String(value);
  }
  return null;
}

function readNumber(
  record: Record<string, unknown>,
  ...keys: string[]
): number | null {
  for (const key of keys) {
    const value = record[key];
    if (typeof value === "number" && Number.isFinite(value)) return value;
    if (typeof value === "string" && value.trim().length > 0) {
      const parsed = Number(value);
      if (Number.isFinite(parsed)) return parsed;
    }
  }
  return null;
}

// ---------------------------------------------------------------------------
// Outcome classification
// ---------------------------------------------------------------------------

function isAwaitingCredentials(error: unknown): boolean {
  return (
    error instanceof BackendApiError &&
    error.status === AWAITING_CREDENTIALS_STATUS
  );
}

function credentialDetail(error: unknown): string {
  if (error instanceof BackendApiError) {
    const detail = error.detail || error.userMessage;
    if (detail) return detail;
  }
  return "Lulu is not configured — sandbox credentials pending.";
}

/** Turn any thrown failure into the surface's own state, never a toast. */
export function toFetchState<T>(error: unknown): LuluFetchState<T> {
  if (isAwaitingCredentials(error)) {
    return { status: "awaiting_credentials", detail: credentialDetail(error) };
  }
  const explanation = describeBackendFailure(error);
  return {
    status: "error",
    headline: explanation.headline,
    detail:
      explanation.chain.length > 1
        ? explanation.chain.slice(1).join(" · ")
        : (explanation.requestId || null),
  };
}

// ---------------------------------------------------------------------------
// Catalog
// ---------------------------------------------------------------------------

export async function fetchCatalog(signal?: AbortSignal): Promise<LuluCatalog> {
  const { data } = await getJson<unknown>("/lulu/catalog", {
    signal,
    captureErrors: false,
  });
  return readCatalog(data);
}

// ---------------------------------------------------------------------------
// Shipping options
// ---------------------------------------------------------------------------

function readShippingOption(raw: unknown): LuluShippingOption | null {
  if (typeof raw === "string" && raw.trim().length > 0) {
    return { level: raw.trim(), label: humanizeLevel(raw.trim()), sublabel: null };
  }
  const record = asRecord(raw);
  if (!record) return null;
  const level = readString(record, "level", "shipping_level", "id", "code", "value");
  if (!level) return null;
  const businessDaysMin = readNumber(record, "min_delivery_days", "business_days_min");
  const businessDaysMax = readNumber(record, "max_delivery_days", "business_days_max");
  const transit =
    businessDaysMin !== null && businessDaysMax !== null
      ? `${businessDaysMin}–${businessDaysMax} business days`
      : null;
  return {
    level,
    label: readString(record, "name", "label", "display_name") ?? humanizeLevel(level),
    sublabel: transit ?? readString(record, "description", "detail"),
  };
}

function humanizeLevel(level: string): string {
  return level
    .split(/[_\s-]+/)
    .filter(Boolean)
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
    .join(" ");
}

export async function fetchShippingOptions(
  countryCode: string,
  signal?: AbortSignal,
): Promise<LuluShippingOption[]> {
  const { data } = await getJson<unknown>(
    `/lulu/shipping-options?country_code=${encodeURIComponent(countryCode)}`,
    { signal, captureErrors: false },
  );
  const root = asRecord(data);
  const list = Array.isArray(data)
    ? data
    : root
      ? asArray(
          root.shipping_options ??
            root.options ??
            root.results ??
            root.levels ??
            root.data,
        )
      : [];
  return list
    .map(readShippingOption)
    .filter((entry): entry is LuluShippingOption => entry !== null);
}

// ---------------------------------------------------------------------------
// Price
// ---------------------------------------------------------------------------

export interface PriceRequest {
  podPackageId: string;
  pageCount: number;
  quantity: number;
  shippingLevel: string;
  address: {
    city: string;
    countryCode: string;
    postcode: string;
    street1: string;
    stateCode: string | null;
  };
}

function readMoneyBlock(raw: unknown): LuluMoneyBlock | null {
  const record = asRecord(raw);
  if (!record) return null;
  return {
    totalCostExclTax: readString(record, "total_cost_excl_tax"),
    totalCostInclTax: readString(record, "total_cost_incl_tax"),
    totalTax: readString(record, "total_tax"),
  };
}

function readDiscount(raw: unknown): LuluDiscount | null {
  const record = asRecord(raw);
  if (!record) return null;
  return {
    amount: readString(record, "amount", "total_amount"),
    description: readString(record, "description", "name", "label"),
  };
}

function readLineItem(raw: unknown): LuluLineItemCost | null {
  const record = asRecord(raw);
  if (!record) return null;
  return {
    totalCostExclTax: readString(record, "total_cost_excl_tax"),
    totalCostInclTax: readString(record, "total_cost_incl_tax"),
    totalTax: readString(record, "total_tax"),
    unitTierCost: readString(record, "unit_tier_cost", "unit_cost"),
    quantity: readNumber(record, "quantity"),
    discounts: asArray(record.discounts)
      .map(readDiscount)
      .filter((entry): entry is LuluDiscount => entry !== null),
  };
}

function readFee(raw: unknown): LuluFee | null {
  const record = asRecord(raw);
  if (!record) return null;
  return {
    feeType: readString(record, "fee_type", "type", "name"),
    totalCostExclTax: readString(record, "total_cost_excl_tax"),
    totalCostInclTax: readString(record, "total_cost_incl_tax"),
    totalTax: readString(record, "total_tax"),
  };
}

export function readPriceResult(raw: unknown): LuluPriceResult {
  const record = asRecord(raw) ?? {};
  return {
    currency: readString(record, "currency"),
    lineItems: asArray(record.line_item_costs)
      .map(readLineItem)
      .filter((entry): entry is LuluLineItemCost => entry !== null),
    shipping: readMoneyBlock(record.shipping_cost),
    fulfillment: readMoneyBlock(record.fulfillment_cost),
    fees: asArray(record.fees)
      .map(readFee)
      .filter((entry): entry is LuluFee => entry !== null),
    totalCostExclTax: readString(record, "total_cost_excl_tax"),
    totalCostInclTax: readString(record, "total_cost_incl_tax"),
    totalTax: readString(record, "total_tax"),
    totalDiscountAmount: readString(record, "total_discount_amount"),
  };
}

export async function fetchPrice(
  request: PriceRequest,
  signal?: AbortSignal,
): Promise<LuluPriceResult> {
  const { data } = await postJson<unknown, Record<string, unknown>>(
    "/lulu/price",
    {
      line_items: [
        {
          pod_package_id: request.podPackageId,
          page_count: request.pageCount,
          quantity: request.quantity,
        },
      ],
      shipping_address: {
        street1: request.address.street1,
        city: request.address.city,
        country_code: request.address.countryCode,
        postcode: request.address.postcode,
        ...(request.address.stateCode
          ? { state_code: request.address.stateCode }
          : {}),
      },
      shipping_option: request.shippingLevel,
    },
    { signal, captureErrors: false },
  );
  return readPriceResult(data);
}

// ---------------------------------------------------------------------------
// Money formatting — values arrive as decimal STRINGS
// ---------------------------------------------------------------------------

export function parseMoney(value: string | null): number | null {
  if (value === null) return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

export function formatMoney(
  value: string | number | null,
  currency: string | null,
): string {
  const amount = typeof value === "number" ? value : parseMoney(value);
  if (amount === null) return "—";
  try {
    return new Intl.NumberFormat("en-US", {
      style: "currency",
      currency: currency ?? "USD",
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    }).format(amount);
  } catch {
    return `${amount.toFixed(2)} ${currency ?? ""}`.trim();
  }
}
