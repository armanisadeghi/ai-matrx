/**
 * An image LINK — the one place the resource-picker family decides what a
 * pasted link is and turns an image link into a File the canonical upload
 * pipeline can take (`InlineUploadArea`'s `imageLinks`, the Source input's
 * Image tile). `ImageUrlResourcePicker` validates through the same functions.
 *
 * Browsers only let a page copy an image another site serves when that site
 * allows it (CORS); when it does not, `imageLinkToFile` says so with the
 * remedy (save it, then upload it) — never a silent failure.
 */

import { parseYouTubeUrl } from "@/lib/media/youtube";

// Normalize a URL by prepending https:// if no protocol is present
export function normalizeUrl(url: string): string {
  const trimmed = url.trim();
  return /^https?:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`;
}

// Detect URL type — tolerates bare domains (no protocol)
export function detectUrlType(url: string): "youtube" | "image" | "webpage" | "file" {
  try {
    const urlObj = new URL(normalizeUrl(url));

    // ONE canonical YouTube detector — `lib/media/youtube.ts`.
    if (parseYouTubeUrl(urlObj.toString())) {
      return "youtube";
    }

    const imageExtensions = [
      ".jpg",
      ".jpeg",
      ".png",
      ".gif",
      ".webp",
      ".svg",
      ".bmp",
      ".ico",
    ];
    const pathname = urlObj.pathname.toLowerCase();
    if (imageExtensions.some((ext) => pathname.endsWith(ext))) {
      return "image";
    }

    const fileExtensions = [
      ".pdf",
      ".doc",
      ".docx",
      ".xls",
      ".xlsx",
      ".ppt",
      ".pptx",
      ".txt",
      ".csv",
      ".json",
      ".xml",
      ".zip",
    ];
    if (fileExtensions.some((ext) => pathname.endsWith(ext))) {
      return "file";
    }

    return "webpage";
  } catch {
    return "webpage";
  }
}

// Validate if URL is accessible and is an image
export async function validateImageUrl(
  url: string,
): Promise<{
  isValid: boolean;
  type?: string;
  error?: string;
  suggestedType?: "webpage" | "youtube" | "file_url";
}> {
  try {
    const normalized = normalizeUrl(url);
    const urlObj = new URL(normalized);

    // Detect URL type
    const detectedType = detectUrlType(normalized);

    if (detectedType === "youtube") {
      return {
        isValid: false,
        error: "That is a YouTube link, not an image.",
        suggestedType: "youtube",
      };
    }

    if (detectedType === "file") {
      return {
        isValid: false,
        error: "That is a file link, not an image.",
        suggestedType: "file_url",
      };
    }

    if (detectedType === "webpage") {
      return {
        isValid: false,
        error: "That is a web page, not an image.",
        suggestedType: "webpage",
      };
    }

    // Check if URL ends with common image extensions
    const imageExtensions = [
      ".jpg",
      ".jpeg",
      ".png",
      ".gif",
      ".webp",
      ".svg",
      ".bmp",
      ".ico",
    ];
    const pathname = urlObj.pathname.toLowerCase();
    const hasImageExtension = imageExtensions.some((ext) =>
      pathname.endsWith(ext),
    );

    if (!hasImageExtension) {
      return {
        isValid: false,
        error: "That link is not an image (.jpg, .png, .gif, .webp, .svg).",
        suggestedType: "webpage",
      };
    }

    // Attempt to determine MIME type from extension
    let mimeType = "image/jpeg"; // default
    if (pathname.endsWith(".png")) mimeType = "image/png";
    else if (pathname.endsWith(".gif")) mimeType = "image/gif";
    else if (pathname.endsWith(".webp")) mimeType = "image/webp";
    else if (pathname.endsWith(".svg")) mimeType = "image/svg+xml";

    return { isValid: true, type: mimeType };
  } catch {
    return { isValid: false, error: "That is not a link." };
  }
}

/** The failure a person sees when an image link cannot become a file. */
export class ImageLinkError extends Error {}

function fileNameFromUrl(url: string, mime: string): string {
  try {
    const last = new URL(url).pathname.split("/").filter(Boolean).pop();
    if (last && /\.[a-z0-9]{2,5}$/i.test(last)) return decodeURIComponent(last);
  } catch {
    /* fall through to a generic name */
  }
  const ext = mime.split("/")[1]?.replace("svg+xml", "svg") || "jpg";
  return `image.${ext}`;
}

/**
 * Fetch an image link into a File. Refuses a link that is not an image, a
 * site that will not share its bytes, and a response that is not an image —
 * each with a sentence that names the remedy.
 */
export async function imageLinkToFile(
  raw: string,
  fetchImpl: typeof fetch = fetch,
): Promise<File> {
  const url = normalizeUrl(raw);
  const checked = await validateImageUrl(url);
  if (!checked.isValid) throw new ImageLinkError(checked.error ?? "That is not an image link.");
  let res: Response;
  try {
    res = await fetchImpl(url);
  } catch {
    throw new ImageLinkError("That site does not share its images. Save the image, then upload it.");
  }
  if (!res.ok) throw new ImageLinkError(`That image could not be fetched (${res.status}). Check the link.`);
  const blob = await res.blob();
  const mime = blob.type || checked.type || "";
  if (!mime.startsWith("image/")) throw new ImageLinkError("That link did not return an image.");
  return new File([blob], fileNameFromUrl(url, mime), { type: mime });
}
