/**
 * Pure runtime-scope builders for the Kind Registry admin surface.
 *
 * The header launcher calls these at Run time. Keep the payload derived from
 * state the page already owns: an agent should not spend tool calls fetching
 * the same kind/schema/example/component data solely to orient itself.
 */

import type { SurfaceScopePayload } from "@/features/surfaces/types";
import { createAdminKindRegistryScope } from "@/features/surfaces/manifests/admin-kind-registry.manifest";
import type {
  KindDetailData,
  KindExampleListItem,
  KindStatusBoardModel,
} from "@/features/content-ir/admin/kind-detail-types";
import type { KindComponentCodeRecord } from "@/features/content-ir/studio/kind-component-code-service";
import {
  composeKindAgentIntent,
  formatKindSchemaVariable,
} from "@/features/content-ir/studio/kind-agent-intents";

export type KindRegistryCatalogTab = "catalog" | "board" | "export";
export type KindRegistryDetailTab =
  | "preview"
  | "code"
  | "examples"
  | "assets"
  | "try-input"
  | "gate"
  | "schema"
  | "inputs";

export interface KindComponentEditorScopeState {
  rows: KindComponentCodeRecord[];
  selected: KindComponentCodeRecord;
  draft: string;
  saving: boolean;
}

function json(value: unknown): string {
  return JSON.stringify(value, null, 2);
}

function canonicalExample(
  examples: KindExampleListItem[] | undefined,
): KindExampleListItem | undefined {
  if (!examples || examples.length === 0) return undefined;
  return examples.find((row) => row.isCanonical) ?? examples[0];
}

export function buildAdminKindCatalogScope(args: {
  board: KindStatusBoardModel | null;
  tab: KindRegistryCatalogTab;
}): SurfaceScopePayload {
  const { board, tab } = args;
  return createAdminKindRegistryScope({
    kind_registry_section: "catalog",
    catalog_tab: tab,
    kind_catalog_rows: board?.rows,
    kind_catalog_totals: board
      ? {
          ...board.totals,
          active: board.rows.filter((row) => row.isActive).length,
          red: board.redFindings.length,
          yellow: board.yellowFindingCount,
          drifted: board.driftedRowCount,
        }
      : undefined,
  });
}

export function buildAdminKindDetailScope(args: {
  detail: KindDetailData;
  tab: KindRegistryDetailTab;
  examples?: KindExampleListItem[];
  componentEditor?: KindComponentEditorScopeState;
}): SurfaceScopePayload {
  const { detail, tab, examples, componentEditor } = args;
  const sample = canonicalExample(examples);
  const intent = composeKindAgentIntent({
    kind: detail.kind,
    label: detail.label,
    part: tab === "code" ? "component" : "edit",
    emittedJsonSchema: detail.emittedJsonSchema,
  });
  const existingContext = {
    definition: {
      id: detail.id,
      kind: detail.kind,
      label: detail.label,
      isActive: detail.isActive,
      version: detail.version,
      visibility: detail.visibility,
      updatedAt: detail.updatedAt,
    },
    doctorRow: detail.doctorRow,
    components: detail.components,
    surfaces: detail.surfaces,
    skills: detail.skills,
    contentBlocks: detail.contentBlocks,
    warnings: detail.warnings,
  };

  return createAdminKindRegistryScope({
    kind_registry_section: "detail",
    current_kind: detail.kind,
    kind_detail_tab: tab,
    kind_detail_summary: existingContext.definition,
    kind_detail_schema: {
      fieldData: detail.fieldData,
      emittedJsonSchema: detail.emittedJsonSchema,
    },
    kind_detail_doctor_row: detail.doctorRow as unknown as Record<
      string,
      unknown
    >,
    kind_detail_components: detail.components,
    kind_detail_surfaces: detail.surfaces,
    kind_detail_skills: detail.skills,
    kind_detail_content_blocks: detail.contentBlocks,
    kind_detail_examples: examples,
    kind_detail_canonical_example_data:
      sample?.data &&
      typeof sample.data === "object" &&
      !Array.isArray(sample.data)
        ? (sample.data as Record<string, unknown>)
        : undefined,
    kind_detail_warnings: detail.warnings,
    kind_creator_task_brief: intent.variables.task_brief,
    kind_creator_schema: formatKindSchemaVariable(detail.emittedJsonSchema),
    kind_creator_data_sample: sample ? json(sample.data) : "",
    kind_creator_existing_context: json(existingContext),
    ...(componentEditor
      ? {
          kind_component_editor_state: {
            selected: {
              id: componentEditor.selected.id,
              kindDefinitionId: componentEditor.selected.kindDefinitionId,
              platform: componentEditor.selected.platform,
              role: componentEditor.selected.role,
              componentKey: componentEditor.selected.componentKey,
              source: componentEditor.selected.source,
              config: componentEditor.selected.config,
              isActive: componentEditor.selected.isActive,
              isDefault: componentEditor.selected.isDefault,
              semver: componentEditor.selected.semver,
              version: componentEditor.selected.version,
              updatedAt: componentEditor.selected.updatedAt,
            },
            rowCount: componentEditor.rows.length,
            editable: componentEditor.selected.source === "db",
            dirty:
              componentEditor.draft !==
              (componentEditor.selected.componentSource ?? ""),
            saving: componentEditor.saving,
          },
          kind_component_saved_source:
            componentEditor.selected.componentSource ?? "",
          kind_component_draft_source: componentEditor.draft,
        }
      : {}),
  });
}
