"use client";

/**
 * AttachedDocumentChips
 *
 * Renders the DURABLE document attachments for a conversation — one chip per
 * `platform.associations` edge (`processed_document → conversation` or
 * `file → conversation`). Reads the conversation's INCOMING edges via
 * `useContainerLinks` (NOT the ephemeral `instanceResources` slice), so an
 * attached document PERSISTS across turns and reloads. The backend reads the
 * same edges at call time and injects the context itself — the FE ships nothing
 * in `request.context` for these.
 *
 * Each chip is a single unified pill: truncated name (opens canvas) + the
 * complete dynamic family policy + remove. Only the USER removes an attachment.
 */

import { FileText } from "lucide-react";
import { motion, AnimatePresence } from "motion/react";
import { toast } from "sonner";
import { useAppSelector } from "@/lib/redux/hooks";
import { selectEffectiveOrganizationId } from "@/lib/redux/slices/appContextSlice";
import {
  useContainerLinks,
  type ContainerLink,
} from "@/features/scopes/hooks/useContainerLinks";
import { ContextItemDrawer } from "@/features/agents/components/context-items/ContextItemDrawer";
import { useContextItemDrawer } from "@/features/agents/components/context-items/useContextItemDrawer";
import type { ContextDrawerItem } from "@/features/agents/components/context-items/types";
import { AttachedDocumentChip } from "@/features/agents/components/inputs/resources/AttachedDocumentChip";
import {
  cleanDocumentLabel,
  parseAttachedDocumentMetadata,
  useAttachedDocumentDisplayName,
  type AttachedDocumentMetadata,
} from "@/features/agents/components/inputs/resources/attached-documents";
import type { VariableResourceContextConfig } from "@/features/agents/types/agent-definition.types";
import type { Json } from "@/types/database.types";

function metaAsJson(
  fileId: string | null,
  resourcePolicy?: VariableResourceContextConfig,
): Json {
  const m: AttachedDocumentMetadata = {
    file_id: fileId,
    ...(resourcePolicy ? { resource_policy: resourcePolicy } : {}),
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
  onPolicyChange: (
    link: ContainerLink,
    edgeKind: "processed_document" | "file",
    fileId: string | null,
    displayTitle: string,
    policy: VariableResourceContextConfig,
  ) => Promise<void>;
}

function DocumentChipRow({
  link,
  edgeKind,
  conversationId,
  processedDocs,
  visibleFiles,
  onOpenDrawer,
  onDetach,
  onPolicyChange,
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
        resourcePolicy={meta.resource_policy}
        onOpen={openCanvas}
        onRemove={onDetach}
        onPolicyChange={(policy) =>
          onPolicyChange(link, edgeKind, fileId, title, policy)
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
  const convOrgId = useAppSelector(
    (s) => s.conversations.byConversationId[conversationId]?.organizationId,
  );
  const effectiveOrgId = useAppSelector(selectEffectiveOrganizationId);
  const orgId = convOrgId ?? effectiveOrgId;

  const links = useContainerLinks({
    containerType: "conversation",
    containerId: conversationId,
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

  if (processedDocs.length === 0 && visibleFiles.length === 0) return null;

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

  const changePolicy = async (
    link: ContainerLink,
    edgeKind: "processed_document" | "file",
    fileId: string | null,
    displayTitle: string,
    policy: VariableResourceContextConfig,
  ) => {
    if (!fileId) {
      toast.error("This legacy document attachment has no source file ID");
      return;
    }
    const attachResult = await links.attach(
      "file",
      fileId,
      displayTitle,
      metaAsJson(fileId, policy),
    );
    if (!attachResult.ok) {
      console.error("[attached-document] family policy change failed", {
        conversationId,
        resourceId: link.resourceId,
        error: attachResult.error,
      });
      toast.error(`Couldn't update document context: ${attachResult.error}`);
      return;
    }
    if (edgeKind === "processed_document") {
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
      }
    }
  };

  return (
    <div className="flex flex-wrap gap-1.5 px-2 pt-1.5 pb-0.5 shrink-0">
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
            onPolicyChange={changePolicy}
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
            onPolicyChange={changePolicy}
          />
        ))}
      </AnimatePresence>
      <ContextItemDrawer controller={drawer} />
    </div>
  );
}
