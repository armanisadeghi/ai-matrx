/**
 * unbindArtifact — the UNBIND leg of artifact ⇄ editable surfaces
 * (see ../docs/TWO_WAY_BINDING.md § (b)).
 *
 * "Give me my text back": replace the canonical R1 `<artifact id>` tag in a
 * source record's content with the artifact's clean markdown export
 * (`exportArtifactMarkdown`), persisted through the SAME owner-checked
 * `persistRewrite` the materializer used. The inverse of `materializeBlocks`.
 *
 * Semantics (per TWO_WAY_BINDING.md — do not change without updating it):
 *  - **The artifact row is KEPT, orphaned — never soft-deleted.** Other
 *    surfaces may reference the same id, `canvas_item_state` and adapter-linked
 *    domain records hang off it, and it stays discoverable in the canvas
 *    library. Deleting it is a separate, explicit user action.
 *  - **Per-reference, not per-artifact** — detaches THIS source's refs only.
 *  - **The restored text must be INERT** — it must not re-materialize into a
 *    fresh row on the next reconcile pass. Enforced mechanically: the
 *    replacement markdown is run through `planMaterialization` and the unbind
 *    is REFUSED (`reason: "not_inert"`) if it would plan any artifact.
 *    Structured-kind exports (prose via the kind `toMarkdown` facet) pass;
 *    fence-backed types whose fence re-detects (mermaid/html/svg/chart/react)
 *    are refused and stay EDIT/EXPORT-only. `code` passes: its export is
 *    re-fenced for readability and bare code fences never auto-materialize.
 *  - **Latest chain version wins** — the export reads the NEWEST version in
 *    the artifact's chain (what the user sees on editable refs), so edits made
 *    after materialization are not lost on detach.
 *  - **Loud, reversible-by-history** — a failed rewrite aborts (never a
 *    dangling half-state); chat's `cx_message_set_content` archives the prior
 *    body to `content_history`.
 *
 * PURE parts (`buildUnbindReplacement`, `rewriteContentRemovingArtifactRefs`)
 * are exported for tests; the orchestrator takes injectable row-loading deps.
 */

import type {
  CxContentBlock,
  CxTextContent,
} from "@/features/public-chat/types/cx-tables";
import { exportArtifactMarkdown } from "@/features/canvas/export/exportArtifactMarkdown";
import {
  canvasArtifactService,
  type CanvasArtifactRow,
} from "@/features/canvas/services/canvasArtifactService";
import { planMaterialization } from "./planMaterialization";
import type { PersistRewrite } from "./materializeBlocks";

function isTextBlock(b: CxContentBlock): b is CxTextContent {
  return (b as { type?: string }).type === "text";
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/**
 * Inert = re-running the materialization planner over the markdown plans
 * NOTHING. The one mechanical answer to "would this re-materialize on the
 * next reconcile pass?" — no per-type allowlist to drift.
 */
export function isInertMarkdown(markdown: string): boolean {
  return !planMaterialization([
    { type: "text", text: markdown } as CxTextContent,
  ]).hasChanges;
}

export interface UnbindReplacement {
  markdown: string;
  /** False → restoring this text would re-materialize; unbind must refuse. */
  inert: boolean;
}

/**
 * The plain-text form a row unbinds to. Structured `content.data` routes
 * through the kind registry's `toMarkdown` facet (via exportArtifactMarkdown);
 * string payloads pass through — except `code`, which is re-fenced with its
 * stored language so it reads as code again (bare code fences never
 * auto-materialize, so the fence is inert by design).
 */
export function buildUnbindReplacement(
  row: CanvasArtifactRow,
): UnbindReplacement {
  const exported = exportArtifactMarkdown(row);
  let markdown = exported.markdown;

  if (row.type === "code") {
    const stored: unknown = row.content;
    const metadata =
      isRecord(stored) && isRecord(stored.metadata) ? stored.metadata : null;
    const language =
      metadata && typeof metadata.language === "string" && metadata.language
        ? metadata.language
        : "";
    // Only fence when the payload isn't already fenced.
    if (!markdown.trimStart().startsWith("```")) {
      markdown = `\`\`\`${language}\n${markdown.replace(/\n$/, "")}\n\`\`\``;
    }
  }

  return { markdown, inert: isInertMarkdown(markdown) };
}

export interface RefRewriteResult {
  rewritten: CxContentBlock[];
  replacedCount: number;
}

/**
 * PURE: replace every `<artifact … id="<uuid>" …>body</artifact>` whose id is
 * in `artifactIds` (the version CHAIN's ids — refs carry the root id, chrome
 * may hand us a version row id) with `replacement`, across all text blocks.
 * Non-text blocks pass through verbatim.
 */
export function rewriteContentRemovingArtifactRefs(
  content: CxContentBlock[],
  artifactIds: ReadonlySet<string>,
  replacement: string,
): RefRewriteResult {
  const ids = new Set([...artifactIds].map((id) => id.toLowerCase()));
  let replacedCount = 0;
  const tagRe =
    /<artifact\b[^>]*\bid=["']([0-9a-f-]{36})["'][^>]*>\s*[\s\S]*?<\/artifact>/gi;

  const rewritten = content.map((block) => {
    if (!isTextBlock(block) || typeof block.text !== "string") return block;
    const nextText = block.text.replace(tagRe, (match, id: string) => {
      if (!ids.has(id.toLowerCase())) return match;
      replacedCount += 1;
      return replacement;
    });
    if (nextText === block.text) return block;
    return { ...block, text: nextText } as CxTextContent;
  });

  return { rewritten, replacedCount };
}

export type UnbindFailureReason =
  | "row_not_found"
  | "not_inert"
  | "ref_not_found"
  | "rewrite_failed";

export interface UnbindArtifactResult {
  ok: boolean;
  reason?: UnbindFailureReason;
  /** The rewritten content (mirror into the caller's store), or null on failure. */
  rewrittenContent: CxContentBlock[] | null;
  replacedCount: number;
  /** The markdown that replaced the ref(s), when computed. */
  markdown: string | null;
  errors: string[];
}

export interface UnbindArtifactParams {
  /** Any id in the artifact's version chain (root or version row). */
  artifactId: string;
  /** The source record's committed content blocks. */
  content: CxContentBlock[];
  /** The source surface's canonical rewrite writer (chat: cx_message_set_content). */
  persistRewrite: PersistRewrite;
}

export interface UnbindDeps {
  getById: (id: string) => Promise<CanvasArtifactRow | null>;
  getVersionHistory: (id: string) => Promise<CanvasArtifactRow[]>;
}

const defaultDeps: UnbindDeps = {
  getById: (id) => canvasArtifactService.getById(id),
  getVersionHistory: (id) => canvasArtifactService.getVersionHistory(id),
};

export async function unbindArtifact(
  params: UnbindArtifactParams,
  deps: UnbindDeps = defaultDeps,
): Promise<UnbindArtifactResult> {
  const { artifactId, content, persistRewrite } = params;
  const errors: string[] = [];
  const fail = (
    reason: UnbindFailureReason,
    markdown: string | null = null,
  ): UnbindArtifactResult => ({
    ok: false,
    reason,
    rewrittenContent: null,
    replacedCount: 0,
    markdown,
    errors,
  });

  // Resolve the version chain: export from the LATEST version; replace refs
  // carrying ANY chain id (the message tag holds the root id).
  const history = await deps.getVersionHistory(artifactId);
  const latest =
    history.length > 0
      ? history.reduce((max, r) => (r.version > max.version ? r : max), history[0]!)
      : await deps.getById(artifactId);
  if (!latest) {
    errors.push(`Artifact ${artifactId} not found`);
    return fail("row_not_found");
  }

  const chainIds = new Set<string>([artifactId, latest.id]);
  if (latest.parent_canvas_id) chainIds.add(latest.parent_canvas_id);
  for (const row of history) {
    chainIds.add(row.id);
    if (row.parent_canvas_id) chainIds.add(row.parent_canvas_id);
  }

  const replacement = buildUnbindReplacement(latest);
  if (!replacement.inert) {
    errors.push(
      `Unbinding a "${latest.type}" artifact would re-materialize on reload — this type stays edit/export-only until it has an inertness marker`,
    );
    return fail("not_inert", replacement.markdown);
  }

  const { rewritten, replacedCount } = rewriteContentRemovingArtifactRefs(
    content,
    chainIds,
    replacement.markdown,
  );
  if (replacedCount === 0) {
    errors.push(
      `No <artifact> reference to ${artifactId} found in the source content`,
    );
    return fail("ref_not_found", replacement.markdown);
  }

  const res = await persistRewrite(rewritten);
  if (!res.ok) {
    // The source keeps its ref — no half-state. The artifact row is untouched.
    errors.push(res.error ?? "source rewrite failed");
    return fail("rewrite_failed", replacement.markdown);
  }

  // Row deliberately KEPT (orphaned) — see the semantics block up top.
  return {
    ok: true,
    rewrittenContent: rewritten,
    replacedCount,
    markdown: replacement.markdown,
    errors,
  };
}
