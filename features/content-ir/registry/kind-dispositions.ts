/**
 * What a kind's output IS — `content_ir.kind_definition.metadata.disposition`.
 *
 * KINDS-GLUE wave 1b. The closed set is owned by aidream
 * `matrx_graph.content_ir.sdk.KIND_DISPOSITIONS` (the kind store, the activation gate's
 * disposition leg and the registry backstop trigger `zzzz_kind_says_what_its_output_is` all
 * read the same five). This is the browser's copy of that ONE list, pinned to the Python tuple
 * by `__tests__/kind-dispositions.test.ts` (it reads `../aidream/.../sdk.py`), so it can never
 * drift silently. Every browser path that creates a kind runs `kindDispositionRefusal` before
 * the first write.
 *
 *   record   — structured output with keys a person filters by; stored as a record.
 *   envelope — a wrapper whose keys differ every call; keeps the run store.
 *   receipt  — says a write already happened and names what it wrote.
 *   proposal — an offer against rows that exist; lives in review-and-apply.
 *   prose    — one text body; stays where prose lives.
 */

export const KIND_DISPOSITIONS = [
  "record",
  "envelope",
  "receipt",
  "proposal",
  "prose",
] as const;

export type KindDisposition = (typeof KIND_DISPOSITIONS)[number];

export function isKindDisposition(value: unknown): value is KindDisposition {
  return (
    typeof value === "string" &&
    (KIND_DISPOSITIONS as readonly string[]).includes(value)
  );
}

/** The plain sentence refusing `disposition` for `slug`, or null when it is valid. */
export function kindDispositionRefusal(
  slug: string,
  disposition: unknown,
): string | null {
  if (isKindDisposition(disposition)) return null;
  if (disposition === null || disposition === undefined || disposition === "") {
    return `The kind "${slug}" does not say what its output is. Choose one of ${KIND_DISPOSITIONS.join(", ")} — without it every emission of this kind is refused storage.`;
  }
  return `The kind "${slug}" declares "${String(disposition)}", which is not one of ${KIND_DISPOSITIONS.join(", ")}.`;
}

/**
 * The person-facing choice for each disposition (labels in a slot: label ≤ 24, description
 * ≤ 60). Ordered most-common first. Words describe, they never coin a product noun.
 */
export const KIND_DISPOSITION_CHOICES: ReadonlyArray<{
  id: KindDisposition;
  label: string;
  description: string;
}> = [
  { id: "record", label: "A record", description: "Fields people filter, sort and edit." },
  { id: "prose", label: "A piece of writing", description: "One body of text, kept as written." },
  { id: "proposal", label: "A suggestion", description: "Waits for someone to accept it." },
  { id: "receipt", label: "A confirmation", description: "Says what was saved or sent." },
  { id: "envelope", label: "A run result", description: "Different fields on every run." },
];
