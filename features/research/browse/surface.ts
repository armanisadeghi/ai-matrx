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
import { makeScope } from "@/lib/list-scope/types";
import { refuseSurfaceWrite } from "@/features/surfaces/runtime/surface-writeback";
import {
  RESEARCH_TOPICS_SURFACE_NAME,
  createResearchTopicsScope,
} from "@/features/surfaces/manifests/research-topics.manifest";
import { ensureOrgId } from "@/lib/organizations/ensureOrgId";
import { isOrganizationSelectionCancelled } from "@/lib/organization/selection-cancelled";
import { createTopic, updateTopic, updateTopicMeta } from "../service";
import { archiveTopic, restoreTopic } from "./actions";
import type { ResearchTopicListRow } from "./types";
import { buildTopicListXml } from "./topicListBundle";
import {
  parseCreateTopics,
  parseDeleteTopics,
  parseUpdateTopics,
  parseListView,
  type CreatePlan,
  type UpdatePlan,
} from "./topicAgentWrites";

type List = EntityListSurfaceController<ResearchTopicListRow>;

// ── Read half ────────────────────────────────────────────────────────────────

export function createResearchTopicsSurfaceScope(list: List) {
  const scope = list.query.scope;
  // A failed read reports its status and nothing else: no rows, no counts that
  // would contradict the error the person is looking at.
  const failed = list.error != null;
  const loaded = !list.isLoading && !failed;
  return createResearchTopicsScope({
    list_scope: scope.kind,
    search_query: list.query.search,
    active_filters: list.query.filters,
    sort: `${list.view.sort}-${list.view.direction}`,
    ...(scope.kind === "orgs" && scope.organizationId
      ? { list_scope_organization_id: scope.organizationId }
      : {}),
    ...(failed ? { load_error: list.error?.message ?? "The topics could not be read." } : {}),
    list_archived: list.query.archived,
    ...(loaded
      ? {
          topic_list: buildTopicListXml({
            rows: list.rows,
            total: list.total,
            scope: scope.kind,
            search: list.query.search,
            archived: list.query.archived,
          }),
          topics: list.rows.map((row) => ({
            id: row.id,
            name: row.name,
            description: row.description,
            status: row.status,
            autonomy_level: row.autonomy_level,
            project_id: row.project_id,
            project_name: row.project_name,
            organization_id: row.organization_id,
            organization_name: row.organization_name,
            archived_at: row.archived_at,
            created_at: row.created_at,
            updated_at: row.updated_at,
          })),
          total_count: list.total,
        }
      : {}),
    ...(!failed && !list.countsLoading && !list.countsError
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
          if (plan.archived === true) await archiveTopic(plan.id);
          if (plan.archived === false) await restoreTopic(plan.id);
          list.refresh();
          return { id: plan.id, name: plan.name ?? plan.previousName };
        },
        nameOf: (plan: UpdatePlan) => plan.previousName,
        changedOf: (plan: UpdatePlan) => plan.changed,
      },
      delete: {
        parse: (value: unknown) => parseDeleteTopics(value, list.rows),
        run: async (row: ResearchTopicListRow) => {
          // A person's records are archived, never destroyed: delete_topics
          // ARCHIVES (restorable with update_topics archived:false).
          await archiveTopic(row.id);
          list.removeRow(row.id);
          return { id: row.id, name: row.name };
        },
        nameOf: (row: ResearchTopicListRow) => row.name,
      },
    },
    refuseSurfaceWrite,
  );
  return {
    ...handlers,
    // UI state only: which topics the list shows (no record changes).
    list_view: {
      validate: (value: unknown) => {
        parseListView(value);
      },
      apply: (value: unknown) => {
        const plan = parseListView(value);
        list.patchQuery({
          ...(plan.scope ? { scope: makeScope(plan.scope) } : {}),
          ...(plan.archived ? { archived: plan.archived } : {}),
          ...(plan.search !== undefined ? { search: plan.search } : {}),
        });
        return {
          summary: `The list now shows ${[
            plan.scope ? `scope ${plan.scope}` : "",
            plan.archived ? `${plan.archived} topics` : "",
            plan.search !== undefined ? `search "${plan.search}"` : "",
          ]
            .filter(Boolean)
            .join(", ")}. Read topic_list again once it has loaded.`,
        };
      },
    },
  };
}

export const RESEARCH_TOPICS_SURFACE: EntityListSurface<ResearchTopicListRow> = {
  surfaceName: RESEARCH_TOPICS_SURFACE_NAME,
  getScope: createResearchTopicsSurfaceScope,
  getWriteHandlers: createResearchTopicsWriteHandlers,
};
