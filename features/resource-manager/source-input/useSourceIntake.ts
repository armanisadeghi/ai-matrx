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
 *                   check offers "use the one you already have". The upload's
 *                   finalize starts the one reading run on the server (the file
 *                   adapters make the Source). The file is filed against
 *                   `attachTo` at once through the ONE associations chokepoint
 *                   (`file → target`), and its Source — new or already there —
 *                   is kept and filed through the door (`fileLanded`), driven by
 *                   the server's state (`fileSource.ts`, `useSourceRecovery`).
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
import { useEffect, useState } from "react";
import { useAppSelector } from "@/lib/redux/hooks";
import { selectUserId } from "@/lib/redux/selectors/userSelectors";
import { selectOrganizationId } from "@/lib/redux/slices/appContextSlice";
import { ensureOrgId } from "@/lib/organizations/ensureOrgId";
import { holdDeliberateIntent } from "@/lib/organization/organization-gate";
import { useBackendApi } from "@/hooks/useBackendApi";
import { useScraperApi } from "@/features/scraper/hooks/useScraperApi";
import { useFileUpload } from "@/features/files/handler/hooks/useFileUpload";
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
import { supabase } from "@/utils/supabase/client";
import { isNeedsIntake, resourceToSourceRef } from "./resourceToSourceRef";
import {
  createOrganizationHold,
  WAITING_FOR_ORGANIZATION,
  waitsForOrganization,
} from "./organizationHold";
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
          // The EDGE's label, which the registry names (a deck's Source is its
          // "source", a scope's is "about") — never the target's display name,
          // which the door refused as an unknown label (USI-3e).
          label: null,
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

/** A notice that asks the person to save (keep) the Source — moot once it is kept. */
function isSaveItNotice(remedy: string | null | undefined): boolean {
  return typeof remedy === "string" && remedy.startsWith("save_it");
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
  options: { attachTo?: SourceAttachTo },
): UseSourceIntakeResult {
  const userId = useAppSelector(selectUserId);
  const activeOrgId = useAppSelector(selectOrganizationId);
  const backendApi = useBackendApi();
  const { scrapeUrl } = useScraperApi();
  const { uploadMany } = useFileUpload();
  const attachTo = attachTargets(options.attachTo);

  // No organization yet: the landing waits and runs again the moment one is
  // set (`organizationHold.ts`) — never a dead error on the card.
  const [orgHold] = useState(createOrganizationHold);
  useEffect(() => {
    if (activeOrgId) orgHold.release();
  }, [activeOrgId, orgHold]);

  /** Fail the card — or, when only the organization is missing, hold it and say so. */
  const failOrHold = (id: string, err: unknown, replay: () => Promise<void>) => {
    if (waitsForOrganization(err)) {
      orgHold.hold(id, () => (set.restart(id) ? replay() : undefined));
      set.fail(id, WAITING_FOR_ORGANIZATION);
      return;
    }
    set.fail(id, addFailureSentence(err));
  };

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
    await holdDeliberateIntent(() => landPaste(id, trimmed, name));
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
      failOrHold(id, err, () => landPaste(id, trimmed, name));
    }
  };

  const addWebPage = async (raw: string) => {
    const url = /^https?:\/\//i.test(raw.trim()) ? raw.trim() : `https://${raw.trim()}`;
    const id = set.addPending({ kind: "web", label: hostOf(url), origin: url, input: { url } });
    await holdDeliberateIntent(() => landWebPage(id, url));
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
      // A Source picked for real work is kept (A3): its clean → segment →
      // embed is queued, and it is filed against the thing being made. Once
      // kept, the capture's "not saved — save it" notices are no longer true;
      // the keep's own notices replace them.
      let notes: string[];
      try {
        const kept = await keepSource(result.processedDocumentId, { attachTo, organizationId });
        notes = [
          ...landedNotes(result.sourceNotices.filter((n) => !isSaveItNotice(n.remedy))),
          ...landedNotes(kept.notices),
        ];
      } catch (err) {
        notes = [
          ...landedNotes(result.sourceNotices),
          `It is in your Sources, but it could not be kept for reuse${
            attachTo.length ? " or filed with what you are making" : ""
          }: ${addFailureSentence(err)}`,
        ];
      }
      set.settle(id, {
        label: result.overview?.page_title || hostOf(url),
        ref: createSourceRef("processed_document", result.processedDocumentId),
        processedDocumentId: result.processedDocumentId,
        notes,
      });
    } catch (err) {
      failOrHold(id, err, () => landWebPage(id, url));
    }
  };

  const addYouTube = async (raw: string) => {
    const url = raw.trim();
    const videoId = youtubeId(url);
    if (!videoId) return;
    const id = set.addPending({ kind: "youtube", label: "YouTube video", origin: url, input: { url } });
    await holdDeliberateIntent(() => landYouTube(id, url, videoId));
  };

  const landYouTube = async (id: string, url: string, videoId: string) => {
    try {
      const organizationId = await ensureOrgId(activeOrgId);
      const { text, note, source } = await fetchYouTubeTranscript(backendApi.post, url);
      if (!text) {
        set.fail(
          id,
          note ??
            "That video has no speech we could write out (no captions and no clear voice). Try another video, or paste a transcript.",
        );
        return;
      }
      if (source) {
        // The server landed the timed transcript through the door: the card IS
        // that transcript Source, and "Choose parts" lists its timed segments.
        const label = `YouTube — ${source.title || videoId}`.slice(0, TRANSCRIPT_NAME_MAX);
        let notes: string[] = [];
        try {
          const kept = await keepSource(source.processed_document_id, { attachTo, organizationId });
          notes = landedNotes(kept.notices);
        } catch (err) {
          notes = [
            `It was read, but its Source could not be kept for reuse${
              attachTo.length ? " or filed with what you are making" : ""
            }: ${addFailureSentence(err)}`,
          ];
        }
        set.settle(id, {
          label,
          ref: createSourceRef("processed_document", source.processed_document_id),
          processedDocumentId: source.processed_document_id,
          notes,
        });
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
        // Untimed: say why it has no parts to choose (the server's own sentence).
        notes: note ? [...landed.notes, note] : landed.notes,
      });
    } catch (err) {
      failOrHold(id, err, () => landYouTube(id, url, videoId));
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
    // The edge goes the way the registry declares it (`fc_set → file`, but
    // `file → task`); writing it backwards is refused (USI-3e).
    let direction: Awaited<ReturnType<typeof registeredFileEdge>>;
    try {
      direction = await registeredFileEdge(target.entityType);
    } catch (err) {
      return `It was uploaded, but it could not be filed with ${what}: ${addFailureSentence(err)}`;
    }
    if (!direction)
      return `It was uploaded, but a file cannot be filed with ${what} (a ${target.entityType.replace(/_/g, " ")}), so it is not listed there.`;
    const targetType = target.entityType;
    if (direction === "file_to_target" && !isAssociationTargetType(targetType))
      return `It was uploaded, but a file cannot be filed with ${what} (a ${targetType.replace(/_/g, " ")}), so it is not listed there.`;
    const linked = await associationsService.add(
      direction === "file_to_target" && isAssociationTargetType(targetType)
        ? {
            sourceType: "file",
            sourceId: fileId,
            targetType,
            targetId: target.entityId,
            orgId: organizationId,
          }
        : {
            sourceType: target.entityType,
            sourceId: target.entityId,
            targetType: "file",
            targetId: fileId,
            orgId: organizationId,
          },
    );
    return linked.ok
      ? null
      : `It was uploaded, but it could not be filed with ${what}: ${linked.error.message}`;
  };

  const addFiles = async (files: File[], kind: SourceKindId) => {
    for (const file of files) {
      const id = set.addPending({ kind, label: file.name, origin: "Uploaded file" });
      await holdDeliberateIntent(() => landFile(id, file));
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
      // No run is started here: the upload's finalize already started the one
      // reading run on the server, and a reused copy may already have its
      // Source. `useSourceRecovery` reads the server's state for the card and
      // keeps + files the Source (or starts the one run only when nothing is
      // reading it) — the same for a new upload, a reused copy and a reload.
      set.settle(id, { label: file.name, ref: createSourceRef("file", fileId), fileId, notes });
    } catch (err) {
      failOrHold(id, err, () => landFile(id, file));
    }
  };

  const addRecording = async (file: File) => {
    const id = set.addPending({ kind: "audio", label: file.name, origin: "Recording" });
    await holdDeliberateIntent(() => landRecording(id, file));
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
      failOrHold(id, err, () => landRecording(id, file));
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
      failOrHold(id, err, () => transcribeRecording(id, fileId, fileName));
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
    orgHold.drop(card.id);
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
    orgHold.drop(card.id);
    await holdDeliberateIntent(() =>
      card.draft.kind === "audio" ? landRecording(card.id, file) : landFile(card.id, file),
    );
  };

  const fileLanded = async (card: SourceCardModel, processedDocumentId: string) => {
    // Every card opens its Source from now on (and a held keep's waiting note goes).
    set.updateDraft(card.id, { processedDocumentId, notes: card.draft.notes });
    try {
      const organizationId = await ensureOrgId(activeOrgId);
      await keepSource(processedDocumentId, { attachTo, organizationId });
    } catch (err) {
      if (waitsForOrganization(err)) {
        orgHold.hold(card.id, () => fileLanded(card, processedDocumentId));
        set.updateDraft(card.id, {
          processedDocumentId,
          notes: [
            ...(card.draft.notes ?? []),
            "It was read. Waiting for an organization to keep it for reuse — choose one and it is kept by itself.",
          ],
        });
        return;
      }
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

/**
 * Which way a file ↔ `targetType` edge is registered in
 * `platform.association_types` — or null when it is not registered at all.
 */
async function registeredFileEdge(
  targetType: string,
): Promise<"file_to_target" | "target_to_file" | null> {
  const { data, error } = await supabase
    .schema("platform")
    .from("association_types")
    .select("source_type, target_type")
    .eq("is_active", true)
    .or(
      `and(source_type.eq.file,target_type.eq.${targetType}),and(source_type.eq.${targetType},target_type.eq.file)`,
    );
  if (error) throw error;
  const rows = (data ?? []) as { source_type: string; target_type: string }[];
  if (rows.some((r) => r.source_type === "file")) return "file_to_target";
  if (rows.some((r) => r.target_type === "file")) return "target_to_file";
  return null;
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
