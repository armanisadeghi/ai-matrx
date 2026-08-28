/**
 * THE DECLARED RESULT CONTRACT — what a run PROMISES to produce, read before
 * any run exists.
 *
 * SPEC-workflow-ui-contract §2.4: `GET /workflows/{id}/result-schema`, the twin
 * of `/run-form`. The run form says what the workflow will ask of you; this
 * says what it owes you back. Together they let a run page be fully drawn —
 * every input control, every deliverable silhouette — before the Start button
 * is pressed, which is the whole point of the zero-page-shift law.
 *
 * Until this endpoint, a result surface could only reserve slots from a LIVE
 * run's step list, so the promise appeared at the same moment as the work.
 *
 * Parsing is defensive on purpose: this is a served contract, and a surface
 * that throws on an unexpected field turns a cosmetic drift into a dead page.
 * Unknown `presentation` values narrow to "panel" (the safe, non-displacing
 * default) exactly as the emission fold does.
 */

/** One declared deliverable — a promise with a shape. */
export interface DeclaredDeliverable {
  nodeId: string;
  title: string;
  /**
   * The kind this node promises. NULL is common and honest: a node with a
   * dynamic output schema (every `output.to_frontend`) has no compile-time
   * kind to declare. See the null-kind widening in `emission-routing.ts`.
   */
  outputKind: string | null;
  jsonSchema: Record<string, unknown>;
  /** Where this deliverable belongs: the stream, or the showcase slot. */
  presentation: "panel" | "showcase";
  isPrimary: boolean;
}

export interface DeclaredResultSchema {
  definitionId: string;
  version: number;
  inputKind: string | null;
  outputKind: string | null;
  /** True when `outputKind` is the AUTHOR'S declaration, not a derivation. */
  outputKindDeclared: boolean;
  /**
   * Set when the stored declaration DISAGREES with the graph. The server falls
   * back to derivation and says so rather than serving a lie; a surface that
   * cares can show it. Never suppress it silently.
   */
  declarationError: string | null;
  deliverables: DeclaredDeliverable[];
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function asRecord(value: unknown): Record<string, unknown> {
  return isRecord(value) ? value : {};
}

function asString(value: unknown): string | null {
  return typeof value === "string" && value.length > 0 ? value : null;
}

function asPresentation(value: unknown): "panel" | "showcase" {
  return value === "showcase" ? "showcase" : "panel";
}

/** Wire → the client shape. Total: a malformed body yields an empty promise. */
export function parseResultSchema(raw: unknown): DeclaredResultSchema {
  const body = asRecord(raw);
  const rows = Array.isArray(body.deliverables) ? body.deliverables : [];
  const deliverables: DeclaredDeliverable[] = [];
  for (const row of rows) {
    const item = asRecord(row);
    const nodeId = asString(item.node_id);
    if (!nodeId) continue; // a deliverable with no node is not addressable
    deliverables.push({
      nodeId,
      title: asString(item.title) ?? nodeId,
      outputKind: asString(item.output_kind),
      jsonSchema: asRecord(item.json_schema),
      presentation: asPresentation(item.presentation),
      isPrimary: item.is_primary === true,
    });
  }
  return {
    definitionId: asString(body.definition_id) ?? "",
    version: typeof body.version === "number" ? body.version : 0,
    inputKind: asString(body.input_kind),
    outputKind: asString(body.output_kind),
    outputKindDeclared: body.output_kind_declared === true,
    declarationError: asString(body.declaration_error),
    deliverables,
  };
}

/** The deliverables that belong in the page-centered showcase slot. */
export function showcaseDeliverables(
  schema: DeclaredResultSchema | null,
): DeclaredDeliverable[] {
  return (schema?.deliverables ?? []).filter(
    (d) => d.presentation === "showcase",
  );
}

/** The deliverables that belong in the stream, arrival order irrelevant. */
export function panelDeliverables(
  schema: DeclaredResultSchema | null,
): DeclaredDeliverable[] {
  return (schema?.deliverables ?? []).filter((d) => d.presentation === "panel");
}
