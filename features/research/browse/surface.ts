// features/research/browse/surface.ts
//
// The `matrx-user/research-topics` runtime for the topic list: the ONE pure
// state → scope mapper (reads the list controller the shell already holds;
// never fetches) and the create / update / delete handlers, built with the
// shared collection helper so they save through the page's own paths.

import type {
  EntityListSurface,
  EntityListSurfaceController,
} from "@/lib/entity-list/components/EntityListPage";
import { collectionWriteHandlers } from "@/features/surfaces/runtime/collection-write-targets";
import { refuseSurfaceWrite } from "@/features/surfaces/runtime/surface-writeback";
import { xmlElement, xmlList, xmlText } from "@/features/surfaces/runtime/context-bundle";
import {
  RESEARCH_TOPICS_SURFACE_NAME,
  createResearchTopicsScope,
} from "@/features/surfaces/manifests/research-topics.manifest";
import { ensureOrgId } from "@/lib/organizations/ensureOrgId";
import { isOrganizationSelectionCancelled } from "@/lib/organization/selection-cancelled";
import { createTopic, updateTopic, updateTopicMeta } from "../service";
import { softDeleteTopic } from "./actions";
import type { ResearchTopicListRow } from "./types";
import {
  parseCreateTopics,
  parseDeleteTopics,
  parseUpdateTopics,
  type CreatePlan,
  type UpdatePlan,
} from "./topicAgentWrites";

type List = EntityListSurfaceController<ResearchTopicListRow>;

// ── Read half ────────────────────────────────────────────────────────────────

function buildTopicListXml(list: List): string {
  const scope = list.query.scope;
  return (
    xmlList(
      "topics",
      list.rows,
      (row) =>
        xmlElement(
          "topic",
          {
            id: row.id,
            status: row.status,
            project: row.project_name,
            updated: row.updated_at?.slice(0, 10),
          },
          [row.name, xmlText("question", row.description, { max: 240 })],
        ),
      {
        maxRows: 25,
        attrs: {
          scope: scope.kind,
          search: list.query.search.trim() || null,
          matching: list.total,
        },
      },
    ) || `<topics scope="${scope.kind}" total="0"/>`
  );
}

export function createResearchTopicsSurfaceScope(list: List) {
  const scope = list.query.scope;
  const loaded = !list.isLoading;
  return createResearchTopicsScope({
    list_scope: scope.kind,
    search_query: list.query.search,
    active_filters: list.query.filters,
    sort: `${list.view.sort}-${list.view.direction}`,
    ...(scope.kind === "orgs" && scope.organizationId
      ? { list_scope_organization_id: scope.organizationId }
      : {}),
    ...(loaded
      ? {
          topic_list: buildTopicListXml(list),
          topics: list.rows.map((row) => ({
            id: row.id,
            name: row.name,
            description: row.description,
            status: row.status,
            autonomy_level: row.autonomy_level,
            project_id: row.project_id,
            project_name: row.project_name,
            organization_id: row.organization_id,
            created_at: row.created_at,
            updated_at: row.updated_at,
          })),
          total_count: list.total,
        }
      : {}),
    ...(!list.countsLoading && !list.countsError
      ? {
          scope_counts: {
            mine: list.counts.byKind.mine,
            orgs: list.counts.byKind.orgs,
          },
        }
      : {}),
  });
}

// ── Write half ───────────────────────────────────────────────────────────────

export function createResearchTopicsWriteHandlers(list: List) {
  const handlers = collectionWriteHandlers(
    {
      plural: "topics",
      singular: "topic",
      create: {
        parse: parseCreateTopics,
        run: async (plan: CreatePlan) => {
          const organizationId = await ensureOrgId(null);
          const { topic } = await createTopic(organizationId, {
            name: plan.name,
            description: plan.description,
            autonomy_level: plan.autonomy_level,
            template_id: null,
          });
          list.refresh();
          return { id: topic.id, name: topic.name };
        },
        nameOf: (plan: CreatePlan) => plan.name,
        refusalFor: (error: unknown) =>
          isOrganizationSelectionCancelled(error)
            ? "The person closed the organization picker, so no topics were created. Ask which organization the topics belong in."
            : undefined,
      },
      update: {
        parse: (value: unknown) => parseUpdateTopics(value, list.rows),
        run: async (plan: UpdatePlan) => {
          if (plan.name !== undefined || plan.description !== undefined)
            await updateTopicMeta(plan.id, {
              ...(plan.name !== undefined ? { name: plan.name } : {}),
              ...(plan.description !== undefined ? { description: plan.description } : {}),
            });
          if (plan.autonomy_level !== undefined)
            await updateTopic(plan.id, { autonomy_level: plan.autonomy_level });
          list.refresh();
          return { id: plan.id, name: plan.name ?? plan.previousName };
        },
        nameOf: (plan: UpdatePlan) => plan.previousName,
        changedOf: (plan: UpdatePlan) => plan.changed,
      },
      delete: {
        parse: (value: unknown) => parseDeleteTopics(value, list.rows),
        run: async (row: ResearchTopicListRow) => {
          await softDeleteTopic(row.id);
          list.removeRow(row.id);
          return { id: row.id, name: row.name };
        },
        nameOf: (row: ResearchTopicListRow) => row.name,
      },
    },
    refuseSurfaceWrite,
  );
  return handlers;
}

export const RESEARCH_TOPICS_SURFACE: EntityListSurface<ResearchTopicListRow> = {
  surfaceName: RESEARCH_TOPICS_SURFACE_NAME,
  getScope: createResearchTopicsSurfaceScope,
  getWriteHandlers: createResearchTopicsWriteHandlers,
};
