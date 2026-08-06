/**
 * features/marketing/content-plan/setup/entity-attach.ts
 *
 * Applying an E-E-A-T entity pass to the plan: which pages carry which
 * author / reviewer / citation, decided across the WHOLE plan at once.
 *
 * The agent chooses only from the site's existing roster, by label. This
 * resolves those labels against the live `plan.entity` rows and writes the
 * canonical node→entity edges through the feature's OWN wrapper
 * (`attachNodeEntity`) — never a parallel association path.
 *
 * A label that does not resolve is REPORTED, never created: inventing an
 * author or a citation is the one thing an E-E-A-T pass must never do.
 */
import { extractErrorMessage } from "@/utils/errors";

import { attachNodeEntity } from "../data/associations";
import { listPlanEntities, listPlanNodes } from "../data/service";
import { PLAN_NODE_ENTITY_ROLES, type PlanNodeEntityRole } from "../types";
import type { EntityAttachment } from "./ai";

export interface EntityAttachResult {
  attached: number;
  /** Routes the agent named that are not in the plan. */
  unknownRoutes: string[];
  /** Entity labels the agent named that are not in the roster. */
  unknownEntities: string[];
  failures: string[];
}

function normalize(value: string): string {
  return value.trim().toLowerCase();
}

export function isPlanNodeEntityRole(
  value: string,
): value is PlanNodeEntityRole {
  return (PLAN_NODE_ENTITY_ROLES as readonly string[]).includes(value);
}

export async function applyEntityAttachments(args: {
  siteId: string;
  attachments: EntityAttachment[];
}): Promise<EntityAttachResult> {
  const [nodes, entities] = await Promise.all([
    listPlanNodes(args.siteId),
    listPlanEntities(args.siteId),
  ]);
  const nodeByRoute = new Map(
    nodes
      .filter((node) => Boolean(node.route))
      .map((node) => [node.route as string, node]),
  );
  const entityByLabel = new Map(
    entities.map((entity) => [normalize(entity.label), entity]),
  );

  const result: EntityAttachResult = {
    attached: 0,
    unknownRoutes: [],
    unknownEntities: [],
    failures: [],
  };

  for (const attachment of args.attachments) {
    const node = nodeByRoute.get(attachment.route);
    if (!node) {
      if (!result.unknownRoutes.includes(attachment.route)) {
        result.unknownRoutes.push(attachment.route);
      }
      continue;
    }
    const entity = entityByLabel.get(normalize(attachment.entityLabel));
    if (!entity) {
      if (!result.unknownEntities.includes(attachment.entityLabel)) {
        result.unknownEntities.push(attachment.entityLabel);
      }
      continue;
    }
    if (!isPlanNodeEntityRole(attachment.role)) {
      result.failures.push(
        `${attachment.route}: "${attachment.role}" is not a registered node→entity role`,
      );
      continue;
    }
    try {
      // assoc_add is idempotent — re-running the pass never duplicates edges.
      await attachNodeEntity({
        nodeId: node.id,
        entityId: entity.id,
        role: attachment.role,
      });
      result.attached += 1;
    } catch (error) {
      result.failures.push(
        `${attachment.route} → ${attachment.entityLabel}: ${extractErrorMessage(error)}`,
      );
    }
  }
  return result;
}
