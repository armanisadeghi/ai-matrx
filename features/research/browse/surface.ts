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
import {
  collectionWriteHandlers,
  readCollectionList,
  refuseRepeats,
} from "@/features/surfaces/runtime/collection-write-targets";
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

type List = EntityListSurfaceController<ResearchTopicListRow>;

const AUTONOMY = ["auto", "semi", "manual"] as const;
type Autonomy = (typeof AUTONOMY)[number];

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

// ── Write half (pure parsers; each throws a sentence the agent can act on) ───

interface CreatePlan {
  name: string;
  description: string | null;
  autonomy_level: Autonomy;
}

interface UpdatePlan {
  id: string;
  previousName: string;
  name?: string;
  description?: string | null;
  autonomy_level?: Autonomy;
  changed: string[];
}

function asObject(target: string, item: unknown, i: number): Record<string, unknown> {
  if (item === null || typeof item !== "object" || Array.isArray(item))
    throw new Error(`${target}: item ${i + 1} must be an object.`);
  return item as Record<string, unknown>;
}

function optionalString(target: string, obj: Record<string, unknown>, key: string, i: number) {
  const v = obj[key];
  if (v === undefined) return undefined;
  if (v !== null && typeof v !== "string")
    throw new Error(`${target}: item ${i + 1} "${key}" must be a string.`);
  return v;
}

function autonomyOf(target: string, obj: Record<string, unknown>, i: number): Autonomy | undefined {
  const v = obj.autonomy_level;
  if (v === undefined) return undefined;
  if (typeof v !== "string" || !(AUTONOMY as readonly string[]).includes(v))
    throw new Error(
      `${target}: item ${i + 1} autonomy_level must be "auto", "semi" or "manual"; received ${JSON.stringify(v)}.`,
    );
  return v as Autonomy;
}

export function parseCreateTopics(value: unknown): CreatePlan[] {
  const target = "create_topics";
  const plans = readCollectionList(target, "topics", value, 10).map((item, i) => {
    const obj = asObject(target, item, i);
    const name = optionalString(target, obj, "name", i)?.trim();
    if (!name) throw new Error(`${target}: item ${i + 1} needs a non-empty name.`);
    const description = optionalString(target, obj, "description", i)?.trim() || null;
    return { name, description, autonomy_level: autonomyOf(target, obj, i) ?? "semi" };
  });
  refuseRepeats(target, plans.map((p) => p.name), "name");
  return plans;
}

function idOf(target: string, item: unknown, i: number): string {
  if (typeof item === "string" && item.trim()) return item.trim();
  const obj = asObject(target, item, i);
  if (typeof obj.id !== "string" || !obj.id.trim())
    throw new Error(`${target}: item ${i + 1} needs an id (from topics).`);
  return obj.id.trim();
}

function known(target: string, rows: ResearchTopicListRow[], id: string): ResearchTopicListRow {
  const row = rows.find((r) => r.id === id);
  if (!row)
    throw new Error(
      `${target}: no topic with id "${id}" is on this page. Use an id from topics / topic_list.`,
    );
  return row;
}

export function parseUpdateTopics(value: unknown, rows: ResearchTopicListRow[]): UpdatePlan[] {
  const target = "update_topics";
  const plans = readCollectionList(target, "topics", value, 25).map((item, i) => {
    const obj = asObject(target, item, i);
    const id = idOf(target, obj, i);
    const row = known(target, rows, id);
    const plan: UpdatePlan = { id, previousName: row.name, changed: [] };
    const name = optionalString(target, obj, "name", i);
    if (name !== undefined) {
      if (!name?.trim()) throw new Error(`${target}: item ${i + 1} name may not be empty.`);
      plan.name = name.trim();
      plan.changed.push("name");
    }
    const description = optionalString(target, obj, "description", i);
    if (description !== undefined) {
      plan.description = description?.trim() || null;
      plan.changed.push("description");
    }
    const autonomy = autonomyOf(target, obj, i);
    if (autonomy !== undefined) {
      plan.autonomy_level = autonomy;
      plan.changed.push("autonomy_level");
    }
    if (plan.changed.length === 0)
      throw new Error(
        `${target}: item ${i + 1} changes nothing — send name, description or autonomy_level.`,
      );
    return plan;
  });
  refuseRepeats(target, plans.map((p) => p.id), "id");
  return plans;
}

export function parseDeleteTopics(value: unknown, rows: ResearchTopicListRow[]): ResearchTopicListRow[] {
  const target = "delete_topics";
  const ids = readCollectionList(target, "topics", value, 25).map((item, i) => idOf(target, item, i));
  refuseRepeats(target, ids, "id");
  return ids.map((id) => known(target, rows, id));
}

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
