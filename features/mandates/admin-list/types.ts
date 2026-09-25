// features/mandates/admin-list/types.ts
//
// One row of the admin mandate list preview (/administration/mandates/list-preview).
// It is the console's health row (`MandateRow`, the ONE builder in
// ../admin/mandate-health.ts) plus the facts the console never showed:
// who created it, whose it is, who customized it, and where it comes from.
// Every field is read from a real source; `null` means that source did not
// answer, never "none".

import type { MandateCoverageBucket } from "@/features/mandates/coverage";
import type { MandateRow } from "@/features/mandates/admin/mandate-health";
import type {
  ImpactBlocker,
  ImpactGrade,
  ImpactVerdict,
} from "@/features/mandates/admin/impact";
import type { UngradedReason } from "@/features/mandates/admin/impact-cells";
import type { WorkflowImpactVerdict } from "@/features/mandates/admin/workflow-impact";
import type { MandateSourceFacts } from "@/features/mandates/code-references/data";
import type { MandateContractState } from "./rpc";

/** Code-backed (declared in repo code) or soft (exists only as a DB row). */
export type MandateOrigin = "code" | "soft";

/** What the live code declaration says about this key (`GET /mandates/code-truth`). */
export type MandateCodeState =
  | "declared"
  | "import_failed"
  | "not_in_code";

/** Where the job runs from, read from shortcut / surface / app rows. */
export type MandateServes =
  | "Shortcut"
  | "Surface"
  | "Agent app"
  | "Feature code"
  | "Nothing found";

/** The default situation of the job's own rung. */
export type MandateDefaultState = "Own default" | "Fallback" | "No default";

export interface MandateAdminRow extends MandateRow {
  /** The pretty name — the author's label, else the key's last segment. */
  name: string;
  /** "Podcast", "SEO › Ai Visibility", "Shortcuts", "Agent apps". */
  featureLabel: string;
  goal: string | null;

  /** Null when the coverage report did not answer — never guessed green. */
  coverage: MandateCoverageBucket | null;
  coverageDetail: string | null;
  defaultVerdict: ImpactVerdict | null;
  bindingVerdicts: ImpactVerdict[];
  /**
   * Workflow parity: every rung of this job a WORKFLOW holds, graded by
   * `POST /mandates/impact/workflows` (default rung first). Empty when no
   * workflow holds it or the read has not answered.
   */
  workflowVerdicts: WorkflowImpactVerdict[];
  ungraded: UngradedReason | null;
  impactGrade: ImpactGrade | "ungraded";
  impactBlocker: ImpactBlocker | "none" | "ungraded";

  /** "agent" | "workflow" — the default rung's Holder type. */
  holderType: string;
  /** Pinned version label ("v3") or "Latest"; "None" with no holder. */
  pinText: string;

  /** "Default", org names, "Personal" — one entry per kind. */
  customizedBy: string[];

  createdBy: string | null;
  organizationId: string | null;
  /** "System" or the owning organization's name. */
  homeLabel: string;
  isSystem: boolean;
  createdAt: string | null;

  origin: MandateOrigin;
  codeState: MandateCodeState;
  /** "Python · aidream" when a declaration was found, else null. */
  declaredIn: string | null;
  /** `aidream/services/podcast/mandates.py:41` when known. */
  declaredFile: string | null;
  serves: MandateServes[];
  /** Surface names, shortcut labels, app names behind `serves`. */
  servesDetail: string[];
  defaultState: MandateDefaultState;
  fallbackKey: string | null;
  /** Other mandates whose fallback is this one. */
  backsCount: number;
  /**
   * The server reports this row's cells are still waiting on. The list paints
   * from the database first; until code truth lands Health is not a verdict,
   * and until coverage lands Coverage is not one either.
   */
  factsPending: { codeTruth: boolean; coverage: boolean };
  /**
   * The persisted contract verdicts across the default and every live binding
   * (features/mandates/contract-check.ts), classified by the database.
   */
  contractCheck: MandateContractState;
  /**
   * Where the code scan finds this key (`fetchMandateSourceFacts`): declaring
   * repos, calling repos, languages, call sites. `null` = the scan has no
   * reference to it (nobody looked — never "unused"), or the read failed
   * (`sourcesFailed`).
   */
  sources: MandateSourceFacts | null;
  /** The scan read for this page has not answered yet — cells say so. */
  sourcesPending: boolean;
  sourcesFailed: boolean;
}
