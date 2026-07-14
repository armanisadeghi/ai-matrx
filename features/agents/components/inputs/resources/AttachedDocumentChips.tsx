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
 * Each chip shows the document name + (for a processed document) the Clean/Raw
 * representation pill + a remove (detach) control. Only the USER removes an
 * attachment. Reuses `ResourceAttachmentTile` + `DocumentRepresentationPill`.
 */

import { FileText } from "lucide-react";
import { motion, AnimatePresence } from "motion/react";
import { useAppSelector } from "@/lib/redux/hooks";
import { getActiveOrgId } from "@/lib/organizations/activeOrg";
import {
  useContainerLinks,
  type ContainerLink,
} from "@/features/scopes/hooks/useContainerLinks";
import { ResourceAttachmentTile } from "@/features/agents/components/messages-display/user/ResourceAttachmentTile";
import { DocumentRepresentationPill } from "@/features/agents/components/inputs/resources/DocumentRepresentationPill";
import {
  cleanDocumentLabel,
  parseAttachedDocumentMetadata,
  type AttachedDocumentMetadata,
} from "@/features/agents/components/inputs/resources/attached-documents";
import { peekFileDocument } from "@/features/files/api/document-lookup";
import type { DocumentRepresentation } from "@/features/agents/types/instance.types";
import type { ProcessedDocumentSource } from "@/features/agents/utils/processedDocumentContext";
import type { Json } from "@/types/database.types";

function metaAsJson(fileId: string | null, rep?: DocumentRepresentation): Json {
  const m: AttachedDocumentMetadata = { file_id: fileId };
  if (rep) m.representation = rep;
  return m as Json;
}

/**
 * Reconstruct the minimal `ProcessedDocumentSource` the representation pill
 * needs from the edge metadata (+ the file-document probe cache when warm). The
 * pill only reads `has_clean_content` (to disable "Clean" while it's still
 * processing) and `file_id` (to offer "Attach as file instead").
 */
function sourceForPill(
  processedDocumentId: string,
  meta: AttachedDocumentMetadata,
): ProcessedDocumentSource {
  const fileId = meta.file_id ?? null;
  const peeked = fileId ? peekFileDocument(fileId) : undefined;
  const hasClean =
    peeked?.kind === "found"
      ? peeked.doc.has_clean_content
      : // No warm probe → don't disable Clean (backend leads with raw if not ready).
        true;
  return {
    kind: "processed_document",
    processed_document_id: processedDocumentId,
    file_id: fileId,
    derivation_kind: "",
    total_pages: null,
    has_clean_content: hasClean,
  };
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
  const orgId = convOrgId ?? getActiveOrgId();

  const links = useContainerLinks({
    containerType: "conversation",
    containerId: conversationId,
    orgId,
  });

  const processedDocs = links.linksFor("processed_document");
  const files = links.linksFor("file");
  if (processedDocs.length === 0 && files.length === 0) return null;

  const detach = (token: "processed_document" | "file", resourceId: string) => {
    void links.detach(token, resourceId).then((res) => {
      if (!res.ok) {
        console.error("[attached-document] detach failed", {
          conversationId,
          token,
          resourceId,
          error: res.error,
        });
      }
    });
  };

  const changeRepresentation = (
    link: ContainerLink,
    fileId: string | null,
    rep: DocumentRepresentation,
  ) => {
    // Idempotent re-attach REPLACES the edge metadata with the new representation.
    void links
      .attach(
        "processed_document",
        link.resourceId,
        link.label ?? undefined,
        metaAsJson(fileId, rep),
      )
      .then((res) => {
        if (!res.ok) {
          console.error("[attached-document] representation change failed", {
            conversationId,
            resourceId: link.resourceId,
            error: res.error,
          });
        }
      });
  };

  const switchToRawFile = (link: ContainerLink, fileId: string) => {
    // processed_document → file: detach the processed edge, attach the raw file.
    void links.detach("processed_document", link.resourceId).then((res) => {
      if (!res.ok) {
        console.error("[attached-document] switch-to-file detach failed", {
          conversationId,
          resourceId: link.resourceId,
          error: res.error,
        });
        return;
      }
      void links.attach(
        "file",
        fileId,
        link.label ?? undefined,
        metaAsJson(fileId),
      );
    });
  };

  return (
    <div className="flex flex-wrap gap-1.5 px-2 pt-1.5 pb-0.5 shrink-0">
      <AnimatePresence mode="popLayout">
        {processedDocs.map((link) => {
          const meta = parseAttachedDocumentMetadata(link.metadata);
          const representation = meta.representation ?? "clean";
          const title = cleanDocumentLabel(link.label);
          const source = sourceForPill(link.resourceId, meta);
          return (
            <motion.div
              key={link.edgeId}
              initial={{ opacity: 0, scale: 0.85 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.85 }}
              className="inline-flex items-center gap-1"
            >
              <ResourceAttachmentTile
                typeLabel="Document"
                title={title}
                icon={FileText}
                themeKey="processed_document"
                onRemove={() => detach("processed_document", link.resourceId)}
                variant="compact"
              />
              <DocumentRepresentationPill
                source={source}
                representation={representation}
                onChange={(rep) =>
                  changeRepresentation(link, meta.file_id ?? null, rep)
                }
                onAttachAsFile={() => {
                  if (meta.file_id) switchToRawFile(link, meta.file_id);
                }}
              />
            </motion.div>
          );
        })}
        {files.map((link) => {
          const title = cleanDocumentLabel(link.label);
          return (
            <motion.div
              key={link.edgeId}
              initial={{ opacity: 0, scale: 0.85 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.85 }}
              className="inline-flex items-center gap-1"
            >
              <ResourceAttachmentTile
                typeLabel="File"
                title={title}
                icon={FileText}
                themeKey="document"
                onRemove={() => detach("file", link.resourceId)}
                variant="compact"
              />
            </motion.div>
          );
        })}
      </AnimatePresence>
    </div>
  );
}
