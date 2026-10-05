import {
  createBrowserTransport,
  createDraft,
  capture,
  normalizeTransferJson,
  serialize,
  serializeMarkdownRich,
  type Payload,
} from "@ai-matrx/kit/content-transfer";
import { showManualCopy } from "@/components/dialogs/clipboard-fallback/manualCopyOpener";
import { toast } from "@/lib/toast";
import { getSessionKnob } from "@/lib/scoped-config/sessionKnob";
import { markdownToReadableText } from "./markdown-readable-text";
// The print seam — the kind sandbox frame aliases this module (no KaTeX in the frame).
import { formattedCopyHtml, removeThinkingContent } from "@/components/matrx/buttons/markdown-copy-html";

interface CopyOptions {
  isMarkdown?: boolean;
  formatForGoogleDocs?: boolean;
  formatForWordPress?: boolean;
  formatJson?: boolean;
  showHtmlPreview?: boolean;
  includeThinking?: boolean;
  onSuccess?: () => void;
  onError?: (err: unknown) => void;
  onShowHtmlPreview?: (
    html: string,
  ) => boolean | void | Promise<boolean | void>;
}
/** Compatibility port for command-based callers; Alchemy owns serialization and clipboard delivery. */
export async function copyToClipboard(
  content: unknown,
  options: CopyOptions = {},
): Promise<boolean> {
  let capturedText: string | undefined;
  try {
    let payload: Payload;
    if (typeof content === "string") {
      const text = options.includeThinking
        ? content
        : removeThinkingContent(content);
      payload = { kind: options.isMarkdown ? "markdown" : "text", text };
      if (options.formatJson !== false) {
        let parsed: unknown;
        try {
          parsed = JSON.parse(text);
        } catch {
          parsed = undefined;
        }
        if (parsed !== undefined)
          payload = { kind: "json", value: normalizeTransferJson(parsed) };
      }
    } else {
      payload = { kind: "json", value: normalizeTransferJson(content) };
    }
    const signal = new AbortController().signal;
    const { snapshot } = await capture(payload, signal);
    const draft = createDraft(snapshot);
    const rich =
      payload.kind === "markdown" &&
      (options.formatForGoogleDocs || options.formatForWordPress);
    const artifact = rich
      ? await serializeMarkdownRich(draft)
      : serialize(
          draft,
          payload.kind === "json"
            ? options.formatJson === false
              ? "compact-json"
              : "json"
            : "plain",
        );
    capturedText = artifact.plainText;
    if (options.showHtmlPreview) {
      if (!options.onShowHtmlPreview || !artifact.html)
        throw new Error(
          "HTML preview requires a formatted Markdown source and a preview callback.",
        );
      const previewDelivered = await options.onShowHtmlPreview(artifact.html);
      // The nested HTML delivery owns its own fallback. Returning false avoids
      // catching it here and reopening manual copy with source Markdown.
      if (previewDelivered === false) return false;
      options.onSuccess?.();
      return true;
    }
    const outcome = await createBrowserTransport().copy(artifact, signal);
    if (outcome.status === "success") {
      options.onSuccess?.();
      return true;
    }
    if (outcome.status === "degraded") {
      toast.info(`Copied as plain text: ${outcome.reason}`);
      return false;
    }
    if (outcome.status === "cancelled") return false;
    throw new Error(outcome.message);
  } catch (error) {
    if (capturedText !== undefined) {
      // The person now has the text in front of them, selected: the copy is
      // theirs. Any error toast beside that dialog — the raw DOMException
      // ("Failed to execute 'writeText'…") or a caller's "Failed to copy" —
      // is noise about a failure already handled (PB-06 W-57).
      showManualCopy({ text: capturedText });
      return false;
    }
    options.onError?.(error);
    if (!options.onError)
      toast.error(
        error instanceof Error ? error.message : "Could not copy content",
      );
    return false;
  }
}

// ═══════════════════════════════════════════════════════════════════════════
// THE RICH-CONTENT COPY (Arman, 2026-10-04: "it's not giving me a super easy
// way to get either the version with markdown markup or not").
//
// Every copy of rich content — answer bars, ⋯ menus, the selection toolbar,
// notes, the studio, documents, tool cards — goes through `copyRichContent`.
// Three flavors, each one click away:
//
//   "default"   the single Copy click. text/html = the formatted document (Docs,
//               Gmail, Word paste it formatted) AND text/plain = the knob's
//               flavor (`copy.default_flavor`, default markdown — a plain
//               field gets markdown, like ChatGPT and Claude.ai).
//   "markdown"  "Copy markdown": text/plain only, the markup kept.
//   "text"      "Copy text": text/plain only, readable — no markup, lists as
//               "• ", links as "text (url)", tables tab-separated, code kept.
//
// Code blocks keep their own raw copy. Guard: every rich-content host routes
// here — `components/matrx/buttons/__tests__/rich-copy-hosts.census.test.ts`.
// ═══════════════════════════════════════════════════════════════════════════

export type CopyFlavor = "default" | "markdown" | "text";
export { markdownToReadableText };

/** The knob that decides what a single Copy click puts in a plain field. */
export const COPY_DEFAULT_FLAVOR_KNOB = { feature: "copy", key: "default_flavor" } as const;

/** The plain-text flavor of a single Copy click for this session ("markdown" until the knob answers). */
export function defaultCopyFlavor(): "markdown" | "text" {
  return getSessionKnob(COPY_DEFAULT_FLAVOR_KNOB) === "text" ? "text" : "markdown";
}

export interface RichCopyOptions {
  /** Keep `<thinking>` / reasoning blocks (default: removed). */
  includeThinking?: boolean;
  /** Toast on success: a label, or false for none. Default: the flavor's label. */
  toast?: string | false;
}

const FLAVOR_TOAST: Record<CopyFlavor, string> = {
  default: "Copied",
  markdown: "Markdown copied",
  text: "Text copied",
};

/** The bytes a flavor writes — pure enough to test; the HTML is loaded at click time. */
export function richCopyPlainText(markdown: string, flavor: CopyFlavor, defaultFlavor: "markdown" | "text" = "markdown"): string {
  const plainFlavor = flavor === "default" ? defaultFlavor : flavor;
  return plainFlavor === "text" ? markdownToReadableText(markdown) : markdown;
}

/**
 * Write a clipboard item. `html` may be a promise: the item is created inside
 * the click (Safari requires it), the browser waits for the bytes.
 */
export async function writeClipboardFlavors(plain: string, html?: Promise<string> | string): Promise<boolean> {
  if (typeof navigator === "undefined" || !navigator.clipboard) {
    showManualCopy({ text: plain });
    return false;
  }
  try {
    if (html !== undefined && typeof ClipboardItem !== "undefined" && navigator.clipboard.write) {
      const htmlBlob = Promise.resolve(html).then((h) => new Blob([h], { type: "text/html" }));
      await navigator.clipboard.write([
        new ClipboardItem({ "text/html": htmlBlob, "text/plain": new Blob([plain], { type: "text/plain" }) }),
      ]);
      return true;
    }
    await navigator.clipboard.writeText(plain);
    return true;
  } catch (error) {
    // A rich write can be refused (focus moved, an old engine): try the plain
    // flavor before handing the person the text to copy themselves.
    try {
      await navigator.clipboard.writeText(plain);
      if (html !== undefined) toast.info("Copied without formatting: this browser refused the formatted copy.");
      return true;
    } catch {
      console.warn("[copy] the clipboard refused the write; showing the text to copy by hand:", error);
      showManualCopy({ text: plain });
      return false;
    }
  }
}

/** THE copy of rich content. Returns true when the clipboard holds it. */
export async function copyRichContent(markdown: string, flavor: CopyFlavor = "default", options: RichCopyOptions = {}): Promise<boolean> {
  const source = options.includeThinking ? markdown : removeThinkingContent(markdown);
  const plain = richCopyPlainText(source, flavor, defaultCopyFlavor());
  const ok = await writeClipboardFlavors(plain, flavor === "default" ? formattedCopyHtml(source) : undefined);
  const label = options.toast === undefined ? FLAVOR_TOAST[flavor] : options.toast;
  if (ok && label) toast.success(label);
  return ok;
}
