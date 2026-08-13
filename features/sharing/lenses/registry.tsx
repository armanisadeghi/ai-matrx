"use client";

/**
 * THE SHARE-LENS REGISTRY — primitive #1 of the platform sharing experience.
 *
 * A share = a GRANT (what the recipient may do) + a LENS (how the share is
 * rendered for them). Lenses never touch access — they ride on the canonical
 * grant/link machinery. This registry maps an entity token to the lens that
 * renders it on the recipient landing (`/s/[token]` today); every shareable
 * token WITHOUT an entry gets `GenericRenderer` — the guaranteed default-path
 * floor. Flagship artifacts register a presentation lens (exemplar:
 * `seo_collection_run` → the AI visibility report).
 *
 * Adding a lens = one entry here (+ optionally one in `./metadata.ts` for
 * social/meta tags). Never add a per-type `switch` on a share surface again.
 *
 * Cross-repo charter: common-docs/systems/sharing-experience/VISION.md
 * Plan: common-docs/projects/sharing-experience/PLAN.md
 */

import type { ReactNode } from "react";
import type { ResolvedShareToken } from "@/utils/permissions/shareLinks";
import {
  AiVisibilityRenderer,
  CanvasRenderer,
  CodeRenderer,
  FlashcardRenderer,
  FolderRenderer,
  GenericRenderer,
  MarkdownRenderer,
} from "@/features/sharing/lenses/default-renderers";
import { KindInstanceRenderer } from "@/features/sharing/lenses/kind-instance";
import { SharedFileLens } from "@/features/sharing/lenses/file-lens";

export interface ShareLensProps {
  /** The resolved share payload (registry `public_columns` projection). */
  result: ResolvedShareToken;
  /** The share token — for token-backed byte URLs and self-referencing CTAs. */
  token: string;
}

export type ShareLensRender = (props: ShareLensProps) => ReactNode;

/**
 * Token → lens. Grouped by lens, mirroring the type unions the old
 * `renderBody` switch expressed.
 */
const SHARE_LENS_REGISTRY: Record<string, ShareLensRender> = {
  note: (p) => <MarkdownRenderer result={p.result} />,
  message_template: (p) => <MarkdownRenderer result={p.result} />,
  working_document: (p) => <MarkdownRenderer result={p.result} />,
  code_file: (p) => <CodeRenderer result={p.result} />,
  canvas_item: (p) => <CanvasRenderer result={p.result} />,
  shared_canvas_item: (p) => <CanvasRenderer result={p.result} />,
  fc_card: (p) => <FlashcardRenderer result={p.result} />,
  file: (p) => <SharedFileLens result={p.result} token={p.token} />,
  folder: (p) => <FolderRenderer result={p.result} />,
  seo_collection_run: (p) => (
    <AiVisibilityRenderer result={p.result} token={p.token} />
  ),
  // POLYMORPHIC token: one entry, many kinds. The renderer dispatches on the
  // instance's data shape and falls back to the generic floor — see
  // ./kind-instance.tsx.
  content_ir_kind_instance: (p) => (
    <KindInstanceRenderer result={p.result} token={p.token} />
  ),
};

/**
 * Lenses that own the WHOLE landing body — the shell renders them full-bleed
 * (no padded max-width column, definite height) so a viewer can use the
 * entire viewport. Full-bleed lenses own their own scroll.
 */
const FULL_BLEED_LENSES = new Set<string>(["file"]);

export function shareLensIsFullBleed(
  resourceType: string | null | undefined,
): boolean {
  return !!resourceType && FULL_BLEED_LENSES.has(resourceType);
}

/**
 * Resolve the lens for a resource type. Always returns a renderer — unknown
 * and unregistered types get the generic floor, never an error.
 */
export function resolveShareLens(
  resourceType: string | null | undefined,
): ShareLensRender {
  if (resourceType && SHARE_LENS_REGISTRY[resourceType]) {
    return SHARE_LENS_REGISTRY[resourceType];
  }
  return (p) => <GenericRenderer result={p.result} />;
}
