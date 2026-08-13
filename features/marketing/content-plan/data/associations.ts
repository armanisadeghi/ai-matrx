/**
 * features/marketing/content-plan/data/associations.ts
 *
 * Thin typed wrappers over the CANONICAL association chokepoint
 * (`features/scopes/service/associationsService`) for the registered plan
 * pairs. No new DB access path — every call funnels into `assoc_add` /
 * `assoc_remove` / `assoc_for_entity`. The `plan_node|plan_entity → web_site`
 * containment edge is TRIGGER-written (`plan._site_edge`); the client never
 * touches it.
 *
 * Registered pairs + roles (platform.association_types, verified live
 * 2026-07-25): plan_node→seo_topic ('topic'), plan_node→seo_keyword
 * ('secondary_keyword'), plan_node→plan_entity ('about'|'cites'|'embeds'|
 * 'authored_by'|'reviewed_by' — reviews carry the `plan_review` payload),
 * plan_node→plan_node ('relies_on_hub'|'related'), plan_entity→plan_entity
 * ('created_by'), plan_entity→category ('member').
 */
import { associationsService } from "@/features/scopes/service/associationsService";
import type {
  AssociationEdge,
  ScopesRpcResult,
} from "@/features/scopes/types";

import {
  PARTY_SITE_ROLE,
  PARTY_TOKEN,
  PLAN_ENTITY_TOKEN,
  PLAN_NODE_SECONDARY_KEYWORD_ROLE,
  PLAN_NODE_TOKEN,
  PLAN_NODE_TOPIC_ROLE,
  PLAN_REVIEW_PAYLOAD_KIND,
  SEO_KEYWORD_TOKEN,
  SEO_TOPIC_TOKEN,
  WEB_SITE_TOKEN,
  type PlanNodeEntityRole,
  type PlanReviewPayload,
} from "../types";

/** Unwrap the ScopesRpcResult envelope — this feature treats every failed
 * association write/read as a thrown error (structured handling upstream). */
function unwrap<T>(result: ScopesRpcResult<T>): T {
  if (!result.ok) {
    throw new Error(`${result.error.message} (${result.error.code})`);
  }
  return result.data;
}

/** Every edge touching a plan node, both directions, one round trip. */
export async function listPlanNodeEdges(
  nodeId: string,
): Promise<AssociationEdge[]> {
  const data = unwrap(
    await associationsService.listForEntity(PLAN_NODE_TOKEN, nodeId),
  );
  return data.edges;
}

export async function addNodeTopic(
  nodeId: string,
  topicId: string,
): Promise<void> {
  unwrap(
    await associationsService.add({
      sourceType: PLAN_NODE_TOKEN,
      sourceId: nodeId,
      targetType: SEO_TOPIC_TOKEN,
      targetId: topicId,
      role: PLAN_NODE_TOPIC_ROLE,
    }),
  );
}

export async function removeNodeTopic(
  nodeId: string,
  topicId: string,
): Promise<void> {
  unwrap(
    await associationsService.remove({
      sourceType: PLAN_NODE_TOKEN,
      sourceId: nodeId,
      targetType: SEO_TOPIC_TOKEN,
      targetId: topicId,
      role: PLAN_NODE_TOPIC_ROLE,
    }),
  );
}

export async function addNodeSecondaryKeyword(
  nodeId: string,
  keywordId: string,
): Promise<void> {
  unwrap(
    await associationsService.add({
      sourceType: PLAN_NODE_TOKEN,
      sourceId: nodeId,
      targetType: SEO_KEYWORD_TOKEN,
      targetId: keywordId,
      role: PLAN_NODE_SECONDARY_KEYWORD_ROLE,
    }),
  );
}

export async function removeNodeSecondaryKeyword(
  nodeId: string,
  keywordId: string,
): Promise<void> {
  unwrap(
    await associationsService.remove({
      sourceType: PLAN_NODE_TOKEN,
      sourceId: nodeId,
      targetType: SEO_KEYWORD_TOKEN,
      targetId: keywordId,
      role: PLAN_NODE_SECONDARY_KEYWORD_ROLE,
    }),
  );
}

/**
 * Attach a plan.entity to a node under one semantic role. `reviewed_by`
 * edges may carry the schema-validated `plan_review` payload (the DB
 * validates it against platform.edge_payload_kind's JSON Schema — an
 * invalid payload is a loud error, surfaced verbatim).
 */
export async function attachNodeEntity(args: {
  nodeId: string;
  entityId: string;
  role: PlanNodeEntityRole;
  review?: PlanReviewPayload;
}): Promise<void> {
  unwrap(
    await associationsService.add({
      sourceType: PLAN_NODE_TOKEN,
      sourceId: args.nodeId,
      targetType: PLAN_ENTITY_TOKEN,
      targetId: args.entityId,
      role: args.role,
      ...(args.review
        ? {
            payloadKind: PLAN_REVIEW_PAYLOAD_KIND,
            payload: { ...args.review },
          }
        : {}),
    }),
  );
}

export async function detachNodeEntity(args: {
  nodeId: string;
  entityId: string;
  role: PlanNodeEntityRole;
}): Promise<void> {
  unwrap(
    await associationsService.remove({
      sourceType: PLAN_NODE_TOKEN,
      sourceId: args.nodeId,
      targetType: PLAN_ENTITY_TOKEN,
      targetId: args.entityId,
      role: args.role,
    }),
  );
}

/**
 * Attach a crm.party (person/company) to a node — authored_by / reviewed_by /
 * about / cites on the registered plan_node → party pair. `reviewed_by`
 * carries the same schema-validated `plan_review` payload it always did (the
 * payload kind moved with the people when plan.entity person rows folded
 * into crm.party).
 */
export async function attachNodeParty(args: {
  nodeId: string;
  partyId: string;
  role: PlanNodeEntityRole;
  review?: PlanReviewPayload;
}): Promise<void> {
  unwrap(
    await associationsService.add({
      sourceType: PLAN_NODE_TOKEN,
      sourceId: args.nodeId,
      targetType: PARTY_TOKEN,
      targetId: args.partyId,
      role: args.role,
      ...(args.review
        ? {
            payloadKind: PLAN_REVIEW_PAYLOAD_KIND,
            payload: { ...args.review },
          }
        : {}),
    }),
  );
}

export async function detachNodeParty(args: {
  nodeId: string;
  partyId: string;
  role: PlanNodeEntityRole;
}): Promise<void> {
  unwrap(
    await associationsService.remove({
      sourceType: PLAN_NODE_TOKEN,
      sourceId: args.nodeId,
      targetType: PARTY_TOKEN,
      targetId: args.partyId,
      role: args.role,
    }),
  );
}

/**
 * The site's people roster = crm parties with a `party → web_site`
 * `writes_for` edge onto this site. Returns the linked party ids.
 */
export async function listSitePartyIds(siteId: string): Promise<string[]> {
  const data = unwrap(
    await associationsService.listForEntity(WEB_SITE_TOKEN, siteId),
  );
  return data.edges
    .filter(
      (edge) =>
        edge.direction === "incoming" &&
        edge.otherType === PARTY_TOKEN &&
        edge.role === PARTY_SITE_ROLE,
    )
    .map((edge) => edge.otherId);
}

export async function linkPartyToSite(args: {
  partyId: string;
  siteId: string;
}): Promise<void> {
  unwrap(
    await associationsService.add({
      sourceType: PARTY_TOKEN,
      sourceId: args.partyId,
      targetType: WEB_SITE_TOKEN,
      targetId: args.siteId,
      role: PARTY_SITE_ROLE,
    }),
  );
}

export async function unlinkPartyFromSite(args: {
  partyId: string;
  siteId: string;
}): Promise<void> {
  unwrap(
    await associationsService.remove({
      sourceType: PARTY_TOKEN,
      sourceId: args.partyId,
      targetType: WEB_SITE_TOKEN,
      targetId: args.siteId,
      role: PARTY_SITE_ROLE,
    }),
  );
}
