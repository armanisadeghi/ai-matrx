/**
 * Registers the structured print layouts in `@ai-matrx/print`'s one
 * block-printer registry (imported for its side effect by artifact-printers):
 *
 *  - each structured artifact type's layout under the type AND its `__kind` slugs;
 *  - the generic kind-value layout under `kind_value` and under every registered
 *    kind slug that no other printer claims (a kind printer registered earlier
 *    or later — quiz, flashcards, the picture kinds — always wins);
 *  - the kind dispatcher under `json`: a ```json fence whose body is a kind
 *    value prints through that kind's printer; any other JSON keeps its source.
 */

import { getBlockPrinter, registerBlockPrinter } from "@ai-matrx/print/core";
import { GENERATED_KIND_SLUGS } from "@/features/content-ir/kinds/generated/kinds.generated";
import { STRUCTURED_PRINTERS } from "./structuredTypePrinters";
import { kindDispatchPrinter, kindValuePrinter } from "./kindValuePrinter";

for (const { type, kinds, printer } of STRUCTURED_PRINTERS) {
  registerBlockPrinter([type, ...kinds], printer);
}

registerBlockPrinter(["kind_value"], kindDispatchPrinter);
registerBlockPrinter(["json"], kindDispatchPrinter);

/** Kind slugs the generic layout answers for (none another printer claims at load). */
export const GENERIC_KIND_PRINT_KEYS: readonly string[] = GENERATED_KIND_SLUGS.filter((slug) => !getBlockPrinter(slug));
registerBlockPrinter(GENERIC_KIND_PRINT_KEYS, kindValuePrinter);
