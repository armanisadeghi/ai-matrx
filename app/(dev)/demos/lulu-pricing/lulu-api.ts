/**
 * Transport for the aidream `/lulu/*` service.
 *
 * Compute goes DIRECT to the Python backend — never through a Next.js route.
 * `/lulu/*` is in the generated OpenAPI contract, so every call here is bound
 * through the typed client (`lib/api/typed-client.ts`): paths, request bodies,
 * query params, and responses are all DERIVED from
 * `types/python-generated/api-types.ts` — when the backend contract moves,
 * this file lights up red on `pnpm sync-types`. There is NO base URL in this
 * folder and no tolerant multi-key readers: the mappers below do direct field
 * access on the contract types and only reshape to this surface's view model.
 *
 * `captureErrors: false` is deliberate: this surface classifies every outcome
 * itself (awaiting-credentials vs upstream error) and renders a durable
 * recovery path, so a pending-credentials 503 must not fill Error Inspector.
 */

import { apiGet, apiPost } from "@/lib/api/typed-client";
import { BackendApiError, describeBackendFailure } from "@/lib/api/errors";
import type { components } from "@/types/python-generated/api-types";
import type {
  LuluCatalog,
  LuluFetchState,
  LuluPriceResult,
  LuluShippingOption,
} from "./types";
import { buildCatalog } from "./catalog";

type CostCalculationResult = components["schemas"]["CostCalculationResult"];
type ShippingOption = components["schemas"]["ShippingOption"];

/** The server answers 503 until the Lulu credentials are configured. */
const AWAITING_CREDENTIALS_STATUS = 503;

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
  const { data } = await apiGet("/lulu/catalog", {
    signal,
    captureErrors: false,
  });
  return buildCatalog(data);
}

// ---------------------------------------------------------------------------
// Shipping options — the upstream requires a concrete line item, so the
// query cannot be issued until the configuration resolves to a package.
// ---------------------------------------------------------------------------

export interface ShippingOptionsQuery {
  countryCode: string;
  stateCode: string | null;
  podPackageId: string;
  pageCount: number;
  quantity: number;
}

function humanizeLevel(level: string): string {
  return level
    .split(/[_\s-]+/)
    .filter(Boolean)
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
    .join(" ");
}

function toShippingOption(option: ShippingOption): LuluShippingOption {
  const days =
    option.total_days_min != null && option.total_days_max != null
      ? option.total_days_min === option.total_days_max
        ? `${option.total_days_min} days`
        : `${option.total_days_min}–${option.total_days_max} days`
      : null;
  const cost =
    option.cost_excl_tax != null
      ? formatMoney(option.cost_excl_tax, option.currency ?? null)
      : null;
  const sublabel = [days, cost].filter(Boolean).join(" · ");
  return {
    level: option.level,
    label: humanizeLevel(option.level),
    sublabel: sublabel.length > 0 ? sublabel : null,
  };
}

export async function fetchShippingOptions(
  query: ShippingOptionsQuery,
  signal?: AbortSignal,
): Promise<LuluShippingOption[]> {
  const { data } = await apiGet("/lulu/shipping-options", {
    signal,
    captureErrors: false,
    query: {
      country_code: query.countryCode,
      pod_package_id: query.podPackageId,
      page_count: query.pageCount,
      quantity: query.quantity,
      ...(query.stateCode ? { state_code: query.stateCode } : {}),
    },
  });
  return (data.options ?? []).map(toShippingOption);
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
    /** Required by Lulu on every quote — no address is phone-less. */
    phoneNumber: string;
  };
}

type ShippingOptionLevel =
  components["schemas"]["PrintCostRequest"]["shipping_option"];

const SHIPPING_LEVELS: readonly ShippingOptionLevel[] = [
  "MAIL",
  "PRIORITY_MAIL",
  "GROUND_HD",
  "GROUND_BUS",
  "GROUND",
  "EXPEDITED",
  "EXPRESS",
] as const;

function asShippingLevel(level: string): ShippingOptionLevel {
  const match = SHIPPING_LEVELS.find((entry) => entry === level);
  if (!match) {
    throw new Error(`Unknown Lulu shipping level: ${level}`);
  }
  return match;
}

function toPriceResult(result: CostCalculationResult): LuluPriceResult {
  return {
    currency: result.currency ?? null,
    lineItems: (result.line_item_costs ?? []).map((item) => ({
      totalCostExclTax: item.total_cost_excl_tax ?? null,
      totalCostInclTax: item.total_cost_incl_tax ?? null,
      totalTax: item.total_tax ?? null,
      unitTierCost: item.unit_tier_cost ?? null,
      quantity: item.quantity,
      discounts: (item.discounts ?? []).map((discount) => ({
        amount: discount.amount ?? null,
        description: discount.description ?? null,
      })),
    })),
    shipping: result.shipping_cost
      ? {
          totalCostExclTax: result.shipping_cost.total_cost_excl_tax ?? null,
          totalCostInclTax: result.shipping_cost.total_cost_incl_tax ?? null,
          totalTax: result.shipping_cost.total_tax ?? null,
        }
      : null,
    fulfillment: result.fulfillment_cost
      ? {
          totalCostExclTax: result.fulfillment_cost.total_cost_excl_tax ?? null,
          totalCostInclTax: result.fulfillment_cost.total_cost_incl_tax ?? null,
          totalTax: result.fulfillment_cost.total_tax ?? null,
        }
      : null,
    fees: (result.fees ?? []).map((fee) => ({
      feeType: fee.fee_type ?? null,
      totalCostExclTax: fee.total_cost_excl_tax ?? null,
      totalCostInclTax: fee.total_cost_incl_tax ?? null,
      totalTax: fee.total_tax ?? null,
    })),
    totalCostExclTax: result.total_cost_excl_tax ?? null,
    totalCostInclTax: result.total_cost_incl_tax ?? null,
    totalTax: result.total_tax ?? null,
    totalDiscountAmount: result.total_discount_amount ?? null,
  };
}

export async function fetchPrice(
  request: PriceRequest,
  signal?: AbortSignal,
): Promise<LuluPriceResult> {
  const { data } = await apiPost(
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
        phone_number: request.address.phoneNumber,
        ...(request.address.stateCode
          ? { state_code: request.address.stateCode }
          : {}),
      },
      shipping_option: asShippingLevel(request.shippingLevel),
    },
    { signal, captureErrors: false },
  );
  return toPriceResult(data);
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
