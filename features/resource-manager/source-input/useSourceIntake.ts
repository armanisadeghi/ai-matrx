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
 *                   existing processing runner starts reading it. The file is
 *                   filed against `attachTo` at once through the ONE
 *                   associations chokepoint (`file → target`, the edge task
 *                   attachments use), and its Source, once reading makes one,
 *                   is kept and filed through the door (`fileLanded`).
 *   YouTube/audio → no landing door of their own yet: the transcript comes
 *                   from Start's readers (`fetchYouTubeTranscript`,
 *                   `transcribeCloudFile`) and lands through
 *                   `POST /sources/land`. The card says so.
 *   stored things → the picker's `Resource`, through THE ONE total mapping
 *                   `resourceToSourceRef` (lane USI-1).
 *
 * Never lose input: every landing keeps what the person handed over in the
 * draft (`SourceDraft.input` — text, link, uploaded recording; never bytes)
 * until it settles, so `resume` can land it again after a reload or a failure.
 * Landing twice is safe: the door dedupes by (organization, identity, content
 * hash) and returns the same Source.
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
// Every `ensureOrgId` here lands in a catch that fails the card with `addFailureSentence`,
// which says the organization refusal in the platform's words, with the remedy.
// org-refusal-presented-by: features/sources/addFailure.ts
import { addFailureSentence } from "@/features/sources/addFailure";
import { createSourceRef } from "@ai-matrx/agents/sources";
import { isAssociationTargetType } from "@ai-matrx/associations";
import { associationsService } from "@/features/scopes/service/associationsService";
import { isNeedsIntake, resourceToSourceRef } from "./resourceToSourceRef";
import { MAX_KEPT_TEXT_CHARS, resumableInput } from "./interrupted";
import type { UseSourceSetResult } from "./useSourceSet";
import type {
  SourceAttachTo,
  SourceCardModel,
  SourceIntakeInput,
  SourceKindId,
} from "./types";

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
  /** Land a card's kept input again (after a reload or a failure). False when nothing was kept. */
  resume: (card: SourceCardModel) => boolean;
  /** The person chose the file again for a card whose upload was cut off. */
  retryFile: (card: SourceCardModel, file: File) => Promise<void>;
  /** Reading an uploaded file made its Source: keep it and file it against `attachTo`. */
  fileLanded: (card: SourceCardModel, processedDocumentId: string) => Promise<void>;
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
    const id = set.addPending({
      kind: "paste",
      label: name?.trim() || "Pasted text",
      input: trimmed.length <= MAX_KEPT_TEXT_CHARS ? { text: trimmed, name } : undefined,
    });
    await landPaste(id, trimmed, name);
  };

  const landPaste = async (id: string, trimmed: string, name?: string) => {
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
    const id = set.addPending({ kind: "web", label: hostOf(url), origin: url, input: { url } });
    await landWebPage(id, url);
  };

  const landWebPage = async (id: string, url: string) => {
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
      // A Source picked for real work is kept (A3): its clean → segment →
      // embed is queued, and it is filed against the thing being made.
      {
        try {
          await keepSource(result.processedDocumentId, { attachTo, organizationId });
        } catch (err) {
          notes.push(
            `It is in your Sources, but it could not be kept for reuse${
              attachTo.length ? " or filed with what you are making" : ""
            }: ${addFailureSentence(err)}`,
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
    const id = set.addPending({ kind: "youtube", label: "YouTube video", origin: url, input: { url } });
    await landYouTube(id, url, videoId);
  };

  const landYouTube = async (id: string, url: string, videoId: string) => {
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

  /**
   * File the uploaded file against the thing being made — the ONE associations
   * chokepoint, `file → target` (how task attachments are filed). Returns a
   * note when it could not be filed; the upload itself stands.
   */
  const fileAgainstTarget = async (fileId: string, organizationId: string): Promise<string | null> => {
    const target = options.attachTo;
    if (!target) return null;
    const what = target.label ? `"${target.label}"` : "what you are making";
    if (!isAssociationTargetType(target.entityType))
      return `It was uploaded, but a file cannot be filed with ${what} (a ${target.entityType.replace(/_/g, " ")}), so it is not listed there.`;
    const linked = await associationsService.add({
      sourceType: "file",
      sourceId: fileId,
      targetType: target.entityType,
      targetId: target.entityId,
      orgId: organizationId,
    });
    return linked.ok
      ? null
      : `It was uploaded, but it could not be filed with ${what}: ${linked.error.message}`;
  };

  const addFiles = async (files: File[], kind: SourceKindId) => {
    for (const file of files) {
      const id = set.addPending({ kind, label: file.name, origin: "Uploaded file" });
      await landFile(id, file);
    }
  };

  const landFile = async (id: string, file: File) => {
    try {
      const organizationId = await ensureOrgId(activeOrgId);
      // One at a time so each card knows its own file; the duplicate check
      // still runs for every one and offers the copy already stored.
      const result = await uploadMany([file], { visibility: "internal" });
      if (result.cancelled) {
        set.fail(id, "The upload was cancelled, so nothing was added. Add it again when you are ready.");
        return;
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
        return;
      }
      const notes = reused ? ["You already had this file — the stored copy is used, nothing new was uploaded."] : [];
      const filed = await fileAgainstTarget(fileId, organizationId);
      if (filed) notes.push(filed);
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
  };

  const addRecording = async (file: File) => {
    const id = set.addPending({ kind: "audio", label: file.name, origin: "Recording" });
    await landRecording(id, file);
  };

  const landRecording = async (id: string, file: File) => {
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
      // Uploaded: from here a reload re-transcribes the stored copy.
      set.updateDraft(id, { input: { fileId }, fileId });
      await transcribeRecording(id, fileId, file.name, organizationId);
    } catch (err) {
      set.fail(id, addFailureSentence(err));
    }
  };

  const transcribeRecording = async (
    id: string,
    fileId: string,
    fileName: string,
    knownOrganizationId?: string,
  ) => {
    try {
      const organizationId = knownOrganizationId ?? (await ensureOrgId(activeOrgId));
      const transcription = await transcribeCloudFile({ fileId, organizationId });
      const text = (transcription.text ?? "").trim();
      if (text.length < 8) {
        set.fail(
          id,
          "We couldn't hear enough speech in that recording to write it out. Try a recording with a clear voice.",
        );
        return;
      }
      const name = `Recording — ${fileName}`.slice(0, TRANSCRIPT_NAME_MAX);
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

  const resume = (card: SourceCardModel): boolean => {
    const input: SourceIntakeInput | null = resumableInput(card.draft);
    if (!input) return false;
    set.restart(card.id);
    switch (card.draft.kind) {
      case "paste":
        void landPaste(card.id, (input.text ?? "").trim(), input.name);
        return true;
      case "web":
        void landWebPage(card.id, input.url ?? "");
        return true;
      case "youtube": {
        const videoId = youtubeId(input.url ?? "");
        if (!videoId) {
          set.fail(card.id, "That link is not a YouTube video any more. Remove it and paste the link again.");
          return true;
        }
        void landYouTube(card.id, input.url ?? "", videoId);
        return true;
      }
      case "audio":
        void transcribeRecording(card.id, input.fileId ?? "", card.draft.label);
        return true;
      default:
        return false;
    }
  };

  const retryFile = async (card: SourceCardModel, file: File) => {
    set.restart(card.id);
    set.updateDraft(card.id, { label: file.name });
    if (card.draft.kind === "audio") await landRecording(card.id, file);
    else await landFile(card.id, file);
  };

  const fileLanded = async (card: SourceCardModel, processedDocumentId: string) => {
    // Every card opens its Source from now on.
    set.updateDraft(card.id, { processedDocumentId });
    try {
      const organizationId = await ensureOrgId(activeOrgId);
      await keepSource(processedDocumentId, { attachTo, organizationId });
    } catch (err) {
      set.updateDraft(card.id, {
        processedDocumentId,
        notes: [
          ...(card.draft.notes ?? []),
          `It was read, but its Source could not be kept for reuse${
            attachTo.length ? " or filed with what you are making" : ""
          }: ${addFailureSentence(err)}`,
        ],
      });
    }
  };

  return {
    addPastedText,
    addWebPage,
    addYouTube,
    addFiles,
    addRecording,
    addPicked,
    resume,
    retryFile,
    fileLanded,
  };
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
