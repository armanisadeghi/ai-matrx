/**
 * The app's ONE `SchemaSourcePort` and the ONE kind validator built on it
 * (Matrx Alchemy ALC-13).
 *
 * `@ai-matrx/content-ir` owns the validator (`createKindValidator`: the
 * verdict, the four degraded reasons, the short-lived schema cache). This app
 * owns only where schemas come from: `content_ir.kind_definition`, read
 * through Supabase by `getKindInputContractBySlug`.
 *
 * Every caller that asks "is this value a valid X?" (the surface write door,
 * the Alchemy `kinds` host port) uses `kindValidator`; every caller that SHOWS
 * a kind's schema before a check (`build-tool-injection`) uses
 * `kindValidator.cachedSchema`, so show-then-check costs one read.
 */

import {
  createKindValidator,
  type Json as ContentIrJson,
  type SchemaSourcePort,
} from "@ai-matrx/content-ir/registry";
import { getKindInputContractBySlug } from "./schema-source-kind-tables";

export const kindCatalogSchemaSource: SchemaSourcePort = {
  /**
   * The catalog read does not take an abort signal; it is one short row read.
   * A failed read THROWS (with the Supabase message), and the validator reads
   * a throw as `catalog_unreachable` carrying that message.
   */
  async kindSchema(kind) {
    const contract = await getKindInputContractBySlug(kind);
    if (!contract) return { unavailable: "kind_not_registered" };
    if (contract.emittedJsonSchema == null) {
      return { unavailable: "schema_unavailable" };
    }
    return {
      // A stored `jsonb` never holds `undefined`; the generated Supabase `Json`
      // type only allows it in object values, which content-ir's `Json` omits.
      schema: contract.emittedJsonSchema as ContentIrJson,
      version: String(contract.version),
    };
  },
};

/** The app's one kind validator. `invalidate()` after any local kind write. */
export const kindValidator = createKindValidator(kindCatalogSchemaSource);
