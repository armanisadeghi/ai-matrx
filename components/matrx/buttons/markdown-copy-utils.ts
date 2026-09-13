import {
  createBrowserTransport,
  createDraft,
  capture,
  normalizeTransferJson,
  serialize,
  serializeMarkdownRich,
  type Payload,
} from "@ai-matrx/kit/content-transfer";
import { removeThinkingContent } from "@ai-matrx/print/markdown";
import { showManualCopy } from "@/components/dialogs/clipboard-fallback/manualCopyOpener";
import { toast } from "@/lib/toast";

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
    if (capturedText !== undefined) showManualCopy({ text: capturedText });
    options.onError?.(error);
    if (!options.onError)
      toast.error(
        error instanceof Error ? error.message : "Could not copy content",
      );
    return false;
  }
}
