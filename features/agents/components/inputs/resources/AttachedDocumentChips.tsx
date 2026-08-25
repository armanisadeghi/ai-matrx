"use client";

/**
 * AttachedDocumentChips
 *
 * Renders the DURABLE document attachments for a conversation — one chip per
 * `platform.associations` edge (`processed_document → conversation` or
 * `file → conversation`). Reads the conversation's INCOMING edges via
 * `useContainerLinks` (NOT the ephemeral `instanceResources` slice), so an
 * attached document PERSISTS across turns and reloads. The backend reads the
 * same edges at call time. A provisional first-turn file reference may briefly
 * overlap; this component removes it only after this durable inventory proves
 * the canonical edge is readable.
 *
 * Each chip is a single unified pill: truncated name (opens canvas) + the
 * complete dynamic family policy + remove. Only the USER removes an attachment.
 */

import { useEffect } from "react";
import { AlertTriangle, FileText, RefreshCw } from "lucide-react";
import { motion, AnimatePresence } from "motion/react";
import { toast } from "@/lib/toast";
import { useAppDispatch, useAppSelector } from "@/lib/redux/hooks";
import { selectEffectiveOrganizationId } from "@/lib/redux/slices/appContextSlice";
import { useConversationMaterialized } from "@/features/agents/hooks/useConversationMaterialized";
import {
  useContainerLinks,
  type ContainerLink,
} from "@/features/scopes/hooks/useContainerLinks";
import { ContextItemDrawer } from "@/features/agents/components/context-items/ContextItemDrawer";
import { useContextItemDrawer } from "@/features/agents/components/context-items/useContextItemDrawer";
import type { ContextDrawerItem } from "@/features/agents/components/context-items/types";
import {
  AttachedDocumentChip,
  type AttachedDocumentSettings,
} from "@/features/agents/components/inputs/resources/AttachedDocumentChip";
import {
  cleanDocumentLabel,
  parseAttachedDocumentMetadata,
  useAttachedDocumentDisplayName,
  type AttachedDocumentMetadata,
} from "@/features/agents/components/inputs/resources/attached-documents";
import type { Json } from "@/types/database.types";
import { selectInstanceResources } from "@/features/agents/redux/execution-system/instance-resources/instance-resources.selectors";
import { removeResource } from "@/features/agents/redux/execution-system/instance-resources/instance-resources.slice";

function metaAsJson(
  existing: Json,
  fileId: string | null,
  settings: AttachedDocumentSettings,
): Json {
  const previous =
    existing && typeof existing === "object" && !Array.isArray(existing)
      ? (existing as Record<string, Json>)
      : {};
  const {
    representation: _previousRepresentation,
    resource_policy: _previousResourcePolicy,
    file_id: _previousFileId,
    ...retained
  } = previous;
  const m: AttachedDocumentMetadata = {
    ...retained,
    file_id: fileId,
    ...(settings.representation
      ? { representation: settings.representation }
      : {}),
    ...(settings.resourcePolicy
      ? { resource_policy: settings.resourcePolicy }
      : {}),
  };
  return m as Json;
}

function processedDocDrawerItem(
  link: ContainerLink,
  conversationId: string,
  displayTitle: string,
): ContextDrawerItem {
  const meta = parseAttachedDocumentMetadata(link.metadata);
  return {
    id: `processed_document:${link.resourceId}`,
    blockType: "processed_document",
    typeLabel: "Document",
    title: displayTitle,
    icon: FileText,
    themeKey: "processed_document",
    origin: "block",
    conversationId,
    editable: false,
    refs: {
      processedDocumentId: link.resourceId,
      fileId: meta.file_id ?? null,
    },
    raw: link.metadata,
  };
}

function fileDrawerItem(
  link: ContainerLink,
  conversationId: string,
  displayTitle: string,
): ContextDrawerItem {
  return {
    id: `file:${link.resourceId}`,
    blockType: "document",
    typeLabel: "File",
    title: displayTitle,
    icon: FileText,
    themeKey: "document",
    origin: "block",
    conversationId,
    editable: false,
    refs: { fileId: link.resourceId },
    raw: link.metadata,
  };
}

function buildAttachedDocumentDrawerItems(
  processedDocs: ContainerLink[],
  visibleFiles: ContainerLink[],
  conversationId: string,
  activeItemId: string,
  activeTitle: string,
): ContextDrawerItem[] {
  return [
    ...processedDocs.map((l) =>
      processedDocDrawerItem(
        l,
        conversationId,
        drawerSeedTitle(
          `processed_document:${l.resourceId}`,
          activeItemId,
          activeTitle,
          l.label,
        ),
      ),
    ),
    ...visibleFiles.map((l) =>
      fileDrawerItem(
        l,
        conversationId,
        drawerSeedTitle(
          `file:${l.resourceId}`,
          activeItemId,
          activeTitle,
          l.label,
        ),
      ),
    ),
  ];
}

function drawerSeedTitle(
  itemId: string,
  activeItemId: string,
  activeTitle: string,
  edgeLabel: string | null,
): string {
  return itemId === activeItemId ? activeTitle : cleanDocumentLabel(edgeLabel);
}

interface DocumentChipRowProps {
  link: ContainerLink;
  edgeKind: "processed_document" | "file";
  conversationId: string;
  processedDocs: ContainerLink[];
  visibleFiles: ContainerLink[];
  onOpenDrawer: (drawerItems: ContextDrawerItem[], id: string) => void;
  onDetach: () => void;
  onSettingsChange: (
    link: ContainerLink,
    edgeKind: "processed_document" | "file",
    fileId: string | null,
    displayTitle: string,
    settings: AttachedDocumentSettings,
  ) => Promise<boolean>;
}

function DocumentChipRow({
  link,
  edgeKind,
  conversationId,
  processedDocs,
  visibleFiles,
  onOpenDrawer,
  onDetach,
  onSettingsChange,
}: DocumentChipRowProps) {
  const meta = parseAttachedDocumentMetadata(link.metadata);
  const fileId = edgeKind === "file" ? link.resourceId : (meta.file_id ?? null);
  const title = useAttachedDocumentDisplayName(fileId, link.label);
  const itemId =
    edgeKind === "processed_document"
      ? `processed_document:${link.resourceId}`
      : `file:${link.resourceId}`;

  const openCanvas = () => {
    onOpenDrawer(
      buildAttachedDocumentDrawerItems(
        processedDocs,
        visibleFiles,
        conversationId,
        itemId,
        title,
      ),
      itemId,
    );
  };

  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.85 }}
      animate={{ opacity: 1, scale: 1 }}
      exit={{ opacity: 0, scale: 0.85 }}
      className="inline-flex"
    >
      <AttachedDocumentChip
        title={title}
        fileId={fileId}
        representation={meta.representation}
        resourcePolicy={meta.resource_policy}
        onOpen={openCanvas}
        onRemove={onDetach}
        onSettingsChange={(settings) =>
          onSettingsChange(link, edgeKind, fileId, title, settings)
        }
      />
    </motion.div>
  );
}

interface AttachedDocumentChipsProps {
  conversationId: string;
}

export function AttachedDocumentChips({
  conversationId,
}: AttachedDocumentChipsProps) {
  const dispatch = useAppDispatch();
  const isMaterialized = useConversationMaterialized(conversationId);
  const provisionalResources = useAppSelector(
    selectInstanceResources(conversationId),
  );
  const convOrgId = useAppSelector(
    (s) => s.conversations.byConversationId[conversationId]?.organizationId,
  );
  const effectiveOrgId = useAppSelector(selectEffectiveOrganizationId);
  const orgId = convOrgId ?? effectiveOrgId;

  const links = useContainerLinks({
    containerType: "conversation",
    // Stream reservation/status events precede the atomic DB commit. Passing
    // null keeps the RPC idle until the row is actually readable and authorized.
    containerId: isMaterialized ? conversationId : null,
    orgId,
  });

  const drawer = useContextItemDrawer();

  const processedDocs = links.linksFor("processed_document");
  const files = links.linksFor("file");

  const processedFileIds = new Set(
    processedDocs
      .map((l) => parseAttachedDocumentMetadata(l.metadata).file_id)
      .filter((id): id is string => typeof id === "string" && id.length > 0),
  );
  const visibleFiles = files.filter((l) => !processedFileIds.has(l.resourceId));

  useEffect(() => {
    const durableFileIds = new Set([
      ...files.map((link) => link.resourceId),
      ...processedDocs
        .map((link) => parseAttachedDocumentMetadata(link.metadata).file_id)
        .filter((id): id is string => typeof id === "string" && id.length > 0),
    ]);
    if (durableFileIds.size === 0) return;

    for (const resource of provisionalResources) {
      if (
        resource.blockType !== "processed_document" ||
        !resource.source ||
        typeof resource.source !== "object" ||
        Array.isArray(resource.source)
      ) {
        continue;
      }
      const fileId = (resource.source as Record<string, unknown>).file_id;
      if (typeof fileId === "string" && durableFileIds.has(fileId)) {
        dispatch(
          removeResource({
            conversationId,
            resourceId: resource.resourceId,
          }),
        );
      }
    }
  }, [conversationId, dispatch, files, processedDocs, provisionalResources]);

  if (processedDocs.length === 0 && visibleFiles.length === 0 && !links.error) {
    return null;
  }

  const openDrawer = (drawerItems: ContextDrawerItem[], id: string) => {
    drawer.openItem(drawerItems, id);
  };

  const detach = (token: "processed_document" | "file", resourceId: string) => {
    void links.detach(token, resourceId).then((res) => {
      if (!res.ok) {
        console.error("[attached-document] detach failed", {
          conversationId,
          token,
          resourceId,
          error: res.error,
        });
        toast.error(`Couldn't remove document: ${res.error}`);
      }
    });
  };

  const changeSettings = async (
    link: ContainerLink,
    edgeKind: "processed_document" | "file",
    fileId: string | null,
    displayTitle: string,
    settings: AttachedDocumentSettings,
  ) => {
    if (!fileId) {
      toast.error("This legacy document attachment has no source file ID");
      return false;
    }
    const attachResult = await links.attach(
      "file",
      fileId,
      displayTitle,
      metaAsJson(link.metadata, fileId, settings),
      { replaceMetadata: true },
    );
    if (!attachResult.ok) {
      console.error("[attached-document] context settings change failed", {
        conversationId,
        resourceId: link.resourceId,
        error: attachResult.error,
      });
      toast.error(`Couldn't update document context: ${attachResult.error}`);
      return false;
    }
    if (edgeKind === "processed_document") {
      const priorFileEdge = files.find((item) => item.resourceId === fileId);
      const detachResult = await links.detach(
        "processed_document",
        link.resourceId,
      );
      if (!detachResult.ok) {
        console.error("[attached-document] legacy edge cleanup failed", {
          conversationId,
          resourceId: link.resourceId,
          error: detachResult.error,
        });
        toast.error(
          `Context updated, but the legacy attachment could not be removed: ${detachResult.error}`,
        );
        // Restore the pre-edit graph so the hidden canonical edge cannot
        // disagree with the still-visible legacy chip.
        const rollbackResult = priorFileEdge
          ? await links.attach(
              "file",
              fileId,
              priorFileEdge.label ?? displayTitle,
              priorFileEdge.metadata,
              { replaceMetadata: true },
            )
          : await links.detach("file", fileId);
        if (!rollbackResult.ok) {
          console.error(
            "[attached-document] legacy conversion rollback failed",
            {
              conversationId,
              fileId,
              error: rollbackResult.error,
            },
          );
          toast.error(
            `Document context may be inconsistent; refresh before sending: ${rollbackResult.error}`,
          );
        }
        await links.reload();
        return false;
      }
    }
    return true;
  };

  return (
    <div className="flex flex-wrap gap-1.5 px-2 pt-1.5 pb-0.5 shrink-0">
      {links.error && (
        <button
          type="button"
          onClick={() => void links.reload()}
          disabled={links.status === "loading"}
          className="inline-flex h-7 items-center gap-1.5 rounded-md border border-amber-500/40 bg-amber-500/10 px-2 text-xs text-amber-700 hover:bg-amber-500/15 disabled:opacity-60 dark:text-amber-300"
          title={links.error}
        >
          <AlertTriangle className="size-3.5" />
          Attachment list unavailable
          <RefreshCw
            className={`size-3 ${links.status === "loading" ? "animate-spin" : ""}`}
          />
        </button>
      )}
      <AnimatePresence mode="popLayout">
        {processedDocs.map((link) => (
          <DocumentChipRow
            key={link.edgeId}
            link={link}
            edgeKind="processed_document"
            conversationId={conversationId}
            processedDocs={processedDocs}
            visibleFiles={visibleFiles}
            onOpenDrawer={openDrawer}
            onDetach={() => detach("processed_document", link.resourceId)}
            onSettingsChange={changeSettings}
          />
        ))}
        {visibleFiles.map((link) => (
          <DocumentChipRow
            key={link.edgeId}
            link={link}
            edgeKind="file"
            conversationId={conversationId}
            processedDocs={processedDocs}
            visibleFiles={visibleFiles}
            onOpenDrawer={openDrawer}
            onDetach={() => detach("file", link.resourceId)}
            onSettingsChange={changeSettings}
          />
        ))}
      </AnimatePresence>
      <ContextItemDrawer controller={drawer} />
    </div>
  );
}
