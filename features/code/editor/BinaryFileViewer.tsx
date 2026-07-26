"use client";

/**
 * features/code/editor/BinaryFileViewer.tsx
 *
 * Replaces Monaco for tabs that can't be rendered as text — images,
 * videos, audio, PDFs, and any "generic" binary the adapter happens to
 * have (archives, sqlite, office docs, etc.).
 *
 * It's deliberately built on top of the cloud-files preview primitives
 * (`ImagePreview`, `VideoPreview`, `AudioPreview`, `GenericPreview`) so
 * we get one preview UX across the app instead of two. Those primitives
 * accept either a URL or a fileId; we use the URL variants so the viewer
 * can stay decoupled from the cloud-files Redux slice.
 *
 * Bytes are pulled lazily via `filesystem.download(path)` (or a base64
 * fallback for adapters that only ship `readFileBinary`). The resulting
 * `blob:` URL is owned by this component and revoked on unmount or path
 * change — base64 buffers never enter Redux, so nothing pinned in the
 * tabs slice ever holds a multi-megabyte image string in memory.
 *
 * For the `generic` fallback (unrecognized files) the viewer also runs a
 * lightweight byte sniff on mount. When the bytes look printable —
 * either valid UTF-8 or >=95% printable ASCII — the GenericPreview
 * surfaces a prominent "View as text" button. Clicking it converts the
 * tab from `binary-preview` to a normal Monaco-backed editor tab via
 * `convertTabToEditor`, which is how files like `.bashrc`, `Makefile`,
 * `authorized_keys`, etc. that the registry didn't recognize still end
 * up being readable. The same button is offered with weaker phrasing
 * even when the sniff fails, so manual override always works.
 */

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ComponentType,
} from "react";
import dynamic from "next/dynamic";
import { AlertCircle, Download as DownloadIcon, Loader2 } from "lucide-react";
import {
  getFilePreviewProfile,
  sniffTextBytes,
  type PreviewKind,
  type TextSniffResult,
} from "@/features/files/utils/file-types";
import { useAppDispatch } from "@/lib/redux/hooks";
import { useCodeWorkspace } from "../CodeWorkspaceProvider";
import { convertTabToEditor } from "../redux/tabsSlice";
import { languageFromFilename } from "../styles/file-icon";
import type { EditorFile } from "../types";
import type { FilesystemAdapter } from "../adapters/FilesystemAdapter";
import type { BinaryFilePdfPreviewProps } from "./BinaryFilePdfPreview";

// Shared loading state for every code-split previewer in this viewer. Keeps
// the file under 1 KB of preview-related JSX so that opening a sandbox tab
// for a *non-binary* file never pulls in any preview chunks at all.
function PreviewerSkeleton() {
  return (
    <div className="flex h-full w-full items-center justify-center">
      <Loader2 className="w-5 h-5 animate-spin text-muted-foreground" />
    </div>
  );
}

/**
 * The cloud-files PDF previewer is fileId-coupled (`useFileBlob(fileId)`),
 * so we can't reuse it here. We ship our own thin react-pdf wrapper that
 * accepts a Blob/URL directly. Lazy-loaded so non-PDF previews never pay
 * the ~400KB react-pdf + worker bundle cost.
 */
const SandboxPdfPreview = dynamic(
  () => import("./BinaryFilePdfPreview").then((m) => m.BinaryFilePdfPreview),
  {
    ssr: false,
    loading: PreviewerSkeleton,
  },
) as ComponentType<BinaryFilePdfPreviewProps>;

// All preview primitives are code-split so this viewer's base chunk
// stays empty until a tab actually needs a specific renderer. Each
// chunk is shared with the cloud-files FilePreview, so once one
// surface has loaded e.g. ImagePreview, every other surface in the
// app uses the cached module instantly.
const ImagePreview = dynamic(
  () =>
    import("@/features/files/components/core/FilePreview/previewers/ImagePreview"),
  { ssr: false, loading: PreviewerSkeleton },
);
const VideoPreview = dynamic(
  () =>
    import("@/features/files/components/core/FilePreview/previewers/VideoPreview"),
  { ssr: false, loading: PreviewerSkeleton },
);
const AudioPreview = dynamic(
  () =>
    import("@/features/files/components/core/FilePreview/previewers/AudioPreview"),
  { ssr: false, loading: PreviewerSkeleton },
);
const GenericPreview = dynamic(
  () =>
    import("@/features/files/components/core/FilePreview/previewers/GenericPreview"),
  { ssr: false, loading: PreviewerSkeleton },
);

interface BinaryFileViewerProps {
  tab: EditorFile;
  className?: string;
}

interface BinaryState {
  loading: boolean;
  error: string | null;
  url: string | null;
  blob: Blob | null;
  size: number | null;
  /**
   * Cached byte sniff result for the loaded blob — populated only for
   * the `generic` preview kind. Other kinds (image / video / pdf) skip
   * sniffing because their previewers know exactly what to do.
   */
  textSniff: TextSniffResult | null;
}

export function BinaryFileViewer({ tab, className }: BinaryFileViewerProps) {
  const { filesystem } = useCodeWorkspace();
  const dispatch = useAppDispatch();

  const profile = useMemo(
    () => getFilePreviewProfile(tab.name, tab.mime ?? null, null),
    [tab.name, tab.mime],
  );

  const [state, setState] = useState<BinaryState>({
    loading: true,
    error: null,
    url: null,
    blob: null,
    size: null,
    textSniff: null,
  });
  const [converting, setConverting] = useState(false);

  // The viewer is the sole owner of the blob URL it creates. We revoke
  // on unmount AND when the path changes — without that, navigating
  // between binary tabs would leak `blob:` allocations until the page
  // refreshed.
  const lastUrlRef = useRef<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setState({
      loading: true,
      error: null,
      url: null,
      blob: null,
      size: null,
      textSniff: null,
    });
    if (lastUrlRef.current) {
      URL.revokeObjectURL(lastUrlRef.current);
      lastUrlRef.current = null;
    }

    void (async () => {
      try {
        const blob = await fetchBinary(filesystem, tab.path, profile.mime);
        if (cancelled) return;
        const url = URL.createObjectURL(blob);
        lastUrlRef.current = url;

        // Only sniff for the `generic` fallback — for image / video /
        // audio / pdf the previewer already knows what to render and
        // sniffing would be wasted work (and confusing if a JPEG
        // happens to lead with printable header bytes).
        let textSniff: TextSniffResult | null = null;
        if (profile.previewKind === "generic") {
          try {
            const headBlob = blob.slice(
              0,
              Math.min(blob.size, SNIFF_SAMPLE_BYTES),
            );
            const headBuf = await headBlob.arrayBuffer();
            textSniff = sniffTextBytes(new Uint8Array(headBuf));
          } catch {
            // Sniffing is best-effort — never block the previewer on it.
            textSniff = null;
          }
        }

        setState({
          loading: false,
          error: null,
          url,
          blob,
          size: blob.size,
          textSniff,
        });
      } catch (err) {
        if (cancelled) return;
        setState({
          loading: false,
          error: err instanceof Error ? err.message : String(err),
          url: null,
          blob: null,
          size: null,
          textSniff: null,
        });
      }
    })();

    return () => {
      cancelled = true;
      if (lastUrlRef.current) {
        URL.revokeObjectURL(lastUrlRef.current);
        lastUrlRef.current = null;
      }
    };
  }, [filesystem, tab.path, profile.mime, profile.previewKind]);

  const handleDownload = useCallback(() => {
    if (!state.blob) return;
    const url = URL.createObjectURL(state.blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = tab.name;
    document.body.appendChild(a);
    a.click();
    a.remove();
    // The temporary anchor URL is independent from `state.url`; revoke
    // it on the next tick so the download has a chance to start.
    setTimeout(() => URL.revokeObjectURL(url), 0);
  }, [state.blob, tab.name]);

  // Reads the blob as text (UTF-8 with replacement characters for any
  // bad sequences — never throws) and dispatches `convertTabToEditor`
  // so the tab swaps from `binary-preview` to `editor`. Once Redux
  // updates, `EditorArea` swaps `<BinaryFileViewer>` for `<MonacoEditor>`
  // automatically — the user sees their text without reloading.
  const handleViewAsText = useCallback(async () => {
    if (!state.blob || converting) return;
    setConverting(true);
    try {
      const text = await blobToText(state.blob);
      dispatch(
        convertTabToEditor({
          id: tab.id,
          content: text,
          language: languageFromFilename(tab.name),
        }),
      );
    } catch {
      // Fall back: if the blob can't be decoded, leave the binary view in
      // place rather than presenting an empty editor.
    } finally {
      setConverting(false);
    }
  }, [state.blob, converting, dispatch, tab.id, tab.name]);

  if (state.loading) {
    return (
      <div className={loadingClass(className)}>
        <Loader2 className="w-5 h-5 animate-spin text-muted-foreground mr-2" />
        <span className="text-sm text-muted-foreground">
          Loading {tab.name}…
        </span>
      </div>
    );
  }

  if (state.error) {
    return (
      <div className={errorClass(className)} role="alert">
        <div className="flex h-12 w-12 items-center justify-center rounded-full bg-destructive/10">
          <AlertCircle className="h-6 w-6 text-destructive" />
        </div>
        <div className="space-y-1 text-center max-w-md">
          <h3 className="text-sm font-semibold">
            Couldn&apos;t load this file
          </h3>
          <p className="text-xs text-muted-foreground break-words">
            {state.error}
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className={containerClass(className)}>
      <BinaryPreviewer
        kind={profile.previewKind}
        url={state.url}
        blob={state.blob}
        mime={profile.mime}
        fileName={tab.name}
        fileSize={state.size}
        textSniff={state.textSniff}
        onDownload={handleDownload}
        onViewAsText={state.blob ? handleViewAsText : undefined}
        viewAsTextBusy={converting}
      />
    </div>
  );
}

interface PreviewerProps {
  kind: PreviewKind;
  url: string | null;
  blob: Blob | null;
  mime: string;
  fileName: string;
  fileSize: number | null;
  textSniff: TextSniffResult | null;
  onDownload: () => void;
  onViewAsText?: () => void;
  viewAsTextBusy?: boolean;
}

function BinaryPreviewer({
  kind,
  url,
  blob,
  mime,
  fileName,
  fileSize,
  textSniff,
  onDownload,
  onViewAsText,
  viewAsTextBusy,
}: PreviewerProps) {
  switch (kind) {
    case "image":
    // SVG normally flows through `useOpenFile`'s text path and never reaches
    // this viewer. If something does route an SVG here, the signed-URL
    // `<img>` rendering still works fine — fall through to ImagePreview.
    case "svg":
      return (
        <ImagePreview url={url} fileName={fileName} className="h-full w-full" />
      );
    case "video":
      return (
        <VideoPreview url={url} mimeType={mime} className="h-full w-full" />
      );
    case "audio":
      return (
        <AudioPreview
          url={url}
          fileName={fileName}
          mimeType={mime}
          className="h-full w-full"
        />
      );
    case "pdf":
      return blob ? (
        <SandboxPdfPreview
          blob={blob}
          url={url}
          fileName={fileName}
          className="h-full w-full"
        />
      ) : null;
    default: {
      // Pick the user-facing message based on the byte sniff. A high-
      // confidence text sniff means the message becomes a positive
      // ("This file looks like text") with the button as the obvious
      // primary action; a failed sniff hides the message but still
      // offers the manual override so genuinely-binary edge cases stay
      // workable.
      const looksText = textSniff?.isText === true;
      const message = looksText
        ? "This file looks like text. Open it in the editor?"
        : textSniff
          ? "This file may be binary. View as text to inspect anyway."
          : undefined;
      return (
        <GenericPreview
          fileName={fileName}
          fileSize={fileSize}
          onDownload={onDownload}
          onViewAsText={onViewAsText}
          viewAsTextLabel={looksText ? "View as text" : "Try as text"}
          viewAsTextPrimary={looksText}
          viewAsTextBusy={viewAsTextBusy}
          message={message}
          className="h-full w-full"
        />
      );
    }
  }
}

// ─── helpers ────────────────────────────────────────────────────────────────

/**
 * How many bytes of the head of a generic file we sample to decide
 * whether it's text-shaped. 8KB is plenty: covers UTF-8 BOMs, source
 * files of any size, and most config-file headers, while staying small
 * enough that even a 1GB blob.slice() is cheap.
 */
const SNIFF_SAMPLE_BYTES = 8192;

const containerClass = (extra?: string) =>
  `flex h-full w-full overflow-hidden bg-background ${extra ?? ""}`;
const loadingClass = (extra?: string) =>
  `flex h-full w-full items-center justify-center bg-background ${extra ?? ""}`;
const errorClass = (extra?: string) =>
  `flex h-full w-full flex-col items-center justify-center gap-3 p-6 bg-background ${extra ?? ""}`;

/**
 * Decode a Blob as UTF-8 text without throwing on bad sequences. Replaces
 * any invalid bytes with U+FFFD so the user can still see most of a
 * mostly-textual file even if a single byte is mangled.
 */
async function blobToText(blob: Blob): Promise<string> {
  // Modern browsers expose `Blob.text()`, which uses UTF-8 with replacement
  // and matches what the editor will render. Older runtimes (jsdom in
  // tests) sometimes lack it — fall back to FileReader.
  if (typeof blob.text === "function") {
    return blob.text();
  }
  const buffer = await blob.arrayBuffer();
  return new TextDecoder("utf-8", { fatal: false }).decode(buffer);
}

/**
 * Pulls the file's bytes through whatever the adapter exposes, in
 * preference order:
 *
 *   1. `download(path)` — already returns a Blob (Sandbox adapter).
 *   2. `readFileBinary(path)` — base64 fallback (any adapter that
 *      bothers to advertise binary support).
 *   3. `readFile(path)` — last resort. Only safe for actually-textual
 *      files; we still wrap the string into a Blob so the previewer
 *      pipeline stays uniform. (Mock adapter takes this branch.)
 *
 * The resulting Blob is tagged with `profileMime` so previewers that
 * care about MIME (Video, Audio, PDF) get a meaningful type instead of
 * the empty default.
 */
async function fetchBinary(
  filesystem: FilesystemAdapter,
  path: string,
  profileMime: string,
): Promise<Blob> {
  if (typeof filesystem.download === "function") {
    const raw = await filesystem.download(path);
    return raw.type ? raw : new Blob([raw], { type: profileMime });
  }
  if (typeof filesystem.readFileBinary === "function") {
    const base64 = await filesystem.readFileBinary(path);
    const bytes = base64ToUint8Array(base64);
    const buffer = new ArrayBuffer(bytes.byteLength);
    new Uint8Array(buffer).set(bytes);
    return new Blob([buffer], { type: profileMime });
  }
  const text = await filesystem.readFile(path);
  return new Blob([text], { type: profileMime });
}

function base64ToUint8Array(base64: string): Uint8Array {
  // `window.atob` is strict about whitespace; PEM / MIME base64 wraps
  // lines at 64 chars and would blow up here without the strip.
  const cleaned = base64.replace(/\s+/g, "");
  const binary =
    typeof window !== "undefined"
      ? window.atob(cleaned)
      : Buffer.from(cleaned, "base64").toString("binary");
  const out = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) out[i] = binary.charCodeAt(i);
  return out;
}

// `DownloadIcon` re-export so consumers that wrap this viewer in a custom
// chrome can reuse the same icon without pulling lucide-react themselves.
export { DownloadIcon };
