import { humanizeKind } from "@/features/content-ir/kinds/kind-markdown-utils";
import { formatKindSchemaVariable } from "@/features/content-ir/studio/kind-agent-intents";
import type { KindComponentProjection } from "@/features/content-ir/registry/schema-source-kind-components";
import { GENERIC_FALLBACK_COMPONENT_KEY } from "@/features/content-ir/registry/schema-source-kind-components";
import { isKnownKindLoadingSlug } from "@/features/content-ir/react/loading/kind-loading-slugs";
import type { Json } from "@/types/database.types";
import { isJsonObject } from "@/types/json";

export interface ShapeSampleAnalysis {
  isValidJson: boolean;
  rootKind: string | null;
  suggestedName: string;
  errorMessage: string | null;
}

export interface ShapeDefinitionSnapshot {
  id: string;
  kind: string;
  label: string;
  isActive: boolean;
  version: number;
  visibility: string;
  emittedJsonSchema: Json | null;
  metadata: Json;
  authoringOwner: string;
  isContractArtifact: boolean;
}

export type ShapeComponentState =
  "custom" | "bundled" | "generic" | "inactive" | "missing";

export type ShapeLoadingState = "custom" | "generic" | "unknown";
export type ShapeSchemaState = "stored" | "compiled" | "missing";

export type ShapeCreatorFocus =
  | "create_shape"
  | "register_shape"
  | "repair_schema"
  | "activate_shape"
  | "build_component"
  | "add_loading_component"
  | "review_shape";

export interface ShapeReadiness {
  rootKind: string | null;
  definition: ShapeDefinitionSnapshot | null;
  schema: {
    state: ShapeSchemaState;
  };
  component: {
    state: ShapeComponentState;
    componentKey: string | null;
    source: string | null;
    row: KindComponentProjection | null;
  };
  loading: {
    state: ShapeLoadingState;
    slug: string | null;
  };
  focus: ShapeCreatorFocus;
}

export interface BuildShapeReadinessInput {
  rootKind: string | null;
  definition?: ShapeDefinitionSnapshot | null;
  components?: readonly KindComponentProjection[];
  compiledComponentKey?: string | null;
  compiledLoadingSlug?: string | null;
  compiledHasSchema?: boolean;
}

function realOutputRows(
  components: readonly KindComponentProjection[],
): KindComponentProjection[] {
  return components.filter(
    (row) =>
      row.platform === "web" &&
      row.role === "output" &&
      row.componentKey !== GENERIC_FALLBACK_COMPONENT_KEY &&
      (row.source !== "db" || Boolean(row.componentSource?.trim())),
  );
}

/**
 * Turn the live registry facts into the small, user-facing preflight model.
 * A generic fallback is deliberately NOT counted as component coverage.
 */
export function buildShapeReadiness(
  input: BuildShapeReadinessInput,
): ShapeReadiness {
  const definition = input.definition ?? null;
  const components = input.components ?? [];
  const realRows = realOutputRows(components);
  const activeCustom = realRows.find((row) => row.isActive) ?? null;
  const inactiveCustom = realRows.find((row) => !row.isActive) ?? null;
  const activeGeneric =
    components.find(
      (row) =>
        row.platform === "web" &&
        row.role === "output" &&
        row.isActive &&
        row.componentKey === GENERIC_FALLBACK_COMPONENT_KEY,
    ) ?? null;

  const component: ShapeReadiness["component"] = activeCustom
    ? {
        state: "custom",
        componentKey: activeCustom.componentKey,
        source: activeCustom.source,
        row: activeCustom,
      }
    : input.compiledComponentKey
      ? {
          state: "bundled",
          componentKey: input.compiledComponentKey,
          source: "bundled",
          row: null,
        }
      : inactiveCustom
        ? {
            state: "inactive",
            componentKey: inactiveCustom.componentKey,
            source: inactiveCustom.source,
            row: inactiveCustom,
          }
        : activeGeneric
          ? {
              state: "generic",
              componentKey: activeGeneric.componentKey,
              source: activeGeneric.source,
              row: activeGeneric,
            }
          : {
              state: "missing",
              componentKey: null,
              source: null,
              row: null,
            };

  const metadataLoading = readMetadataString(
    definition?.metadata ?? null,
    "loading_component",
  );
  const loadingSlug = metadataLoading ?? input.compiledLoadingSlug ?? null;
  const loading: ShapeReadiness["loading"] = loadingSlug
    ? {
        state: isKnownKindLoadingSlug(loadingSlug) ? "custom" : "unknown",
        slug: loadingSlug,
      }
    : { state: "generic", slug: null };
  const schema: ShapeReadiness["schema"] = definition?.emittedJsonSchema
    ? { state: "stored" }
    : input.compiledHasSchema
      ? { state: "compiled" }
      : { state: "missing" };

  let focus: ShapeCreatorFocus;
  if (!input.rootKind) focus = "create_shape";
  else if (!definition) focus = "register_shape";
  else if (schema.state === "missing") focus = "repair_schema";
  else if (!definition.isActive) focus = "activate_shape";
  else if (
    component.state === "missing" ||
    component.state === "generic" ||
    component.state === "inactive"
  ) {
    focus = "build_component";
  } else if (loading.state !== "custom") focus = "add_loading_component";
  else focus = "review_shape";

  return {
    rootKind: input.rootKind,
    definition,
    schema,
    component,
    loading,
    focus,
  };
}

function readMetadataString(metadata: Json | null, key: string): string | null {
  if (!isJsonObject(metadata)) return null;
  const value = metadata[key];
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

/** Inspect a JSON sample without claiming a kind from nested data. */
export function analyzeShapeSample(content: string): ShapeSampleAnalysis {
  let value: unknown;

  try {
    value = JSON.parse(content);
  } catch (error: unknown) {
    return {
      isValidJson: false,
      rootKind: null,
      suggestedName: "",
      errorMessage:
        error instanceof Error
          ? error.message
          : "The JSON could not be parsed.",
    };
  }

  const kindValue = isJsonObject(value) ? value.__kind : undefined;
  const rootKind =
    typeof kindValue === "string" && kindValue.trim() ? kindValue.trim() : null;

  return {
    isValidJson: true,
    rootKind,
    suggestedName: rootKind ? humanizeKind(rootKind) : "",
    errorMessage: null,
  };
}

/**
 * Compatibility seed for callers that have not yet adopted the live readiness
 * preflight. Keep the existing behavior until those surfaces can supply the
 * complete registry-backed ConvertToShapeSeed.
 */
export function buildConvertToShapeIntent(
  requestedName: string,
  rootKind: string | null,
): string {
  const name = requestedName.trim();

  if (rootKind) {
    return `Review the attached JSON sample and its existing __kind "${rootKind}". I want this Shape called "${name}". First inspect whether that Shape already exists and reuse or improve it instead of creating a duplicate. Then make sure its schema, sample, loading state, and output component render this data cleanly through the streaming Markdown system.`;
  }

  return `Create a reusable Shape called "${name}" from the attached JSON sample. Infer the correct __kind slug and schema from the real payload, then create or improve the output component so this data renders clearly through the streaming Markdown system.`;
}

const FOCUS_BRIEF: Record<ShapeCreatorFocus, string> = {
  create_shape:
    "Create the complete Shape: infer its canonical __kind, register its schema and example, then add its output and loading components.",
  register_shape:
    "The sample already declares a __kind, but no live kind_definition registration exists. Register the complete Shape without minting a competing slug, then add its schema, example, output component, and loading component.",
  repair_schema:
    "Keep the existing Shape identity, but repair or materialize its emitted JSON schema from the real sample before changing render assets. Do not mint a duplicate Shape.",
  activate_shape:
    "The Shape registration exists but is inactive. Inspect its activation blockers and existing assets, repair only what is needed, and activate it through the canonical gate.",
  build_component:
    "Keep the existing Shape registration and schema. Create, repair, or activate its purpose-built web output component; the universal generic viewer is fallback behavior, not component coverage.",
  add_loading_component:
    "Keep the existing Shape registration and purpose-built output component. Add or repair its loading-library declaration so streaming starts with an intentional loading view.",
  review_shape:
    "The Shape is registered, active, and has purpose-built output and loading components. Inspect the user's request and improve only the assets that actually need changing; do not create a duplicate Shape.",
};

function formatContext(label: string, value: unknown): string {
  return `${label}:\n\n\`\`\`json\n${JSON.stringify(value, null, 2)}\n\`\`\``;
}

export interface ConvertToShapeSeed {
  draftText: string;
  variables: Record<string, string>;
}

/**
 * Fill every declared Shape Creator variable that has corresponding live data.
 * The composer carries only the name the human supplied; machine facts ride
 * their own structured-variable channels.
 */
export function buildConvertToShapeSeed(input: {
  requestedName: string;
  sampleContent: string;
  readiness: ShapeReadiness;
}): ConvertToShapeSeed {
  const name = input.requestedName.trim();
  const { definition, component, loading, rootKind, focus } = input.readiness;
  const kindContext = definition
    ? formatContext("Existing Shape registration", {
        id: definition.id,
        kind: definition.kind,
        label: definition.label,
        is_active: definition.isActive,
        version: definition.version,
        visibility: definition.visibility,
        authoring_owner: definition.authoringOwner,
        is_contract_artifact: definition.isContractArtifact,
        metadata: definition.metadata,
        readiness: {
          creator_focus: focus,
          schema: input.readiness.schema.state,
          output_component: component.state,
          loading_component: loading.state,
          loading_slug: loading.slug,
        },
      })
    : "";
  const componentContext = component.componentKey
    ? formatContext("Existing web output component", {
        state: component.state,
        component_key: component.componentKey,
        source: component.source,
        is_active: component.row?.isActive ?? true,
        config: component.row?.config ?? {},
        props_transform: component.row?.propsTransform ?? null,
        pinned_kind_version: component.row?.pinnedKindVersion ?? null,
        updated_at: component.row?.updatedAt ?? null,
      })
    : "";
  const kindClause = rootKind
    ? ` The sample's root discriminator is \`${rootKind}\`.`
    : " The sample has no root __kind, so infer one from the payload and preserve it in all stored and emitted data.";

  return {
    draftText: `I want to call this Shape "${name}".`,
    variables: {
      user_data_sample: input.sampleContent,
      kind_schema: formatKindSchemaVariable(definition?.emittedJsonSchema),
      task_brief: `${FOCUS_BRIEF[focus]}${kindClause} Use the user-requested display name "${name}".`,
      existing_kind_context: kindContext,
      existing_component_context: componentContext,
      existing_component_source: component.row?.componentSource?.trim() ?? "",
    },
  };
}
