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
import { toast } from "sonner";
import { useAppSelector } from "@/lib/redux/hooks";
import { selectEffectiveOrganizationId } from "@/lib/redux/slices/appContextSlice";
import {
  useContainerLinks,
  type ContainerLink,
} from "@/features/scopes/hooks/useContainerLinks";
import { ResourceAttachmentTile } from "@/features/agents/components/messages-display/user/ResourceAttachmentTile";
import { ContextItemDrawer } from "@/features/agents/components/context-items/ContextItemDrawer";
import { useContextItemDrawer } from "@/features/agents/components/context-items/useContextItemDrawer";
import type { ContextDrawerItem } from "@/features/agents/components/context-items/types";
import { DocumentRepresentationPill } from "@/features/agents/components/inputs/resources/DocumentRepresentationPill";
import {
  cleanDocumentLabel,
  parseAttachedDocumentMetadata,
  type AttachedDocumentMetadata,
} from "@/features/agents/components/inputs/resources/attached-documents";
import { useFileDocument } from "@/features/files/hooks/useFileDocument";
import type { DocumentRepresentation } from "@/features/agents/types/instance.types";
import type { ProcessedDocumentSource } from "@/features/agents/utils/processedDocumentContext";
import type { Json } from "@/types/database.types";

function metaAsJson(fileId: string | null, rep?: DocumentRepresentation): Json {
  const m: AttachedDocumentMetadata = { file_id: fileId };
  if (rep) m.representation = rep;
  return m as Json;
}

/**
 * Build the normalized drawer descriptor for one attached-document chip so a
 * click opens the shared ContextItemDrawer on the RIGHT registered viewer
 * (`processed_document` → LibraryPreviewPage; `file` → MediaBody) instead of a
 * raw-JSON GenericBody dump.
 */
function processedDocDrawerItem(
  link: ContainerLink,
  conversationId: string,
): ContextDrawerItem {
  const meta = parseAttachedDocumentMetadata(link.metadata);
  return {
    id: `processed_document:${link.resourceId}`,
    blockType: "processed_document",
    typeLabel: "Document",
    title: cleanDocumentLabel(link.label),
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
): ContextDrawerItem {
  return {
    id: `file:${link.resourceId}`,
    blockType: "document",
    typeLabel: "File",
    title: cleanDocumentLabel(link.label),
    icon: FileText,
    themeKey: "document",
    origin: "block",
    conversationId,
    editable: false,
    refs: { fileId: link.resourceId },
    raw: link.metadata,
  };
}

interface ProcessedDocumentChipProps {
  link: ContainerLink;
  onOpen: () => void;
  onDetach: () => void;
  onChangeRepresentation: (
    fileId: string | null,
    rep: DocumentRepresentation,
  ) => void;
  onSwitchToRawFile: (fileId: string) => void;
}

/**
 * One `processed_document → conversation` chip. Owns the file-document probe so
 * the representation pill's `has_clean_content` is ACCURATE: it fires
 * `useFileDocument(file_id)` and reflects the real value once resolved. Until it
 * resolves (or when absent/unavailable) it defaults to `false` — conservatively
 * NOT offering "Clean" until a warm probe confirms clean content exists (the
 * backend leads with raw when clean isn't ready, so a disabled Clean is honest).
 */
function ProcessedDocumentChip({
  link,
  onOpen,
  onDetach,
  onChangeRepresentation,
  onSwitchToRawFile,
}: ProcessedDocumentChipProps) {
  const meta = parseAttachedDocumentMetadata(link.metadata);
  const representation = meta.representation ?? "clean";
  const title = cleanDocumentLabel(link.label);
  const fileId = meta.file_id ?? null;

  const { state } = useFileDocument(fileId);
  const hasClean = state.status === "found" ? state.doc.has_clean_content : false;

  const source: ProcessedDocumentSource = {
    kind: "processed_document",
    processed_document_id: link.resourceId,
    file_id: fileId,
    derivation_kind: "",
    total_pages: null,
    has_clean_content: hasClean,
  };

  return (
    <motion.div
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
        onClick={onOpen}
        onRemove={onDetach}
        variant="compact"
      />
      <DocumentRepresentationPill
        source={source}
        representation={representation}
        onChange={(rep) => onChangeRepresentation(fileId, rep)}
        onAttachAsFile={() => {
          if (fileId) onSwitchToRawFile(fileId);
        }}
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

  // Suppress the raw `file` chip whenever a `processed_document` edge already
  // exists for the SAME origin file (its metadata.file_id === the file edge's
  // resource id). During the cold-cache upgrade both edges briefly coexist;
  // showing both would render a transient DOUBLE chip AND — if the user submits
  // in that window — inject the same document's context twice. One chip only.
  const processedFileIds = new Set(
    processedDocs
      .map((l) => parseAttachedDocumentMetadata(l.metadata).file_id)
      .filter((id): id is string => typeof id === "string" && id.length > 0),
  );
  const visibleFiles = files.filter((l) => !processedFileIds.has(l.resourceId));

  if (processedDocs.length === 0 && visibleFiles.length === 0) return null;

  // One flat drawer list across every visible chip (processed docs, then files),
  // so the drawer's prev/next walks every attached document. Order MUST match
  // the render order below for the clicked index to line up.
  const drawerItems: ContextDrawerItem[] = [
    ...processedDocs.map((l) => processedDocDrawerItem(l, conversationId)),
    ...visibleFiles.map((l) => fileDrawerItem(l, conversationId)),
  ];

  const openDrawer = (id: string) => {
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
          toast.error(`Couldn't change document format: ${res.error}`);
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
        toast.error(`Couldn't switch to raw file: ${res.error}`);
        return;
      }
      void links
        .attach("file", fileId, link.label ?? undefined, metaAsJson(fileId))
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

  return (
    <div className="flex flex-wrap gap-1.5 px-2 pt-1.5 pb-0.5 shrink-0">
      <AnimatePresence mode="popLayout">
        {processedDocs.map((link) => (
          <ProcessedDocumentChip
            key={link.edgeId}
            link={link}
            onOpen={() => openDrawer(`processed_document:${link.resourceId}`)}
            onDetach={() => detach("processed_document", link.resourceId)}
            onChangeRepresentation={(fileId, rep) =>
              changeRepresentation(link, fileId, rep)
            }
            onSwitchToRawFile={(fileId) => switchToRawFile(link, fileId)}
          />
        ))}
        {visibleFiles.map((link) => {
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
                onClick={() => openDrawer(`file:${link.resourceId}`)}
                onRemove={() => detach("file", link.resourceId)}
                variant="compact"
              />
            </motion.div>
          );
        })}
      </AnimatePresence>
      <ContextItemDrawer controller={drawer} />
    </div>
  );
}
