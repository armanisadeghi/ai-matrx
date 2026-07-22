/**
 * `validateAgainstKind(value, kind)` — the one-call "is this data a valid X?"
 * primitive for the browser.
 *
 * Before this existed, every caller hand-composed the same three steps:
 * fetch the contract → materialize `emitted_json_schema` → run
 * `validateStructuralLeg`. That composition was written out independently in
 * `KindInputForm`, `ShapeOwnerEditor`, and the shape doctor — three chances to
 * drift on `__kind` stripping, ajv config, or the "schema missing" branch.
 *
 * ── A skip is never a pass ──────────────────────────────────────────────────
 *
 * `checked` is reported separately from `ok`, mirroring Python's `KindCheck`
 * (`matrx_graph/kinds.py`) and using the SAME degraded-reason vocabulary, so
 * the two runtimes describe the same failure the same way. A caller that reads
 * only `ok` gets `false` when the check could not run — the safe direction.
 * A caller that wants to distinguish "invalid" from "could not tell" reads
 * `checked` and `degradedReason`.
 *
 * Validation itself delegates to `validateStructuralLeg` — the activation
 * gate's own leg — so this is never a parallel validator. One ajv config, one
 * `__kind`-stripping rule, one answer.
 *
 * Deliberately NOT reported here: `kind_definition.is_active`. That is a
 * RENDER-trust verdict (R6), not a statement about the contract — an inactive
 * kind's schema is perfectly checkable. Callers that need it read the catalog.
 */

import { validateStructuralLeg } from "./kind-dual-gate";
import { getKindInputContractBySlug } from "./schema-source-kind-tables";

/**
 * Why a check could not produce a verdict. Deliberately identical to Python's
 * `KindDegradedReason` (`matrx_graph/kinds.py`) minus `kind_inactive`, per the
 * note above.
 */
export type KindValidationDegradedReason =
  | "kind_not_registered"
  | "schema_unavailable"
  | "schema_invalid"
  | "catalog_unreachable";

export interface KindValidationResult {
  kind: string;
  /** False when the check could not run at all. A skip is NEVER a pass. */
  checked: boolean;
  /** True only when `checked` AND the value satisfied the schema. */
  ok: boolean;
  /** ajv messages, or a single explanatory line when the check was skipped. */
  errors: string[];
  /** Non-null exactly when `checked === false`. */
  degradedReason: KindValidationDegradedReason | null;
  /** True when the kind is a generated machine contract (never human-filled). */
  dataOnly: boolean | null;
}

interface CachedContract {
  emittedJsonSchema: unknown;
  dataOnly: boolean;
  fetchedAt: number;
}

/** Schema reads are a network hop and this primitive is meant to be called in
 * loops (validating a list of rows), so contracts memoize briefly. The TTL is
 * short because a definition edit bumps `version` and must be picked up without
 * a reload. Call `invalidateKindContractCache` after any local write. */
const CONTRACT_TTL_MS = 30_000;
const contractCache = new Map<string, CachedContract>();

export function invalidateKindContractCache(kind?: string): void {
  if (kind) contractCache.delete(kind);
  else contractCache.clear();
}

function degraded(
  kind: string,
  degradedReason: KindValidationDegradedReason,
  message: string,
  dataOnly: boolean | null = null,
): KindValidationResult {
  return {
    kind,
    checked: false,
    ok: false,
    errors: [message],
    degradedReason,
    dataOnly,
  };
}

/** The exact prefix `validateStructuralLeg` uses when ajv cannot compile the
 * schema. Pinned here so a reword upstream surfaces as a test failure rather
 * than silently reclassifying a registry defect as invalid user data. */
const SCHEMA_COMPILE_FAILURE_PREFIX = "emitted_json_schema failed to compile:";

/**
 * Validate `value` against the live contract for `kind`.
 *
 * Never throws for an unknown kind or an unreachable catalog — those are
 * degraded verdicts, because a thrown error at a validation boundary tends to
 * get caught and swallowed into a silent pass. Programming errors (a malformed
 * argument) still throw.
 */
export async function validateAgainstKind(
  value: unknown,
  kind: string,
): Promise<KindValidationResult> {
  if (!kind || typeof kind !== "string") {
    throw new TypeError(
      `validateAgainstKind: "kind" must be a non-empty slug (received ${typeof kind})`,
    );
  }

  let contract = contractCache.get(kind);
  if (!contract || Date.now() - contract.fetchedAt > CONTRACT_TTL_MS) {
    try {
      const fetched = await getKindInputContractBySlug(kind);
      if (!fetched) {
        return degraded(
          kind,
          "kind_not_registered",
          `kind "${kind}" is not registered in content_ir.kind_definition`,
        );
      }
      contract = {
        emittedJsonSchema: fetched.emittedJsonSchema,
        dataOnly: fetched.dataOnly,
        fetchedAt: Date.now(),
      };
      contractCache.set(kind, contract);
    } catch (err) {
      return degraded(
        kind,
        "catalog_unreachable",
        `could not read the contract for kind "${kind}": ${
          err instanceof Error ? err.message : String(err)
        }`,
      );
    }
  }

  if (
    contract.emittedJsonSchema === null ||
    contract.emittedJsonSchema === undefined
  ) {
    return degraded(
      kind,
      "schema_unavailable",
      `kind "${kind}" has no emitted_json_schema — nothing to validate against`,
      contract.dataOnly,
    );
  }

  const leg = validateStructuralLeg(value, contract.emittedJsonSchema);

  // `validateStructuralLeg` reports an uncompilable schema through the same
  // `ok:false` channel as invalid data. Separate them: a broken schema is a
  // registry defect the caller must not read as "your data is wrong".
  if (!leg.ok && leg.detail?.startsWith(SCHEMA_COMPILE_FAILURE_PREFIX)) {
    return degraded(
      kind,
      "schema_invalid",
      `kind "${kind}" has an uncompilable emitted_json_schema: ${leg.detail}`,
      contract.dataOnly,
    );
  }

  return {
    kind,
    checked: true,
    ok: leg.ok,
    errors: leg.ok ? [] : [leg.detail ?? "validation failed"],
    degradedReason: null,
    dataOnly: contract.dataOnly,
  };
}
