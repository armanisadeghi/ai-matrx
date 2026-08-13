/**
 * features/marketing/content-plan/setup/entity-attach.ts
 *
 * Applying an E-E-A-T entity pass to the plan: which pages carry which
 * author / reviewer / citation, decided across the WHOLE plan at once.
 *
 * The agent chooses only from the site's existing roster, by label. The
 * roster has two halves since the person/org fold into crm.party
 * (2026-08-12): people/companies are linked `crm.party` rows (attached as
 * plan_node → party edges), sources/media are live `plan.entity` rows
 * (plan_node → plan_entity edges). Labels resolve against BOTH and route to
 * the feature's OWN wrappers — never a parallel association path.
 *
 * A label that does not resolve is REPORTED, never created: inventing an
 * author or a citation is the one thing an E-E-A-T pass must never do.
 */
import { extractErrorMessage } from "@/utils/errors";
import { fetchPartiesByIds } from "@/features/crm/service";

import {
  attachNodeEntity,
  attachNodeParty,
  listSitePartyIds,
} from "../data/associations";
import { listPlanEntities, listPlanNodes } from "../data/service";
import {
  PLAN_NODE_PARTY_ROLES,
  PLAN_NODE_SOURCE_ROLES,
  type PlanNodeEntityRole,
} from "../types";
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
  return (
    (PLAN_NODE_SOURCE_ROLES as readonly string[]).includes(value) ||
    (PLAN_NODE_PARTY_ROLES as readonly string[]).includes(value)
  );
}

export async function applyEntityAttachments(args: {
  siteId: string;
  attachments: EntityAttachment[];
}): Promise<EntityAttachResult> {
  const [nodes, entities, partyIds] = await Promise.all([
    listPlanNodes(args.siteId),
    listPlanEntities(args.siteId),
    listSitePartyIds(args.siteId),
  ]);
  const parties = await fetchPartiesByIds(partyIds);
  const nodeByRoute = new Map(
    nodes
      .filter((node) => Boolean(node.route))
      .map((node) => [node.route as string, node]),
  );
  const entityByLabel = new Map(
    entities.map((entity) => [normalize(entity.label), entity]),
  );
  // People/companies resolve first — on a label collision the person wins,
  // because authored_by/reviewed_by (the roles that matter most) are person
  // edges and a citation with a person's exact label is the rarer case.
  const partyByLabel = new Map(
    parties.map((party) => [normalize(party.display_name), party]),
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
    const label = normalize(attachment.entityLabel);
    const party = partyByLabel.get(label);
    const entity = party ? undefined : entityByLabel.get(label);
    if (!party && !entity) {
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
    const allowed: readonly string[] = party
      ? PLAN_NODE_PARTY_ROLES
      : PLAN_NODE_SOURCE_ROLES;
    if (!allowed.includes(attachment.role)) {
      result.failures.push(
        `${attachment.route}: "${attachment.role}" is not a valid role for ${
          party ? "a person/company" : "a source"
        } ("${attachment.entityLabel}")`,
      );
      continue;
    }
    try {
      // assoc_add is idempotent — re-running the pass never duplicates edges.
      if (party) {
        await attachNodeParty({
          nodeId: node.id,
          partyId: party.id,
          role: attachment.role,
        });
      } else {
        await attachNodeEntity({
          nodeId: node.id,
          entityId: (entity as { id: string }).id,
          role: attachment.role,
        });
      }
      result.attached += 1;
    } catch (error) {
      result.failures.push(
        `${attachment.route} → ${attachment.entityLabel}: ${extractErrorMessage(error)}`,
      );
    }
  }
  return result;
}
