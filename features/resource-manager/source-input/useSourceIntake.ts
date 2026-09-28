"use client";

/**
 * useSourceIntake — every way NEW material becomes a Source, through the doors
 * that already exist (DESIGN.md amendment A3). Each call adds a card at once
 * (so the person sees it working), then settles it to a pointer or fails it
 * with a sentence and a remedy. Nothing is ever sent onward as a blob.
 *
 *   pasted text   → `POST /sources/land` (`buildPastedTextLanding`), kept.
 *   a web page    → the scraper route, which lands at its result boundary;
 *                   then `POST /sources/{id}/keep` files it against the thing
 *                   being made.
 *   a file/image  → `useFileUpload().uploadMany` — UploadGuardHost's SHA-256
 *                   check offers "use the one you already have" — then the
 *                   existing processing runner starts reading it.
 *   YouTube/audio → no landing door of their own yet: the transcript comes
 *                   from Start's readers (`fetchYouTubeTranscript`,
 *                   `transcribeCloudFile`) and lands through
 *                   `POST /sources/land`. The card says so.
 *   stored things → the picker's `Resource`, through THE ONE total mapping
 *                   `resourceToSourceRef` (lane USI-1).
 */

import type { Resource } from "@/features/agents/resources/types";
import { useAppSelector } from "@/lib/redux/hooks";
import { selectUserId } from "@/lib/redux/selectors/userSelectors";
import { selectOrganizationId } from "@/lib/redux/slices/appContextSlice";
import { ensureOrgId } from "@/lib/organizations/ensureOrgId";
import { useBackendApi } from "@/hooks/useBackendApi";
import { useScraperApi } from "@/features/scraper/hooks/useScraperApi";
import { useFileUpload } from "@/features/files/handler/hooks/useFileUpload";
import type { UseProcessingRunner } from "@/features/rag/hooks/useProcessingRunner";
import { RAG_VOCAB } from "@/features/rag/constants/vocabulary";
import { transcribeCloudFile } from "@/features/audio/services/speechApi";
import { fetchYouTubeTranscript } from "@/features/education/onboard/youtubeTranscript";
import { youtubeId } from "@/lib/media/youtube";
import {
  keepSource,
  landSource,
  type SourceAttachTarget,
  type SourceLandingBody,
} from "@/features/sources/api/sourcesApi";
import { buildPastedTextLanding } from "@/features/sources/api/pastedText";
import { addFailureSentence } from "@/features/sources/addFailure";
import { createSourceRef } from "@ai-matrx/agents/sources";
import { isNeedsIntake, resourceToSourceRef } from "./resourceToSourceRef";
import type { UseSourceSetResult } from "./useSourceSet";
import type { SourceAttachTo, SourceKindId } from "./types";

const TRANSCRIPT_NAME_MAX = 120;

function attachTargets(attachTo: SourceAttachTo | undefined): SourceAttachTarget[] {
  return attachTo
    ? [
        {
          entity_type: attachTo.entityType,
          entity_id: attachTo.entityId,
          label: attachTo.label ?? null,
          signal: true,
        },
      ]
    : [];
}

function hostOf(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return url;
  }
}

function landedNotes(notices: { message: string }[] | undefined): string[] {
  return (notices ?? []).map((n) => n.message).filter(Boolean);
}

export interface UseSourceIntakeResult {
  addPastedText: (text: string, name?: string) => Promise<void>;
  addWebPage: (url: string) => Promise<void>;
  addYouTube: (url: string) => Promise<void>;
  addFiles: (files: File[], kind: SourceKindId) => Promise<void>;
  addRecording: (file: File) => Promise<void>;
  /** A picker selection. Returns false (and says why) when it cannot be a Source yet. */
  addPicked: (resource: Resource, kind: SourceKindId) => boolean;
}

export function useSourceIntake(
  set: UseSourceSetResult,
  options: { attachTo?: SourceAttachTo; runner: UseProcessingRunner },
): UseSourceIntakeResult {
  const userId = useAppSelector(selectUserId);
  const activeOrgId = useAppSelector(selectOrganizationId);
  const backendApi = useBackendApi();
  const { scrapeUrl } = useScraperApi();
  const { uploadMany } = useFileUpload();
  const attachTo = attachTargets(options.attachTo);
  const keep = attachTo.length > 0;

  const needUser = (): string => {
    if (!userId)
      throw new Error("Your sign-in is still loading, so nothing was added. Try again in a moment.");
    return userId;
  };

  /** Land text through the door as a kept Source; returns the settle patch. */
  const landText = async (
    body: SourceLandingBody,
  ): Promise<{ id: string; notes: string[] }> => {
    const landed = await landSource({ ...body, keep: true, attach_to: attachTo });
    return { id: landed.processed_document_id, notes: landedNotes(landed.notices) };
  };

  const addPastedText = async (text: string, name?: string) => {
    const trimmed = text.trim();
    if (!trimmed) return;
    const id = set.addPending({ kind: "paste", label: name?.trim() || "Pasted text", origin: "Pasted text" });
    try {
      const organizationId = await ensureOrgId(activeOrgId);
      const body = await buildPastedTextLanding({
        text: trimmed,
        name,
        organizationId,
        userId: needUser(),
      });
      const landed = await landText(body);
      set.settle(id, {
        label: body.name,
        ref: createSourceRef("processed_document", landed.id),
        processedDocumentId: landed.id,
        notes: landed.notes,
      });
    } catch (err) {
      set.fail(id, addFailureSentence(err));
    }
  };

  const addWebPage = async (raw: string) => {
    const url = /^https?:\/\//i.test(raw.trim()) ? raw.trim() : `https://${raw.trim()}`;
    const id = set.addPending({ kind: "web", label: hostOf(url), origin: url });
    try {
      const organizationId = await ensureOrgId(activeOrgId);
      const result = await scrapeUrl(url);
      if (!result) {
        set.fail(
          id,
          "That page could not be read — it may need a sign-in or block robots. Try another link, or copy the text and use Paste text.",
        );
        return;
      }
      if (!result.processedDocumentId) {
        set.fail(
          id,
          result.sourceNotices[0]?.message ??
            "The page was read but did not become a Source, and the server did not say why. Try again.",
        );
        return;
      }
      const notes = landedNotes(result.sourceNotices);
      if (keep) {
        try {
          await keepSource(result.processedDocumentId, { attachTo, organizationId });
        } catch (err) {
          notes.push(
            `It is in your Sources, but it could not be filed with what you are making: ${addFailureSentence(err)}`,
          );
        }
      }
      set.settle(id, {
        label: result.overview?.page_title || hostOf(url),
        ref: createSourceRef("processed_document", result.processedDocumentId),
        processedDocumentId: result.processedDocumentId,
        notes,
      });
    } catch (err) {
      set.fail(id, addFailureSentence(err));
    }
  };

  const addYouTube = async (raw: string) => {
    const url = raw.trim();
    const videoId = youtubeId(url);
    if (!videoId) return;
    const id = set.addPending({ kind: "youtube", label: "YouTube video", origin: url });
    try {
      const organizationId = await ensureOrgId(activeOrgId);
      const { text, note } = await fetchYouTubeTranscript(backendApi.post, url);
      if (!text) {
        set.fail(
          id,
          note ??
            "That video has no speech we could write out (no captions and no clear voice). Try another video, or paste a transcript.",
        );
        return;
      }
      const name = `YouTube — ${text.split(/\s+/).slice(0, 10).join(" ")}…`.slice(0, TRANSCRIPT_NAME_MAX);
      const body = await buildPastedTextLanding({
        text,
        name,
        organizationId,
        userId: needUser(),
      });
      const landed = await landText({
        ...body,
        // Identity is the video, so the same video twice is one Source.
        canonical_identity: `youtube:${videoId}`,
        provenance: { ...body.provenance, origin_client: "youtube", capture_method: "captions", final_url: url },
      });
      set.settle(id, {
        label: name,
        ref: createSourceRef("processed_document", landed.id),
        processedDocumentId: landed.id,
        notes: landed.notes,
      });
    } catch (err) {
      set.fail(id, addFailureSentence(err));
    }
  };

  const addFiles = async (files: File[], kind: SourceKindId) => {
    for (const file of files) {
      const id = set.addPending({ kind, label: file.name, origin: "Uploaded file" });
      try {
        await ensureOrgId(activeOrgId);
        // One at a time so each card knows its own file; the duplicate check
        // still runs for every one and offers the copy already stored.
        const result = await uploadMany([file], { visibility: "internal" });
        if (result.cancelled) {
          set.fail(id, "The upload was cancelled, so nothing was added. Add it again when you are ready.");
          continue;
        }
        const reused = result.aliased[0]?.existingFileId;
        const fileId = reused ?? result.uploaded[0];
        if (!fileId) {
          set.fail(
            id,
            result.failed[0]?.error
              ? `The upload failed: ${result.failed[0].error}. Try again.`
              : "The upload finished but the server did not return the file. Try again.",
          );
          continue;
        }
        const notes = reused ? ["You already had this file — the stored copy is used, nothing new was uploaded."] : [];
        if (!reused) {
          // Start reading it on the one processing runner (never a third mechanism).
          void options.runner
            .runForCldFile(fileId, file.name, `Reading (extract → clean → ${RAG_VOCAB.segmentStage} → embed)`)
            .catch(() => undefined);
        }
        set.settle(id, { label: file.name, ref: createSourceRef("file", fileId), fileId, notes });
      } catch (err) {
        set.fail(id, addFailureSentence(err));
      }
    }
  };

  const addRecording = async (file: File) => {
    const id = set.addPending({ kind: "audio", label: file.name, origin: "Recording" });
    try {
      const organizationId = await ensureOrgId(activeOrgId);
      const result = await uploadMany([file], { visibility: "internal" });
      if (result.cancelled) {
        set.fail(id, "The upload was cancelled, so nothing was added. Add it again when you are ready.");
        return;
      }
      const fileId = result.aliased[0]?.existingFileId ?? result.uploaded[0];
      if (!fileId) {
        set.fail(id, "The recording did not upload. Try again.");
        return;
      }
      const transcription = await transcribeCloudFile({ fileId, organizationId });
      const text = (transcription.text ?? "").trim();
      if (text.length < 8) {
        set.fail(
          id,
          "We couldn't hear enough speech in that recording to write it out. Try a recording with a clear voice.",
        );
        return;
      }
      const name = `Recording — ${file.name}`.slice(0, TRANSCRIPT_NAME_MAX);
      const body = await buildPastedTextLanding({ text, name, organizationId, userId: needUser() });
      const landed = await landText({
        ...body,
        canonical_identity: `audio-transcript:${fileId}`,
        provenance: { ...body.provenance, origin_client: "transcription", capture_method: "speech" },
      });
      set.settle(id, {
        label: name,
        ref: createSourceRef("processed_document", landed.id),
        processedDocumentId: landed.id,
        fileId,
        notes: landed.notes,
      });
    } catch (err) {
      set.fail(id, addFailureSentence(err));
    }
  };

  const addPicked = (resource: Resource, kind: SourceKindId): boolean => {
    const outcome = resourceToSourceRef(resource);
    const label = pickedLabel(resource);
    if (isNeedsIntake(outcome)) {
      const id = set.addPending({ kind, label });
      set.fail(id, outcome.reason);
      return false;
    }
    if (set.hasRef(outcome.resource_type, outcome.resource_id)) return true;
    set.addReady({
      kind,
      label,
      ref: outcome,
      fileId: outcome.resource_type === "file" ? outcome.resource_id : undefined,
    });
    return true;
  };

  return { addPastedText, addWebPage, addYouTube, addFiles, addRecording, addPicked };
}

/** The name a picked record goes by on its card. */
function pickedLabel(resource: Resource): string {
  const data = resource.data as unknown as Record<string, unknown>;
  const candidates = [
    data.label,
    data.title,
    data.name,
    data.filename,
    data.table_name,
    (data.details as Record<string, unknown> | undefined)?.filename,
  ];
  const found = candidates.find((c): c is string => typeof c === "string" && c.trim().length > 0);
  return found ?? "Untitled";
}
