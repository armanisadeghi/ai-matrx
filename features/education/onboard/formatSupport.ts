// features/education/onboard/formatSupport.ts
//
// THE single source of truth for "what can the Study Kit front door ingest, and
// how?". Both the ingest engine (`useIngest`) and the hero UI (`StartHero`) read
// this one classifier so the file picker's `accept` list, the drop-zone hint,
// the per-file status line, and the actual ingest branch can NEVER drift apart.
//
// Honesty is the whole point: a format we can't read yet is classified as such
// with a plain-English `note`, so the UI can say "not supported yet" up front and
// the ingest can throw that same note as a loud error — never a fake success.
//
// Each supported kind maps to an EXISTING platform pipeline (see `useIngest`):
//   pdf/image  → the PDF-extractor OCR service (`streamPdfExtractText`)
//   audio/video→ the Groq-Whisper transcription route (`transcribeSignedUrl`)
//   text       → read inline
// Unsupported kinds (office, heic, unknown) are gated, not routed.
//
// URLs are classified the same way (`describeUrlSupport`): a generic web page →
// the scraper; a YouTube link → the REAL spoken transcript (aidream's
// transcription agent, `fetchYouTubeTranscript`) — no longer an honest-gate
// "page text only" label.

/** How the front door will read a given file. */
export type IngestFileKind =
  | "pdf"
  | "image"
  | "audio"
  | "video"
  | "text"
  | "heic" // image we genuinely can't decode server-side yet
  | "office" // docx/pptx/xlsx — no extractor wired yet
  | "unknown";

const PDF_EXT = /\.pdf$/i;
const IMAGE_EXT = /\.(png|jpe?g|webp|gif|bmp|tiff?)$/i;
const HEIC_EXT = /\.(heic|heif)$/i;
const AUDIO_EXT = /\.(mp3|wav|m4a|aac|ogg|oga|flac|opus|weba)$/i;
const VIDEO_EXT = /\.(mp4|m4v|mov|webm|mkv|avi)$/i;
const OFFICE_EXT = /\.(docx?|pptx?|xlsx?|odt|odp|ods|pages|key|numbers)$/i;
const TEXT_EXT = /\.(txt|md|markdown|csv|tsv|json|html?|rtf|log|ya?ml)$/i;

/**
 * Classify a dropped/picked file into the ONE kind that decides its ingest
 * branch. Extension is checked before the (often unreliable) MIME type so a
 * `.heic` a browser labels `image/*` is still caught, and so `video/mp4`
 * containers with an audio track land on the video branch. Order matters:
 * HEIC and Office are checked before the generic image/`text` fallbacks.
 */
export function classifyIngestFile(file: File): IngestFileKind {
  const name = file.name || "";
  const mime = (file.type || "").toLowerCase();

  if (PDF_EXT.test(name) || mime === "application/pdf") return "pdf";
  if (HEIC_EXT.test(name) || mime === "image/heic" || mime === "image/heif")
    return "heic";
  if (OFFICE_EXT.test(name)) return "office";
  if (IMAGE_EXT.test(name) || mime.startsWith("image/")) return "image";
  if (AUDIO_EXT.test(name) || mime.startsWith("audio/")) return "audio";
  if (VIDEO_EXT.test(name) || mime.startsWith("video/")) return "video";
  if (TEXT_EXT.test(name) || mime.startsWith("text/")) return "text";
  return "unknown";
}

/** How the front door reads a pasted URL: a generic web page vs a YouTube link. */
export type IngestUrlKind = "youtube" | "url";

const YOUTUBE_URL_RE = /(?:youtube\.com|youtu\.be)/i;

/** Classify a URL into the ONE kind that decides its ingest branch in `useIngest`. */
export function classifyIngestUrl(url: string): IngestUrlKind {
  return YOUTUBE_URL_RE.test(url) ? "youtube" : "url";
}

export interface UrlIngestSupport {
  kind: IngestUrlKind;
  /** True when the front door can turn this URL into real study text. */
  supported: boolean;
  /** The honest one-liner the hero shows under the link input. */
  note: string;
}

/**
 * Describe how a URL will be ingested — the honest status shown under the link
 * field. BOTH kinds are fully supported: a generic page is read by the scraper;
 * a YouTube link is transcribed to the REAL spoken transcript by aidream's
 * transcription agent (0cd86da2), not scraped page HTML. If a specific video
 * has no captions/speech, `useIngest` still fails honestly at ingest time.
 */
export function describeUrlSupport(url: string): UrlIngestSupport {
  const kind = classifyIngestUrl(url);
  if (kind === "youtube") {
    return {
      kind,
      supported: true,
      note: "YouTube — we'll transcribe what's actually said in the video.",
    };
  }
  return {
    kind,
    supported: true,
    note: "We'll read the page and ground your kit in its content.",
  };
}

export interface IngestSupport {
  kind: IngestFileKind;
  /** True when the front door can actually turn this file into study text. */
  supported: boolean;
  /** One honest line for the UI (and, for unsupported kinds, the thrown error). */
  note: string;
}

/**
 * Describe how (or whether) a file will be ingested — the honest per-format
 * status the hero shows the moment a file is chosen, and the exact message the
 * ingest throws when a file can't be read. One string table, one truth.
 */
export function describeIngestSupport(file: File): IngestSupport {
  const kind = classifyIngestFile(file);
  switch (kind) {
    case "pdf":
      return {
        kind,
        supported: true,
        note: "PDF — we'll extract the text (OCR if it's a scan).",
      };
    case "image":
      return {
        kind,
        supported: true,
        note: "Image — we'll read the text with OCR (best for printed pages, slides, and screenshots).",
      };
    case "audio":
      return {
        kind,
        supported: true,
        note: "Audio — we'll transcribe the speech to text.",
      };
    case "video":
      return {
        kind,
        supported: true,
        note: "Video — we'll transcribe the spoken audio to text.",
      };
    case "text":
      return { kind, supported: true, note: "Text — we'll read it directly." };
    case "heic":
      return {
        kind,
        supported: false,
        note: "HEIC/HEIF photos aren't supported yet — export the photo as JPG or PNG and try again.",
      };
    case "office":
      return {
        kind,
        supported: false,
        note: "Word, PowerPoint, and Excel files aren't supported yet — export to PDF, or paste the text.",
      };
    case "unknown":
    default:
      return {
        kind: "unknown",
        supported: false,
        note: `Can't read "${file.name}" yet. Supported: PDF, image, audio, video, or text — or paste the content directly.`,
      };
  }
}

/**
 * The `accept` attribute for the hero's file input. Advertises exactly — and
 * only — what `classifyIngestFile` routes to a real pipeline. Office/HEIC are
 * deliberately omitted so the OS picker doesn't imply support we don't have;
 * a user who drags one anyway still gets the honest gate from
 * `describeIngestSupport`.
 */
export const INGEST_ACCEPT = [
  // documents / text
  ".pdf",
  "application/pdf",
  ".txt",
  ".md",
  ".markdown",
  ".csv",
  ".tsv",
  ".json",
  ".html",
  ".rtf",
  "text/*",
  // images (OCR)
  ".png",
  ".jpg",
  ".jpeg",
  ".webp",
  ".gif",
  ".bmp",
  ".tiff",
  "image/png",
  "image/jpeg",
  "image/webp",
  "image/gif",
  "image/bmp",
  "image/tiff",
  // audio (transcription)
  ".mp3",
  ".wav",
  ".m4a",
  ".aac",
  ".ogg",
  ".flac",
  ".opus",
  "audio/*",
  // video (transcription)
  ".mp4",
  ".mov",
  ".webm",
  ".m4v",
  "video/mp4",
  "video/quicktime",
  "video/webm",
].join(",");
