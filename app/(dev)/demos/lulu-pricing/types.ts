/**
 * Narrow local types for the Lulu live-pricing demo.
 *
 * DELIBERATELY LOCAL AND NARROW: this is the surface's VIEW model, not the
 * wire contract. The wire contract is the generated one —
 * `types/python-generated/api-types.ts` (`PrintCatalog`,
 * `CostCalculationResult`, `ShippingOptionsResult`) — and every call is bound
 * to it through the typed client in `lulu-api.ts` / `catalog.ts`, which map
 * contract types into these with direct field access (no tolerant readers).
 */

// ---------------------------------------------------------------------------
// Catalog
// ---------------------------------------------------------------------------

/** The five constrained dimensions of a print book, in selection order. */
export type LuluDimension =
  | "trim"
  | "binding"
  | "color"
  | "paper"
  | "coverFinish";

export interface LuluOption {
  id: string;
  label: string;
  /** Secondary line (mm dimensions, ink/quality decode, …). */
  sublabel: string | null;
}

export interface LuluTrimOption extends LuluOption {
  widthIn: number | null;
  heightIn: number | null;
  widthMm: number | null;
  heightMm: number | null;
}

export type LuluBindingGroup = "paperback" | "hardcover";

export interface LuluBindingOption extends LuluOption {
  group: LuluBindingGroup;
}

/** One valid product combination with its page window. */
export interface LuluCombination {
  trimId: string;
  bindingId: string;
  colorId: string;
  paperId: string;
  coverFinishId: string;
  minPages: number | null;
  maxPages: number | null;
  podPackageId: string | null;
}

export interface LuluCatalog {
  source: string | null;
  retrievedAt: string | null;
  trims: LuluTrimOption[];
  bindings: LuluBindingOption[];
  colors: LuluOption[];
  papers: LuluOption[];
  coverFinishes: LuluOption[];
  combinations: LuluCombination[];
}

// ---------------------------------------------------------------------------
// Selection + constraint results
// ---------------------------------------------------------------------------

export interface LuluSelection {
  trimId: string | null;
  bindingId: string | null;
  colorId: string | null;
  paperId: string | null;
  coverFinishId: string | null;
  pageCount: number | null;
}

/** Availability verdict for one option inside one dimension. */
export interface OptionAvailability {
  available: boolean;
  /** Inline reason shown next to a disabled option. Null when available. */
  reason: string | null;
}

export interface PageWindow {
  min: number | null;
  max: number | null;
}

// ---------------------------------------------------------------------------
// Shipping
// ---------------------------------------------------------------------------

export interface LuluShippingOption {
  level: string;
  label: string;
  sublabel: string | null;
}

// ---------------------------------------------------------------------------
// Pricing — every money value arrives as a decimal STRING
// ---------------------------------------------------------------------------

export interface LuluMoneyBlock {
  totalCostExclTax: string | null;
  totalCostInclTax: string | null;
  totalTax: string | null;
}

export interface LuluDiscount {
  amount: string | null;
  description: string | null;
}

export interface LuluLineItemCost extends LuluMoneyBlock {
  unitTierCost: string | null;
  quantity: number | null;
  discounts: LuluDiscount[];
}

export interface LuluFee {
  feeType: string | null;
  totalCostExclTax: string | null;
  totalCostInclTax: string | null;
  totalTax: string | null;
}

export interface LuluPriceResult {
  currency: string | null;
  lineItems: LuluLineItemCost[];
  shipping: LuluMoneyBlock | null;
  fulfillment: LuluMoneyBlock | null;
  fees: LuluFee[];
  totalCostExclTax: string | null;
  totalCostInclTax: string | null;
  totalTax: string | null;
  totalDiscountAmount: string | null;
}

// ---------------------------------------------------------------------------
// Transport outcome — the 503 is a first-class state, not an error
// ---------------------------------------------------------------------------

export type LuluFetchState<T> =
  | { status: "idle" }
  | { status: "loading" }
  | { status: "ready"; data: T }
  /** Server answered 503: Lulu sandbox credentials are not configured yet. */
  | { status: "awaiting_credentials"; detail: string }
  | { status: "error"; headline: string; detail: string | null };

export interface BulkTier {
  /** Lower bound of the tier, and the quantity we actually price. */
  quantity: number;
  label: string;
  expectedDiscountLabel: string;
}
