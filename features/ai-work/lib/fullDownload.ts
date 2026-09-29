"use client";

/**
 * FULL DOWNLOAD — the complete provider transcript of a coding conversation.
 *
 * AI Matrx keeps only a coding session's text and the NAMES of its tool calls
 * (aidream `coding_session_bridge/kept_shape.py`). The full file — every tool
 * input and output — is found in this order (Arman, 2026-09-28: "it should look
 * on your computer first and get it directly first if it's available and then
 * go to s3 if it's not"):
 *
 *   1. THIS COMPUTER — the Matrx Local app copies the provider's own file into
 *      Downloads (`coding_session.full_download` over the existing bridge
 *      channel). When the owner turned cloud backup on, it also refreshes the
 *      backup while it has the file.
 *   2. THE CLOUD BACKUP — the gzip copy stored only for owners who opted in
 *      (Feature Knob `coding_session_bridge.raw_transcript_backup`, default off).
 *   3. AN HONEST NO — every step that could not deliver says why, in words.
 */

import { callApi } from "@/lib/api/call-api";
import type { AppDispatch } from "@/lib/redux/store";
import type { components } from "@/types/python-generated/api-types";
import { downloadFile } from "@/features/files/api/files";
import { callMatrxLocal } from "./matrxLocalRuntime";

export type RawTranscriptSource = components["schemas"]["RawTranscriptSource"];

export type FullDownloadStep =
  | { kind: "this_computer"; savedPath: string; subagentStreams: number; backupNote: string | null }
  | { kind: "cloud_backup"; fileName: string; thisComputer: string }
  | { kind: "not_available"; reasons: string[] };

export interface FullDownloadResult {
  provider: string;
  providerSessionId: string;
  step: FullDownloadStep;
}

interface LocalFullDownloadReply {
  found: boolean;
  detail?: string;
  saved_path?: string;
  subagent_streams?: number;
  backup?: { backed_up: boolean; detail?: string };
}

/** How long to wait for this computer before trying the cloud backup. */
const THIS_COMPUTER_TIMEOUT_MS = 20_000;

export async function readRawTranscriptSources(
  dispatch: AppDispatch,
  conversationId: string,
  organizationId: string | null,
): Promise<RawTranscriptSource[]> {
  const result = await dispatch(
    callApi({
      path: "/coding-sessions/raw-transcripts",
      method: "GET",
      queryParams: { conversation_id: conversationId },
      // The conversation's OWN organization, exactly as the reply composer
      // asks: never whichever organization the header happens to show.
      scopeOverrides: organizationId ? { organization_id: organizationId } : undefined,
    }),
  );
  if (result.error) {
    throw new Error(result.error.message || "AI Matrx could not list this conversation's transcripts.");
  }
  const data = result.data as components["schemas"]["RawTranscriptSources"] | undefined;
  return data?.sources ?? [];
}

function saveBlob(blob: Blob, fileName: string): void {
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = fileName;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 10_000);
}

/** One source, resolved through the three steps. Never throws for a "no". */
export async function fullDownloadOne(source: RawTranscriptSource): Promise<FullDownloadResult> {
  const reasons: string[] = [];
  const base = { provider: source.provider, providerSessionId: source.provider_session_id };

  if (source.native_session_id) {
    try {
      const reply = await callMatrxLocal<LocalFullDownloadReply>(
        "coding_session.full_download",
        {
          provider: source.provider,
          native_session_id: source.native_session_id,
          provider_session_id: source.provider_session_id,
          transcript_path: source.transcript_path ?? null,
          backup: source.backup_enabled,
        },
        THIS_COMPUTER_TIMEOUT_MS,
      );
      if (reply.found && reply.saved_path) {
        const backupNote = reply.backup
          ? reply.backup.backed_up
            ? "The cloud backup was refreshed too."
            : `The cloud backup was not refreshed: ${reply.backup.detail ?? "unknown reason"}`
          : null;
        return {
          ...base,
          step: {
            kind: "this_computer",
            savedPath: reply.saved_path,
            subagentStreams: reply.subagent_streams ?? 0,
            backupNote,
          },
        };
      }
      reasons.push(reply.detail ?? "The full transcript file is not on this computer.");
    } catch (error) {
      reasons.push(error instanceof Error ? error.message : String(error));
    }
  } else {
    reasons.push("AI Matrx does not know this session's file name on your computer.");
  }

  if (source.backup_available && source.backup_file_id) {
    const { blob, filename } = await downloadFile(source.backup_file_id);
    const fileName =
      filename || `${source.provider}-${source.native_session_id ?? "session"}.jsonl.gz`;
    saveBlob(blob, fileName);
    return {
      ...base,
      step: { kind: "cloud_backup", fileName, thisComputer: reasons.join(" ") },
    };
  }
  reasons.push(source.backup_sentence);
  return { ...base, step: { kind: "not_available", reasons } };
}
