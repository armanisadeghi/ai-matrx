"use client";

/**
 * useBase64Decoder
 *
 * Powers the "From Base64" tool inside Image Studio:
 *
 *   1. The user pastes a base64 string (raw or `data:` URL).
 *   2. The hook decodes synchronously, sniffs the MIME type, builds a Blob,
 *      and creates an object URL preview.
 *   3. Image natural dimensions are decoded asynchronously.
 *   4. On `save()`, the Blob is wrapped as a File and pushed through the
 *      universal file handler (`useFileUpload` with `createShareLink:
 *      true`) which returns a persistent share URL safe to paste into
 *      apps / notes / DBs.
 *
 * No backend hop for the decode step — base64 is already a browser-native
 * format. The only network call is the cloud upload, which goes through the
 * same path every other Image Studio feature uses.
 */

import { useCallback, useEffect, useRef, useState } from "react";
import {
  decodeBase64Image,
  decodeBlobDimensions,
  type DecodeResult,
  type SupportedExtension,
  type SupportedMimeType,
} from "../utils/decode-base64";
import { slugifyFilename } from "../utils/slugify-filename";
import { useFileUpload } from "@/features/files";
import { CloudFolders } from "@/features/files/utils/folder-conventions";

const DEFAULT_FILENAME_BASE = "decoded";
const DEFAULT_FOLDER_SEGMENT = "from-base64";

export interface DecodedImageState {
  blob: Blob;
  mimeType: SupportedMimeType;
  byteLength: number;
  extension: SupportedExtension;
  declaredMimeType: string | null;
  hadDataUrlPrefix: boolean;
  /** Object URL for instant preview / download. Revoked on next decode. */
  previewUrl: string;
  /** Image natural dimensions — decoded async. `null` while pending. */
  width: number | null;
  height: number | null;
}

export interface SaveResult {
  fileId: string;
  shareUrl: string;
  shareToken: string;
  filePath: string;
}

export interface UseBase64DecoderOptions {
  /** Sub-folder under `Images/Generated/`. Defaults to `from-base64`. */
  defaultFolder?: string;
}

export interface UseBase64DecoderResult {
  /** Raw input the user has typed or pasted. */
  input: string;
  setInput: (next: string) => void;

  /** Successful decode — null while empty/invalid. */
  decoded: DecodedImageState | null;
  /** Error from the last decode attempt — null on success or empty input. */
  decodeError: string | null;

  /** Suggested + user-editable filename base (no extension). */
  filenameBase: string;
  setFilenameBase: (next: string) => void;
  /** The full filename including the extension matching the decoded MIME. */
  fullFilename: string;

  /** Sub-folder under `Images/Generated/`. */
  folder: string;
  setFolder: (next: string) => void;

  /** Save lifecycle. */
  isSaving: boolean;
  saveError: string | null;
  saveResult: SaveResult | null;

  // Actions
  clear: () => void;
  pasteFromClipboard: () => Promise<void>;
  save: () => Promise<SaveResult | null>;
}

export function useBase64Decoder(
  options: UseBase64DecoderOptions = {},
): UseBase64DecoderResult {
  const { upload } = useFileUpload();

  const [input, setInputState] = useState("");
  const [decoded, setDecoded] = useState<DecodedImageState | null>(null);
  const [decodeError, setDecodeError] = useState<string | null>(null);
  const [filenameBase, setFilenameBaseState] = useState(DEFAULT_FILENAME_BASE);
  const [filenameTouched, setFilenameTouched] = useState(false);
  const [folder, setFolder] = useState<string>(
    options.defaultFolder ?? DEFAULT_FOLDER_SEGMENT,
  );
  const [isSaving, setIsSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [saveResult, setSaveResult] = useState<SaveResult | null>(null);

  // Track active object URL so we can revoke it when the input changes or
  // the component unmounts. Without this, a busy user pasting many strings
  // leaks an object URL each time.
  const previewUrlRef = useRef<string | null>(null);
  useEffect(() => {
    return () => {
      if (previewUrlRef.current) {
        URL.revokeObjectURL(previewUrlRef.current);
        previewUrlRef.current = null;
      }
    };
  }, []);

  // Run the decoder whenever the input changes. This is synchronous and
  // fast even for multi-MB strings (atob is C++); no debounce needed.
  useEffect(() => {
    // Always start by clearing any prior save state so the URL/copy buttons
    // don't linger from a previous decode.
    setSaveResult(null);
    setSaveError(null);

    if (!input.trim()) {
      revokeCurrentPreview();
      setDecoded(null);
      setDecodeError(null);
      return;
    }

    const result: DecodeResult = decodeBase64Image(input);
    if (result.ok === false) {
      const decodeErr = result.error;
      revokeCurrentPreview();
      setDecoded(null);
      setDecodeError(decodeErr);
      return;
    }

    revokeCurrentPreview();
    const previewUrl = URL.createObjectURL(result.blob);
    previewUrlRef.current = previewUrl;

    const next: DecodedImageState = {
      blob: result.blob,
      mimeType: result.mimeType,
      byteLength: result.byteLength,
      extension: result.extension,
      declaredMimeType: result.declaredMimeType,
      hadDataUrlPrefix: result.hadDataUrlPrefix,
      previewUrl,
      width: null,
      height: null,
    };
    setDecoded(next);
    setDecodeError(null);

    // Decode dimensions asynchronously. SVG / AVIF can be slow; don't block
    // the preview on it.
    let cancelled = false;
    void decodeBlobDimensions(result.blob).then((dim) => {
      if (cancelled || !dim) return;
      setDecoded((prev) =>
        prev && prev.previewUrl === previewUrl
          ? { ...prev, width: dim.width, height: dim.height }
          : prev,
      );
    });

    return () => {
      cancelled = true;
    };
  }, [input]);

  function revokeCurrentPreview() {
    if (previewUrlRef.current) {
      URL.revokeObjectURL(previewUrlRef.current);
      previewUrlRef.current = null;
    }
  }

  const setInput = useCallback((next: string) => {
    setInputState(next);
  }, []);

  const setFilenameBase = useCallback((next: string) => {
    setFilenameTouched(true);
    setFilenameBaseState(slugifyFilename(next));
  }, []);

  // Reset the filename whenever the user clears the input — but only if
  // they haven't manually edited it. A pasted-and-saved-and-pasted-again
  // workflow shouldn't re-overwrite a name they care about.
  useEffect(() => {
    if (!input.trim() && !filenameTouched) {
      setFilenameBaseState(DEFAULT_FILENAME_BASE);
    }
  }, [input, filenameTouched]);

  const clear = useCallback(() => {
    setInputState("");
    setFilenameBaseState(DEFAULT_FILENAME_BASE);
    setFilenameTouched(false);
    setSaveError(null);
    setSaveResult(null);
  }, []);

  const pasteFromClipboard = useCallback(async () => {
    if (typeof navigator === "undefined" || !navigator.clipboard?.readText) {
      setDecodeError(
        "Clipboard read isn't available in this browser — paste with ⌘/Ctrl-V instead.",
      );
      return;
    }
    try {
      const text = await navigator.clipboard.readText();
      if (text) setInputState(text);
    } catch (err) {
      const detail = err instanceof Error ? err.message : "permission denied";
      setDecodeError(`Could not read from clipboard: ${detail}`);
    }
  }, []);

  const save = useCallback(async (): Promise<SaveResult | null> => {
    if (!decoded) {
      setSaveError("Nothing to save — decode an image first.");
      return null;
    }
    setIsSaving(true);
    setSaveError(null);
    setSaveResult(null);
    try {
      const folderSegment = folder.trim().replace(/^\/+|\/+$/g, "");
      const folderPath = folderSegment
        ? `${CloudFolders.IMAGES_GENERATED}/${folderSegment}`
        : CloudFolders.IMAGES_GENERATED;

      const safeBase = slugifyFilename(filenameBase || DEFAULT_FILENAME_BASE);
      const filename = `${safeBase}.${decoded.extension}`;
      const file = new File([decoded.blob], filename, {
        type: decoded.mimeType,
      });

      const normalized = await upload(
        { kind: "file", file },
        {
          folderPath,
          visibility: "private",
          createShareLink: true,
          shareLinkPermissionLevel: "read",
          metadata: {
            source: "image-studio-from-base64",
            mime_type: decoded.mimeType,
            declared_mime_type: decoded.declaredMimeType,
            had_data_url_prefix: decoded.hadDataUrlPrefix,
            width: decoded.width,
            height: decoded.height,
          },
        },
      );

      if (!normalized.fileId || !normalized.shareToken) {
        throw new Error("Upload returned no fileId/shareToken");
      }

      const next: SaveResult = {
        fileId: normalized.fileId,
        shareUrl: normalized.url ?? `/share/${normalized.shareToken}`,
        shareToken: normalized.shareToken,
        filePath: `${folderPath}/${filename}`,
      };
      setSaveResult(next);
      return next;
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Upload failed";
      setSaveError(msg);
      return null;
    } finally {
      setIsSaving(false);
    }
  }, [decoded, filenameBase, folder, upload]);

  const fullFilename = decoded
    ? `${slugifyFilename(filenameBase || DEFAULT_FILENAME_BASE)}.${decoded.extension}`
    : `${slugifyFilename(filenameBase || DEFAULT_FILENAME_BASE)}.png`;

  return {
    input,
    setInput,
    decoded,
    decodeError,
    filenameBase,
    setFilenameBase,
    fullFilename,
    folder,
    setFolder,
    isSaving,
    saveError,
    saveResult,
    clear,
    pasteFromClipboard,
    save,
  };
}
