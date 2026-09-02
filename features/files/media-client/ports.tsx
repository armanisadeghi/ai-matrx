/**
 * features/files/media-client/ports.tsx
 *
 * The host ports for `@ai-matrx/media` — the app-shaped halves the package
 * deliberately does not own:
 *
 *   - `ImageComponent` — the PACKAGE's next/image binding
 *     (`@ai-matrx/media/next`). This used to be a 35-line local wrapper with
 *     four handler casts; since media 0.4.0 the binding ships in the package
 *     and the wiring is identity (C22 / THE ALL-INCLUSIVE LAW);
 *   - `playbackSession` — the existing audio system (output-sink routing +
 *     exclusive-playback join). Port members are HOOKS; the port object is
 *     a module constant so it is referentially stable for the app lifetime;
 *   - `actions` — the existing download / copy / share / open flows, plus
 *     the `SharePopover` slot (THE SHARE MANDATE, C19 — wave M-SHARE): the
 *     package share body configured with the app's notify/AccessSummary
 *     bindings, behind a lazy edge in `share-slot.tsx`.
 */

"use client";

import type { Ref, RefObject } from "react";
import type {
  MediaActionContext,
  MediaFailureInfo,
  MediaHostPorts,
  PlaybackSessionPort,
} from "@ai-matrx/media";
import { NextMediaImage } from "@ai-matrx/media/next";
import { useOutputSinkRef } from "@/features/audio/useOutputSinkRef";
import { useMediaElementPlaybackSession } from "@/features/audio/session/useMediaElementPlaybackSession";
import type { AudioSessionSource } from "@/features/audio/session/types";
import { openFilePreview } from "@/features/files/components/preview/openFilePreview";
import { mediaClient, mediaFilesClient } from "./client";
import { MediaSharePopoverSlot } from "./share-slot";
import { captureError } from "@/lib/diagnostics/errorCaptureStore";
import { toast } from "@/lib/toast";
import { downloadMediaSource, mediaRefToDownloadSource } from "./download";

const playbackSession: PlaybackSessionPort = {
  useMediaElementSink(forward) {
    // eslint-disable-next-line react-hooks/rules-of-hooks -- port member IS a hook, called unconditionally by the package
    return useOutputSinkRef(
      forward as
        Ref<HTMLImageElement | HTMLVideoElement | HTMLAudioElement> | undefined,
    ) as (node: unknown) => void;
  },
  usePlaybackSession(registration, elementRef) {
    // eslint-disable-next-line react-hooks/rules-of-hooks -- port member IS a hook, called unconditionally by the package
    useMediaElementPlaybackSession({
      elementRef: elementRef as RefObject<HTMLMediaElement | null>,
      isPlaying: registration.isPlaying,
      source: registration.source as AudioSessionSource,
      label: registration.label,
      trackKey: registration.trackKey,
    });
  },
};

function ctxFileId(ctx: MediaActionContext): string | null {
  if (typeof ctx.ref === "string") return null;
  return ctx.ref.file_id ?? null;
}

async function copyText(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    return false;
  }
}

const actions: MediaHostPorts["actions"] = {
  async download(ctx) {
    const source = mediaRefToDownloadSource(ctx.ref);
    if (!source) return;
    await downloadMediaSource(source, ctx.fileName);
  },
  async copy(ctx) {
    // Copy a durable link — the public URL when one already exists,
    // otherwise the durable resolution src (never a signed URL: resolve()
    // refuses). Copy never MINTS a share link — that is the share door's
    // job (`mediaClient.shareableUrl`).
    const shareable = mediaFilesClient.shareableUrlNoMint(ctx.ref);
    const url = shareable ?? ctx.resolution?.src ?? null;
    if (!url) {
      toast.error("No link available for this file");
      return;
    }
    if (await copyText(url)) toast.success("Link copied");
    else toast.error("Couldn't copy the link");
  },
  async share(ctx) {
    // Fails closed (law 4): only a durable public URL is ever shared. The
    // ONE share door reuses-or-mints a no-expiry read-only link for owned
    // files (wave M-SHARE) — same click semantics as the share popover.
    const shareable = await mediaClient.shareableUrl(ctx.ref);
    if (!shareable) {
      toast.error("This file can't be shared publicly");
      return;
    }
    if (await copyText(shareable)) toast.success("Public link copied");
    else toast.error("Couldn't copy the link");
  },
  async open(ctx) {
    const fileId = ctxFileId(ctx);
    if (fileId) {
      openFilePreview(fileId);
      return;
    }
    const src = ctx.resolution?.src;
    if (src) window.open(src, "_blank", "noopener,noreferrer");
  },
  // THE SHARE MANDATE (C19) hookup: the rich share body for the package
  // shells (toolbar / lightbox), lazily loaded.
  SharePopover: MediaSharePopoverSlot,
};

/**
 * The `@ai-matrx/media` diagnostics binding — the port whose ABSENCE made the
 * 2026-08-30 private-image outage invisible to the Error Inspector. Per C22
 * this is a pure sink binding: zero interpretation, no host policy.
 *
 * The payload type is the PACKAGE's `MediaFailureInfo`. It used to be mirrored
 * as a local interface because `MediaHostPorts` did not yet declare the port;
 * it does now (0.4.x), so the mirror is deleted rather than left as a twin that
 * silently stops matching the day the package adds a phase or a field.
 */
const diagnostics = {
  capture(info: MediaFailureInfo): void {
    captureError({
      source: "media",
      relation: info.mediaRef,
      message: info.message,
      details: `phase=${info.phase}${
        info.retryOutcome ? ` retry=${info.retryOutcome}` : ""
      }${info.terminal ? "" : " (warning)"}`,
      recoverable: !info.terminal,
      raw: info,
      ...(info.status !== undefined ? { status: info.status } : {}),
    });
  },
};

/** Referentially stable for the app lifetime — required by the port contract. */
export const mediaHostPorts: MediaHostPorts = {
  ImageComponent: NextMediaImage,
  playbackSession,
  actions,
  diagnostics,
};
