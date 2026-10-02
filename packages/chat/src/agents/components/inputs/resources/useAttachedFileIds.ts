"use client";

/**
 * useAttachedFileIds — every stored-file id already attached to a conversation,
 * from BOTH places an attachment can live:
 *   - the durable `file → conversation` / `processed_document → conversation`
 *     edges (the same read `AttachedDocumentChips` renders from), and
 *   - the per-turn `instanceResources` (a provisional file reference before
 *     turn one, a media ref, a resolving pick).
 *
 * The Files picker shows these as TICKED. Until 2026-10-01 it opened with every
 * box empty, so a file already on the conversation looked unattached and a
 * second tick tried to attach it again (PB-04 real-test friction).
 */

import { useAppSelector } from "../../../../store/hooks";
import { selectOrganizationId } from "@host/lib/redux/slices/appContextSlice";
import { useConversationMaterialized } from "../../../hooks/useConversationMaterialized";
import { useContainerLinks } from "@host/features/scopes/hooks/useContainerLinks";
import { selectInstanceResources } from "../../../redux/execution-system/instance-resources/instance-resources.selectors";
import { parseAttachedDocumentMetadata } from "./attached-documents";
import type { ManagedResource } from "../../../types/instance.types";

function fileIdOf(value: unknown): string | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const record = value as Record<string, unknown>;
  for (const key of ["file_id", "fileId"]) {
    const id = record[key];
    if (typeof id === "string" && id) return id;
  }
  return null;
}

/** Pure: the file ids carried by a conversation's per-turn resources. */
export function fileIdsFromResources(
  resources: readonly Pick<ManagedResource, "source" | "finalPayload">[],
): string[] {
  const ids: string[] = [];
  for (const resource of resources) {
    const id = fileIdOf(resource.source) ?? fileIdOf(resource.finalPayload);
    if (id) ids.push(id);
  }
  return ids;
}

export function useAttachedFileIds(conversationId: string): ReadonlySet<string> {
  const isMaterialized = useConversationMaterialized(conversationId);
  const resources = useAppSelector(selectInstanceResources(conversationId));
  const convOrgId = useAppSelector(
    (s) => s.conversations.byConversationId[conversationId]?.organizationId,
  );
  const activeOrgId = useAppSelector(selectOrganizationId);
  const links = useContainerLinks({
    containerType: "conversation",
    containerId: isMaterialized ? conversationId : null,
    orgId: convOrgId ?? activeOrgId,
  });

  return new Set([
    ...fileIdsFromResources(resources),
    ...links.linksFor("file").map((link) => link.resourceId),
    ...links
      .linksFor("processed_document")
      .map((link) => parseAttachedDocumentMetadata(link.metadata).file_id)
      .filter((id): id is string => typeof id === "string" && id.length > 0),
  ]);
}
