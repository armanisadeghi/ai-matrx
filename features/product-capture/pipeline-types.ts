/**
 * features/product-capture/pipeline-types.ts
 *
 * THE SHAPE CONTRACTS of the listing pipeline — what the AI agents write and
 * the management surfaces edit, per stage. Stored as jsonb payloads (one row
 * per item per kind in `workbench.product_capture_payload`), each carrying a
 * `version` so shapes can evolve without DDL; parse defensively — a payload
 * written by an older agent revision must render, not crash.
 *
 * Aligned with the backend agents' output contracts: change here and there
 * together (the aidream workflow workers consume/produce these documents).
 */

// ── Pipeline position ────────────────────────────────────────────────────────

export const PIPELINE_STAGES = [
  "intake",
  "analysis",
  "research",
  "review",
  "finalize",
  "listing",
  "listed",
] as const;
export type PipelineStage = (typeof PIPELINE_STAGES)[number];

export const STAGE_LABELS: Record<PipelineStage, string> = {
  intake: "Intake",
  analysis: "Analysis",
  research: "Research",
  review: "Review",
  finalize: "Finalize",
  listing: "Listing",
  listed: "Listed",
};

// ── Stage 1: vision analysis (first pass — deliberately simple scope) ───────

export type ItemComposition = "single" | "lot" | "mixed";

export interface AnalysisIdentifier {
  kind: "part_number" | "model_number" | "serial_number" | "upc" | "other";
  value: string;
  confidence: "high" | "medium" | "low";
  /** Image the identifier was read from, when known. */
  fileId?: string;
  note?: string;
}

/** When composition is "mixed": which images belong to which product, so the
 *  folder can be corrected (split into separate items) and re-run. */
export interface AnalysisGroup {
  label: string;
  fileIds: string[];
  note?: string;
}

export interface AnalysisResult {
  version: 1;
  /** single item · a lot (quantity of one item type) · MIXED distinct products. */
  composition: ItemComposition;
  /** Approximate unit count when composition is "lot". */
  lotCount?: number;
  /** Present only when composition is "mixed" — drives the split tool. */
  groups?: AnalysisGroup[];
  identifiers: AnalysisIdentifier[];
  /** Secondary attributes: color, brand, size, capacity… */
  attributes: Array<{ name: string; value: string }>;
  /** Obvious physical damage, tied to evidence images where possible. */
  damage: Array<{ description: string; fileId?: string }>;
  /** What the agent NEEDED to see but could not (obscured label, missing angle…). */
  unseen: Array<{ description: string }>;
  summary: string;
}

// ── Stage 2: product research ───────────────────────────────────────────────

export interface ResearchCandidate {
  name: string;
  partNumber?: string;
  note?: string;
}

export interface PriceFactor {
  factor: string;
  /** Relative importance, 1 (minor) – 5 (deciding factor). */
  weight: 1 | 2 | 3 | 4 | 5;
  /** generic = tracked for every product (grading, condition…); product_specific = discovered for THIS product. */
  kind: "generic" | "product_specific";
  note?: string;
}

export interface ResearchResult {
  version: 1;
  identity: {
    confirmed: boolean;
    product?: { name: string; brand?: string; model?: string; partNumber?: string };
    /** When not confirmed: the valid candidate set (an acceptable outcome). */
    candidates?: ResearchCandidate[];
  };
  description: string;
  marketplaces: Array<{ name: string; relevance: "primary" | "secondary"; note?: string }>;
  pricing: Array<{
    channel: string;
    priceLow?: number;
    priceHigh?: number;
    currency: string;
    note?: string;
    url?: string;
  }>;
  sellThrough?: string;
  /** The factors that move price for THIS product, weight-ranked. */
  priceFactors: PriceFactor[];
  /** What remains unknown → materialized into product_capture_question rows. */
  unknowns: Array<{ question: string; why?: string; blocking: boolean }>;
  sources: Array<{ label: string; url?: string }>;
}

// ── Stage 4: finalization grading ───────────────────────────────────────────

export const GRADING_CRITERIA = [
  { key: "cosmetic", label: "Cosmetic condition" },
  { key: "functional", label: "Working condition" },
  { key: "completeness", label: "Completeness (parts, accessories)" },
  { key: "packaging", label: "Packaging" },
] as const;

export type GradeValue = "A" | "B" | "C" | "D" | "F" | "na";

export interface GradingResult {
  version: 1;
  criteria: Array<{
    key: string;
    label: string;
    grade: GradeValue;
    note?: string;
  }>;
  overallNote?: string;
  /** Every criterion resolved, no ambiguity left — gates listing generation. */
  ready: boolean;
}

// ── Stage 5: generated listing (approval-gated; publishing is future scope) ─

export interface ListingDraft {
  version: 1;
  marketplace: string;
  title: string;
  subtitle?: string;
  description: string;
  bullets: string[];
  price?: number;
  currency: string;
  condition?: string;
  category?: string;
  itemSpecifics: Array<{ name: string; value: string }>;
  approved: boolean;
  approvedAt?: string;
}

// ── Payload envelope ────────────────────────────────────────────────────────

export type PayloadKind =
  | "analysis"
  | "research"
  | "grading"
  | "listing"
  | "instant_analysis";

export interface PayloadDataByKind {
  analysis: AnalysisResult;
  research: ResearchResult;
  grading: GradingResult;
  listing: ListingDraft;
  /**
   * The INSTANT lane's stored result (client-triggered test mode): the raw
   * `electronics_intake_analysis` kind object streamed back by the mandate
   * `product_capture.instant_analysis`, saved verbatim. Deliberately loose
   * here — that shape belongs to the registered kind (and renders through the
   * kind registry), not to this pipeline's own contracts above.
   */
  instant_analysis: Record<string, unknown>;
}

/** One stored payload row (workbench.product_capture_payload). */
export interface PipelinePayload<K extends PayloadKind = PayloadKind> {
  id: string;
  itemId: string;
  kind: K;
  data: Partial<PayloadDataByKind[K]>;
  updatedAt: string;
  version: number;
}
