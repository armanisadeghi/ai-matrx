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
 * Each chip is a single unified pill: truncated name (opens canvas) + File/Clean/Raw
 * mode dropdown + remove. Only the USER removes an attachment.
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
import { lookupFileDocument } from "@/features/files/api/document-lookup";
import { useFileDocument } from "@/features/files/hooks/useFileDocument";
import type { DocumentRepresentation } from "@/features/agents/types/instance.types";
import type { AttachedDocumentMode } from "@/features/agents/utils/processedDocumentContext";
import type { Json } from "@/types/database.types";

function metaAsJson(fileId: string | null, rep?: DocumentRepresentation): Json {
  const m: AttachedDocumentMetadata = { file_id: fileId };
  if (rep) m.representation = rep;
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
  onChangeRepresentation: (
    link: ContainerLink,
    fileId: string | null,
    rep: DocumentRepresentation,
    displayTitle: string,
  ) => void;
  onSwitchToRawFile: (
    link: ContainerLink,
    fileId: string,
    displayTitle: string,
  ) => void;
  onSwitchToProcessedDocument: (
    link: ContainerLink,
    fileId: string,
    rep: DocumentRepresentation,
    displayTitle: string,
  ) => void;
}

function DocumentChipRow({
  link,
  edgeKind,
  conversationId,
  processedDocs,
  visibleFiles,
  onOpenDrawer,
  onDetach,
  onChangeRepresentation,
  onSwitchToRawFile,
  onSwitchToProcessedDocument,
}: DocumentChipRowProps) {
  const meta = parseAttachedDocumentMetadata(link.metadata);
  const fileId = edgeKind === "file" ? link.resourceId : (meta.file_id ?? null);
  const title = useAttachedDocumentDisplayName(fileId, link.label);
  const itemId =
    edgeKind === "processed_document"
      ? `processed_document:${link.resourceId}`
      : `file:${link.resourceId}`;

  const { state } = useFileDocument(fileId);
  const hasProcessedDocument =
    edgeKind === "processed_document" || state.status === "found";
  const hasCleanContent =
    state.status === "found" ? state.doc.has_clean_content : false;

  const mode: AttachedDocumentMode =
    edgeKind === "file" ? "file" : (meta.representation ?? "clean");

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

  const handleSelectMode = (next: AttachedDocumentMode) => {
    if (next === mode) return;
    if (next === "file") {
      if (fileId && edgeKind === "processed_document") {
        onSwitchToRawFile(link, fileId, title);
      }
      return;
    }
    if (edgeKind === "processed_document") {
      onChangeRepresentation(link, fileId, next, title);
      return;
    }
    if (fileId) {
      onSwitchToProcessedDocument(link, fileId, next, title);
    }
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
        mode={mode}
        hasProcessedDocument={hasProcessedDocument}
        hasCleanContent={hasCleanContent}
        hasOriginFile={Boolean(fileId)}
        onOpen={openCanvas}
        onRemove={onDetach}
        onSelectMode={handleSelectMode}
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

  const changeRepresentation = (
    link: ContainerLink,
    fileId: string | null,
    rep: DocumentRepresentation,
    displayTitle: string,
  ) => {
    void links
      .attach(
        "processed_document",
        link.resourceId,
        displayTitle,
        metaAsJson(fileId, rep),
      )
      .then((res) => {
        if (!res.ok) {
          console.error("[attached-document] representation change failed", {
            conversationId,
            resourceId: link.resourceId,
            error: res.error,
          });
          toast.error(`Couldn't change document format: ${res.error}`);
        }
      });
  };

  const switchToRawFile = (
    link: ContainerLink,
    fileId: string,
    displayTitle: string,
  ) => {
    void links.detach("processed_document", link.resourceId).then((res) => {
      if (!res.ok) {
        console.error("[attached-document] switch-to-file detach failed", {
          conversationId,
          resourceId: link.resourceId,
          error: res.error,
        });
        toast.error(`Couldn't switch to raw file: ${res.error}`);
        return;
      }
      void links
        .attach("file", fileId, displayTitle, metaAsJson(fileId))
        .then((attachRes) => {
          if (!attachRes.ok) {
            console.error("[attached-document] switch-to-file attach failed", {
              conversationId,
              fileId,
              error: attachRes.error,
            });
            toast.error(`Couldn't switch to raw file: ${attachRes.error}`);
          }
        });
    });
  };

  const switchToProcessedDocument = (
    link: ContainerLink,
    fileId: string,
    rep: DocumentRepresentation,
    displayTitle: string,
  ) => {
    void lookupFileDocument(fileId).then((state) => {
      if (state.kind !== "found") {
        toast.error("No processed document available for this file");
        return;
      }
      if (rep === "clean" && !state.doc.has_clean_content) {
        toast.error("Clean text is still processing");
        return;
      }
      void links.detach("file", link.resourceId).then((res) => {
        if (!res.ok) {
          console.error(
            "[attached-document] switch-to-processed detach failed",
            {
              conversationId,
              resourceId: link.resourceId,
              error: res.error,
            },
          );
          toast.error(`Couldn't switch document format: ${res.error}`);
          return;
        }
        void links
          .attach(
            "processed_document",
            state.doc.processed_document_id,
            displayTitle,
            metaAsJson(fileId, rep),
          )
          .then((attachRes) => {
            if (!attachRes.ok) {
              console.error(
                "[attached-document] switch-to-processed attach failed",
                {
                  conversationId,
                  fileId,
                  error: attachRes.error,
                },
              );
              toast.error(
                `Couldn't switch document format: ${attachRes.error}`,
              );
            }
          });
      });
    });
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
            onChangeRepresentation={changeRepresentation}
            onSwitchToRawFile={switchToRawFile}
            onSwitchToProcessedDocument={switchToProcessedDocument}
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
            onChangeRepresentation={changeRepresentation}
            onSwitchToRawFile={switchToRawFile}
            onSwitchToProcessedDocument={switchToProcessedDocument}
          />
        ))}
      </AnimatePresence>
      <ContextItemDrawer controller={drawer} />
    </div>
  );
}
