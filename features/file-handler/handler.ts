/**
 * features/file-handler/handler.ts
 *
 * The single public entry point. Every callsite that touches a file —
 * components, thunks, server routes, agent prep — uses one of these
 * three primitives. Direct construction of media blocks, direct calls
 * to `supabase.storage`, and direct uploads through `useFileUpload` are
 * all banned (see `.eslintrc`).
 *
 *   fileHandler.use(source).as(target)         — read path
 *   fileHandler.upload(source, opts)           — write path
 *   fileHandler.refresh(file)                  — repair path
 */

import { uploadInternal } from "./upload";
import { normalize } from "./input/normalize";
import { resolve as resolveImpl } from "./resolver";
import { toTarget } from "./output/target";
import type {
  FileSource,
  FileTarget,
  NormalizedFile,
  RenderedFor,
  UploadOpts,
} from "./types";

class HandlerHandle {
  constructor(private file: NormalizedFile) {}

  async as<T extends FileTarget>(target: T): Promise<RenderedFor<T>> {
    const resolved = await resolveImpl(this.file, {
      needsUrl: targetNeedsUrl(target.kind),
      sniffMime: target.kind === "media_block",
    });
    return toTarget(resolved, target);
  }

  async resolve(): Promise<NormalizedFile> {
    return resolveImpl(this.file);
  }
}

function targetNeedsUrl(kind: FileTarget["kind"]): boolean {
  return kind !== "media_block" && kind !== "media_ref";
}

export const fileHandler = {
  /**
   * Start a chain. The chain is sync up until you call `as(...)`, which
   * resolves and renders for the chosen target.
   *
   *   const url = await fileHandler.use({ kind: "file_id", fileId }).as({ kind: "html_src" });
   */
  use(source: FileSource): HandlerHandle {
    return new HandlerHandle(normalize(source));
  },

  /**
   * One-shot resolve when you don't have a target yet (e.g. you want to
   * inspect capabilities before deciding what to do).
   */
  async resolve(source: FileSource): Promise<NormalizedFile> {
    return resolveImpl(normalize(source));
  },

  /**
   * One-shot upload. Resolves to a fully-hydrated NormalizedFile pointing
   * at the freshly-created cld_files row.
   */
  async upload(source: FileSource, opts: UploadOpts = {}): Promise<NormalizedFile> {
    return uploadInternal(source, opts);
  },

  /**
   * Force a re-mint of a signed URL even if it hasn't expired yet. Use
   * after a `refresh()`-relevant DB event (visibility change, share
   * revocation) when you know the cached URL is stale.
   */
  async refresh(file: NormalizedFile): Promise<NormalizedFile> {
    return resolveImpl(file, { needsUrl: true });
  },

  /**
   * Convenience: skip straight to a media block (the most common use).
   */
  async toMediaBlock(source: FileSource) {
    return this.use(source).as({ kind: "media_block" });
  },

  /**
   * Convenience: skip straight to a MediaRef (for outbound APIs that
   * already accept MediaRef directly).
   */
  async toMediaRef(source: FileSource) {
    return this.use(source).as({ kind: "media_ref" });
  },

  /**
   * Convenience: skip straight to a persisted JSONB content part for
   * `cx_message.content[]`.
   */
  async toContentPart(source: FileSource) {
    return this.use(source).as({ kind: "jsonb_content_part" });
  },
};

export type { FileSource, FileTarget, NormalizedFile, UploadOpts } from "./types";
