/**
 * A model's CLASSES — the serving endpoints it is offered through ("Matrx Fast",
 * "Matrx Lightning", ...). Two classes of one model are different products, so
 * wherever a surface names the model an agent or run USES, a model with several
 * classes is named with its class: "Qwen3.8 27B · Matrx Lightning".
 *
 * Same grouping as the picker (`collapseTiersByClass` in useModelCatalog): one
 * class per endpoint (or brand when the endpoint is unknown), preferred
 * (lowest-priority) first. Every offering — including ones collapsed into a
 * class — maps to its class, so any stored `offering_id` resolves.
 */

export type ModelOfferingRow = {
  model_id: string | null;
  offering_id: string | null;
  served_via: string | null;
  served_via_endpoint_id: string | null;
  priority: number | null;
};

export type ModelClassEntry = {
  /** Public Matrx brand of the serving endpoint — never a vendor name. */
  servedVia: string;
  endpointId: string | null;
  /** The class's preferred offering (what the picker pins). */
  offeringId: string;
};

export type ModelClassIndex = {
  /** modelId → its classes, preferred first. */
  classesByModelId: Record<string, ModelClassEntry[]>;
  /** offeringId → { modelId, index into classesByModelId[modelId] }. */
  classOfOffering: Record<string, { modelId: string; classIndex: number }>;
};

export function buildModelClassIndex(rows: ModelOfferingRow[]): ModelClassIndex {
  const classesByModelId: Record<string, ModelClassEntry[]> = {};
  const classOfOffering: ModelClassIndex["classOfOffering"] = {};
  const sorted = [...rows].sort(
    (a, b) => (a.priority ?? 100) - (b.priority ?? 100),
  );
  for (const r of sorted) {
    if (!r.model_id || !r.offering_id) continue;
    const list = (classesByModelId[r.model_id] ??= []);
    let classIndex = list.findIndex((c) =>
      c.endpointId && r.served_via_endpoint_id
        ? c.endpointId === r.served_via_endpoint_id
        : c.servedVia === (r.served_via ?? ""),
    );
    if (classIndex === -1) {
      list.push({
        servedVia: r.served_via ?? "",
        endpointId: r.served_via_endpoint_id,
        offeringId: r.offering_id,
      });
      classIndex = list.length - 1;
    }
    classOfOffering[r.offering_id] = { modelId: r.model_id, classIndex };
  }
  return { classesByModelId, classOfOffering };
}

/**
 * The class name to show beside a model, or undefined when the model has a
 * single class (nothing to tell apart). A pin names its class; no pin (or a
 * pin of another model) means the server runs the preferred class.
 */
export function modelClassName(
  index: ModelClassIndex | null | undefined,
  modelId: string | null | undefined,
  offeringId: string | null | undefined,
): string | undefined {
  if (!index || !modelId) return undefined;
  const classes = index.classesByModelId[modelId];
  if (!classes || classes.length < 2) return undefined;
  const pinned = offeringId ? index.classOfOffering[offeringId] : undefined;
  const entry =
    pinned && pinned.modelId === modelId
      ? classes[pinned.classIndex]
      : classes[0];
  return entry?.servedVia || undefined;
}

/** "Model · Class" when the model has several classes, else the model name. */
export function withModelClass(
  modelLabel: string,
  className: string | undefined,
): string {
  return className ? `${modelLabel} · ${className}` : modelLabel;
}

/**
 * A list row's class pin (`offering_id` on the agent list RPCs): a uuid, null
 * (no pin — the preferred class runs) or undefined when the row does not carry
 * the column (unknown — name the model alone).
 */
export function offeringPinOfRow(row: object): string | null | undefined {
  if (!("offering_id" in row)) return undefined;
  const value = (row as { offering_id?: unknown }).offering_id;
  return typeof value === "string" && value !== "" ? value : null;
}
