/**
 * features/files/utils/file-types.ts
 *
 * THE SINGLE SOURCE OF TRUTH for cloud-files type capabilities.
 *
 * If you need to:
 *   - Add support for a new file type
 *   - Change which previewer a type uses
 *   - Change which icon / color a type renders with
 *   - Change whether a type renders a real thumbnail or a fallback icon
 *   - Add or remove a thumbnail strategy
 *   - Change a size cap for a particular kind
 *
 * → edit THIS file. Nothing else in the cloud-files feature should
 * encode this knowledge.
 *
 * The supporting modules (`mime.ts`, `icon-map.ts`,
 * `preview-capabilities.ts`) are thin wrappers that read from this
 * registry and exist only for backwards-compat with older imports.
 *
 * ─────────────────────────────────────────────────────────────────────
 * Structure
 * ─────────────────────────────────────────────────────────────────────
 *
 *   FILE_TYPES is an array of declarative entries. Each entry says:
 *
 *     - which extensions match it
 *     - the canonical MIME type (used as a fallback when the server
 *       didn't send one and to canonicalize between the dozens of
 *       legacy aliases the web has accumulated)
 *     - which preview component to use
 *     - which thumbnail strategy to use in grid / list views
 *     - the icon + color tokens that drive the iconography
 *     - a human-friendly display name (e.g. "PDF Document" vs "pdf")
 *     - any size cap that overrides the global preview cap
 *
 * Mime-first override: when the browser knows a MIME (e.g. it set
 * `image/avif` even though we don't have `.avif` in the extension
 * table), the wrapper helpers fall back to MIME-prefix matching for
 * `image/*`, `video/*`, `audio/*`, and `application/pdf`, so adding a
 * brand-new image format never requires more than a one-line entry.
 */

import {
  Archive,
  Braces,
  Code,
  Database,
  File as FileIcon,
  FileAudio,
  FileCode,
  FileImage,
  FileJson,
  FileSpreadsheet,
  FileText,
  FileType,
  FileVideo,
  Folder,
  FolderOpen,
  Image as ImageIcon,
  Music,
  Package,
  PenTool,
  Subtitles,
  Video,
  type LucideIcon,
} from "lucide-react";

// ---------------------------------------------------------------------------
// Public types
// ---------------------------------------------------------------------------

/** Top-level grouping. Drives sidebar filters and color rhythm. */
export type FileCategory =
  | "CODE"
  | "DOCUMENT"
  | "AUDIO"
  | "IMAGE"
  | "VIDEO"
  | "ARCHIVE"
  | "DATA"
  | "NOTEBOOK"
  | "SUBTITLES"
  | "EMAIL"
  | "EBOOK"
  | "MODEL_3D"
  | "UNKNOWN"
  | "FOLDER";

/** Which previewer should render this kind. `generic` means "no preview".
 *
 * `svg` is split out from `image` on purpose: SVG is text-shaped (XML), so
 * it has a dedicated previewer (`SvgPreview` — renders with a transparency
 * grid and lets the user toggle to the raw markup) AND is editable in the
 * standard Monaco inline editor with XML syntax highlighting. Routing it
 * through `image` would hide the editor handoff and the source-view toggle.
 */
export type PreviewKind =
  | "code"
  | "image"
  | "svg"
  | "html"
  | "audio"
  | "video"
  | "pdf"
  | "text"
  | "markdown"
  | "data"
  | "spreadsheet"
  | "generic";

/**
 * Strategy hint for the small inline thumbnail rendered in grid / list views.
 *
 * Phase 1b note: server-rendered thumbnails are now **universal** —
 * every uploaded file has `FileRecord.thumbnail_url` populated (image,
 * PDF page 1, video frame, audio waveform, or mime-family icon for
 * unknown). `MediaThumbnail` reads `file.thumbnailUrl` first regardless
 * of the strategy below; this enum now only controls the "live render"
 * fallback for the brief window between upload and variant render.
 *
 *   "image"          — `<img src={masterCdnUrl}>` fallback when the
 *                      backend variant hasn't finished rendering yet.
 *   "video-poster"   — `<video preload="metadata">` fallback for the
 *                      same window.
 *   "pdf-firstpage"  — historic; Phase 1c now ships `page1_url` via
 *                      the variants store. The grid path uses
 *                      `file.thumbnailUrl`; full-page detail views can
 *                      bind `Asset.variants["page1_url"].url`.
 *   "backend-thumb"  — historic; now equivalent to `icon` for the live
 *                      render fallback because the universal pipeline
 *                      handles every backend-thumb case automatically.
 *   "icon"           — no live render fallback. The `file.thumbnailUrl`
 *                      lookup (or icon) is the only source.
 */
export type ThumbnailStrategy =
  | "image"
  | "video-poster"
  | "pdf-firstpage"
  | "backend-thumb"
  | "icon";

/**
 * One row in the registry. Most fields are static; the `extensions`,
 * `aliases`, `aliasPrefixes`, and `mime` fields are the lookup keys.
 */
export interface FileTypeEntry {
  /** Extensions (lowercased, no dot) that map to this entry. First wins. */
  extensions: readonly string[];
  /**
   * Exact filenames (matched as-is, then case-insensitively) that resolve to
   * this entry — covers the universe of "no extension OR purely dotfile"
   * text-config files. e.g. `["Dockerfile", ".dockerignore"]`.
   */
  aliases?: readonly string[];
  /**
   * Filename prefixes that resolve to this entry. Matched after exact
   * extensions / aliases fail. Useful for `.env*` style variants
   * (`.env.local`, `.env.production`, ...). Compared case-insensitively.
   */
  aliasPrefixes?: readonly string[];
  /** Canonical MIME. Used to fill `mime_type` when the server didn't send one. */
  mime: string;
  category: FileCategory;
  /** Specific name within the category, e.g. "PYTHON", "MP3". UPPERCASE. */
  subCategory: string;
  /** Human-friendly name shown in tooltips / "What can I preview?" lists. */
  displayName: string;
  previewKind: PreviewKind;
  thumbnailStrategy: ThumbnailStrategy;
  /** Tailwind text color token, e.g. `text-emerald-500`. */
  color: string;
  icon: LucideIcon;
  /** Override the global 10MB preview cap if the previewer can stream. */
  previewSizeCapOverride?: number | null;
}

/** What a caller actually needs to render any given file. */
export interface FileTypeDetails {
  category: FileCategory;
  subCategory: string;
  displayName: string;
  previewKind: PreviewKind;
  thumbnailStrategy: ThumbnailStrategy;
  color: string;
  icon: LucideIcon;
  /** Convenience — true when previewKind !== "generic". */
  canPreview: boolean;
  /** Convenience — null = use the global cap. */
  previewSizeCapOverride: number | null;
  /** The canonical MIME for the resolved type. */
  mime: string;
}

// ---------------------------------------------------------------------------
// Constants — the actual table
// ---------------------------------------------------------------------------

/** Global default preview cap. Bigger files render a "too large" message. */
export const MAX_INLINE_PREVIEW_BYTES = 10 * 1024 * 1024; // 10MB

/**
 * The registry. Order matters only when an extension belongs to multiple
 * entries — the first match wins. In practice every extension is unique.
 *
 * Adding a new file type:
 *   1. Append a new entry.
 *   2. If the previewKind is something new (not in `PreviewKind`), add it
 *      to that union AND register a previewer in
 *      `components/core/FilePreview/FilePreview.tsx`.
 *   3. If the thumbnail strategy is new, extend `ThumbnailStrategy` and
 *      handle it in `MediaThumbnail`.
 *
 * That's it. No edits to `mime.ts`, `icon-map.ts`, etc.
 */
export const FILE_TYPES: readonly FileTypeEntry[] = [
  // ────────────────────── IMAGE ──────────────────────
  {
    extensions: ["jpg", "jpeg"],
    mime: "image/jpeg",
    category: "IMAGE",
    subCategory: "JPEG",
    displayName: "JPEG image",
    previewKind: "image",
    thumbnailStrategy: "image",
    color: "text-emerald-500",
    icon: ImageIcon,
  },
  {
    extensions: ["png"],
    mime: "image/png",
    category: "IMAGE",
    subCategory: "PNG",
    displayName: "PNG image",
    previewKind: "image",
    thumbnailStrategy: "image",
    color: "text-emerald-500",
    icon: ImageIcon,
  },
  {
    extensions: ["gif"],
    mime: "image/gif",
    category: "IMAGE",
    subCategory: "GIF",
    displayName: "GIF image",
    previewKind: "image",
    thumbnailStrategy: "image",
    color: "text-emerald-500",
    icon: ImageIcon,
  },
  {
    extensions: ["webp"],
    mime: "image/webp",
    category: "IMAGE",
    subCategory: "WEBP",
    displayName: "WebP image",
    previewKind: "image",
    thumbnailStrategy: "image",
    color: "text-emerald-500",
    icon: ImageIcon,
  },
  // AVIF — modern image format, supported natively by all evergreen browsers.
  {
    extensions: ["avif"],
    mime: "image/avif",
    category: "IMAGE",
    subCategory: "AVIF",
    displayName: "AVIF image",
    previewKind: "image",
    thumbnailStrategy: "image",
    color: "text-emerald-500",
    icon: ImageIcon,
  },
  // SVG is text-under-the-hood (XML) so it gets its own previewKind. The
  // SvgPreview renderer shows the rasterized vector on a transparency grid
  // and exposes a "Source" toggle for the raw markup; the inline Monaco
  // editor opens it as XML for direct edits. A distinct PenTool icon flags
  // it as vector rather than the generic raster ImageIcon used by PNG/JPG.
  {
    extensions: ["svg"],
    mime: "image/svg+xml",
    category: "IMAGE",
    subCategory: "SVG",
    displayName: "SVG image",
    previewKind: "svg",
    thumbnailStrategy: "image",
    color: "text-amber-500",
    icon: PenTool,
  },
  // HEIC / HEIF — Apple still uses these heavily. Browsers can render only on
  // Safari natively; on Chrome/Firefox the `<img>` falls back to the icon
  // automatically (image error → broken-icon UX). A backend conversion
  // (Python P-9) is the right long-term fix.
  {
    extensions: ["heic"],
    mime: "image/heic",
    category: "IMAGE",
    subCategory: "HEIC",
    displayName: "HEIC image (iOS)",
    previewKind: "image",
    thumbnailStrategy: "image",
    color: "text-emerald-500",
    icon: ImageIcon,
  },
  {
    extensions: ["heif"],
    mime: "image/heif",
    category: "IMAGE",
    subCategory: "HEIF",
    displayName: "HEIF image",
    previewKind: "image",
    thumbnailStrategy: "image",
    color: "text-emerald-500",
    icon: ImageIcon,
  },
  // BMP / TIFF — older raster formats. Browser support is uneven (TIFF only
  // on Safari) but `<img>` will fail gracefully to the icon on others.
  {
    extensions: ["bmp"],
    mime: "image/bmp",
    category: "IMAGE",
    subCategory: "BMP",
    displayName: "Bitmap image",
    previewKind: "image",
    thumbnailStrategy: "image",
    color: "text-emerald-500",
    icon: ImageIcon,
  },
  {
    extensions: ["tif", "tiff"],
    mime: "image/tiff",
    category: "IMAGE",
    subCategory: "TIFF",
    displayName: "TIFF image",
    previewKind: "image",
    thumbnailStrategy: "image",
    color: "text-emerald-500",
    icon: ImageIcon,
  },
  {
    extensions: ["ico"],
    mime: "image/x-icon",
    category: "IMAGE",
    subCategory: "ICO",
    displayName: "Icon image",
    previewKind: "image",
    thumbnailStrategy: "image",
    color: "text-emerald-500",
    icon: ImageIcon,
  },

  // ────────────────────── VIDEO ──────────────────────
  // Video gets a `video-poster` thumbnail strategy: a muted, tiny `<video>`
  // element renders the first frame in place of a generic icon.
  {
    extensions: ["mp4"],
    mime: "video/mp4",
    category: "VIDEO",
    subCategory: "MP4",
    displayName: "MP4 video",
    previewKind: "video",
    thumbnailStrategy: "video-poster",
    color: "text-purple-500",
    icon: Video,
    previewSizeCapOverride: null, // streamed inline — no cap
  },
  {
    extensions: ["mov"],
    mime: "video/quicktime",
    category: "VIDEO",
    subCategory: "MOV",
    displayName: "QuickTime video",
    previewKind: "video",
    thumbnailStrategy: "video-poster",
    color: "text-purple-500",
    icon: Video,
    previewSizeCapOverride: null,
  },
  {
    extensions: ["webm"],
    mime: "video/webm",
    category: "VIDEO",
    subCategory: "WEBM",
    displayName: "WebM video",
    previewKind: "video",
    thumbnailStrategy: "video-poster",
    color: "text-purple-500",
    icon: Video,
    previewSizeCapOverride: null,
  },
  {
    extensions: ["mkv"],
    mime: "video/x-matroska",
    category: "VIDEO",
    subCategory: "MKV",
    displayName: "Matroska video",
    previewKind: "video",
    thumbnailStrategy: "video-poster",
    color: "text-purple-500",
    icon: Video,
    previewSizeCapOverride: null,
  },
  {
    extensions: ["avi"],
    mime: "video/x-msvideo",
    category: "VIDEO",
    subCategory: "AVI",
    displayName: "AVI video",
    previewKind: "video",
    thumbnailStrategy: "video-poster",
    color: "text-purple-500",
    icon: Video,
    previewSizeCapOverride: null,
  },
  {
    extensions: ["m4v"],
    mime: "video/mp4",
    category: "VIDEO",
    subCategory: "M4V",
    displayName: "iTunes video",
    previewKind: "video",
    thumbnailStrategy: "video-poster",
    color: "text-purple-500",
    icon: Video,
    previewSizeCapOverride: null,
  },

  // ────────────────────── AUDIO ──────────────────────
  // Audio thumbs stay as icons — waveform extraction is not worth the
  // bundle cost. Long-term: a backend cover-art / waveform field.
  {
    extensions: ["mp3"],
    mime: "audio/mpeg",
    category: "AUDIO",
    subCategory: "MP3",
    displayName: "MP3 audio",
    previewKind: "audio",
    thumbnailStrategy: "icon",
    color: "text-pink-500",
    icon: Music,
    previewSizeCapOverride: null,
  },
  {
    extensions: ["wav"],
    mime: "audio/wav",
    category: "AUDIO",
    subCategory: "WAV",
    displayName: "WAV audio",
    previewKind: "audio",
    thumbnailStrategy: "icon",
    color: "text-pink-500",
    icon: Music,
    previewSizeCapOverride: null,
  },
  {
    extensions: ["ogg"],
    mime: "audio/ogg",
    category: "AUDIO",
    subCategory: "OGG",
    displayName: "Ogg audio",
    previewKind: "audio",
    thumbnailStrategy: "icon",
    color: "text-pink-500",
    icon: Music,
    previewSizeCapOverride: null,
  },
  {
    extensions: ["m4a"],
    mime: "audio/mp4",
    category: "AUDIO",
    subCategory: "M4A",
    displayName: "AAC audio (M4A)",
    previewKind: "audio",
    thumbnailStrategy: "icon",
    color: "text-pink-500",
    icon: Music,
    previewSizeCapOverride: null,
  },
  {
    extensions: ["aac"],
    mime: "audio/aac",
    category: "AUDIO",
    subCategory: "AAC",
    displayName: "AAC audio",
    previewKind: "audio",
    thumbnailStrategy: "icon",
    color: "text-pink-500",
    icon: Music,
    previewSizeCapOverride: null,
  },
  {
    extensions: ["flac"],
    mime: "audio/flac",
    category: "AUDIO",
    subCategory: "FLAC",
    displayName: "FLAC audio",
    previewKind: "audio",
    thumbnailStrategy: "icon",
    color: "text-pink-500",
    icon: Music,
    previewSizeCapOverride: null,
  },
  {
    extensions: ["opus"],
    mime: "audio/opus",
    category: "AUDIO",
    subCategory: "OPUS",
    displayName: "Opus audio",
    previewKind: "audio",
    thumbnailStrategy: "icon",
    color: "text-pink-500",
    icon: Music,
    previewSizeCapOverride: null,
  },

  // ────────────────────── PDF ──────────────────────
  {
    extensions: ["pdf"],
    mime: "application/pdf",
    category: "DOCUMENT",
    subCategory: "PDF",
    displayName: "PDF document",
    previewKind: "pdf",
    // First-page render via pdfjs is a future enhancement. For now we use the
    // category icon — pdfjs is too heavy to load just for thumbs in a folder
    // listing. When backend thumbs land we'll switch this to "backend-thumb".
    thumbnailStrategy: "icon",
    color: "text-red-500",
    icon: FileType,
    previewSizeCapOverride: null,
  },

  // ────────────────────── MARKDOWN ──────────────────────
  {
    extensions: ["md", "markdown"],
    mime: "text/markdown",
    category: "DOCUMENT",
    subCategory: "MARKDOWN",
    displayName: "Markdown",
    previewKind: "markdown",
    thumbnailStrategy: "icon",
    color: "text-slate-400",
    icon: FileText,
  },
  {
    extensions: ["mdx"],
    mime: "text/markdown",
    category: "DOCUMENT",
    subCategory: "MDX",
    displayName: "MDX (Markdown + JSX)",
    previewKind: "markdown",
    thumbnailStrategy: "icon",
    color: "text-slate-400",
    icon: FileText,
  },

  // ────────────────────── PLAIN TEXT / LOG / SUBTITLES ──────────────────────
  {
    extensions: ["txt", "text", "asc", "me"],
    aliases: [
      // Project metadata that ships without an extension
      "README",
      "Readme",
      "readme",
      "LICENSE",
      "License",
      "license",
      "LICENCE",
      "COPYING",
      "COPYRIGHT",
      "NOTICE",
      "AUTHORS",
      "CONTRIBUTORS",
      "MAINTAINERS",
      "CHANGELOG",
      "CHANGES",
      "HISTORY",
      "NEWS",
      "TODO",
      "INSTALL",
      "VERSION",
      "MANIFEST",
      "PATENTS",
      "ROADMAP",
      "SECURITY",
    ],
    mime: "text/plain",
    category: "DOCUMENT",
    subCategory: "PLAIN",
    displayName: "Plain text",
    previewKind: "text",
    thumbnailStrategy: "icon",
    color: "text-muted-foreground",
    icon: FileText,
  },
  {
    extensions: ["log", "out", "err"],
    mime: "text/plain",
    category: "DOCUMENT",
    subCategory: "LOG",
    displayName: "Log file",
    previewKind: "text",
    thumbnailStrategy: "icon",
    color: "text-muted-foreground",
    icon: FileText,
  },
  // Dockerfile-family — text with custom syntax. We keep them in the CODE
  // category so they get a syntax-highlighting language hint downstream.
  {
    extensions: ["dockerfile", "containerfile"],
    aliases: ["Dockerfile", "Containerfile", "dockerfile"],
    aliasPrefixes: ["Dockerfile.", "dockerfile.", "Containerfile."],
    mime: "text/x-dockerfile",
    category: "CODE",
    subCategory: "DOCKERFILE",
    displayName: "Dockerfile",
    previewKind: "code",
    thumbnailStrategy: "icon",
    color: "text-blue-500",
    icon: Code,
  },
  // Makefile-family — also custom-syntax text.
  {
    extensions: ["mk", "make"],
    aliases: [
      "Makefile",
      "makefile",
      "GNUmakefile",
      "BSDmakefile",
      "Procfile",
      "Pipfile",
      "Justfile",
      "justfile",
      "Earthfile",
    ],
    aliasPrefixes: ["Makefile.", "makefile."],
    mime: "text/x-makefile",
    category: "CODE",
    subCategory: "MAKEFILE",
    displayName: "Makefile",
    previewKind: "code",
    thumbnailStrategy: "icon",
    color: "text-orange-500",
    icon: Code,
  },
  // Patches & diffs — text.
  {
    extensions: ["diff", "patch"],
    mime: "text/x-diff",
    category: "CODE",
    subCategory: "PATCH",
    displayName: "Patch / diff",
    previewKind: "code",
    thumbnailStrategy: "icon",
    color: "text-amber-500",
    icon: FileText,
  },
  // INI / properties / cfg — historically common config text formats.
  {
    extensions: ["ini", "cfg", "conf", "config", "properties", "prefs"],
    mime: "text/x-properties",
    category: "CODE",
    subCategory: "CONFIG",
    displayName: "Config file",
    previewKind: "code",
    thumbnailStrategy: "icon",
    color: "text-amber-400",
    icon: Braces,
  },
  // BibTeX / TeX / LaTeX — plain text with markup.
  {
    extensions: ["tex", "latex", "ltx", "sty", "cls", "bib"],
    mime: "text/x-tex",
    category: "CODE",
    subCategory: "TEX",
    displayName: "TeX / LaTeX",
    previewKind: "code",
    thumbnailStrategy: "icon",
    color: "text-emerald-500",
    icon: FileText,
  },
  // reStructuredText / AsciiDoc — text doc formats.
  {
    extensions: ["rst", "adoc", "asciidoc", "org"],
    mime: "text/plain",
    category: "DOCUMENT",
    subCategory: "DOC",
    displayName: "Document",
    previewKind: "text",
    thumbnailStrategy: "icon",
    color: "text-slate-400",
    icon: FileText,
  },
  {
    extensions: ["srt"],
    mime: "application/x-subrip",
    category: "SUBTITLES",
    subCategory: "SRT",
    displayName: "SubRip subtitles",
    previewKind: "text",
    thumbnailStrategy: "icon",
    color: "text-cyan-500",
    icon: Subtitles,
  },
  {
    extensions: ["vtt"],
    mime: "text/vtt",
    category: "SUBTITLES",
    subCategory: "VTT",
    displayName: "WebVTT subtitles",
    previewKind: "text",
    thumbnailStrategy: "icon",
    color: "text-cyan-500",
    icon: Subtitles,
  },

  // ────────────────────── CODE ──────────────────────
  {
    extensions: ["js", "mjs", "cjs"],
    mime: "text/javascript",
    category: "CODE",
    subCategory: "JAVASCRIPT",
    displayName: "JavaScript",
    previewKind: "code",
    thumbnailStrategy: "icon",
    color: "text-yellow-500",
    icon: FileCode,
  },
  {
    extensions: ["jsx"],
    mime: "text/javascript",
    category: "CODE",
    subCategory: "JAVASCRIPT",
    displayName: "JSX",
    previewKind: "code",
    thumbnailStrategy: "icon",
    color: "text-yellow-500",
    icon: FileCode,
  },
  {
    extensions: ["ts"],
    mime: "text/typescript",
    category: "CODE",
    subCategory: "TYPESCRIPT",
    displayName: "TypeScript",
    previewKind: "code",
    thumbnailStrategy: "icon",
    color: "text-blue-500",
    icon: FileCode,
  },
  {
    extensions: ["tsx"],
    mime: "text/typescript",
    category: "CODE",
    subCategory: "TYPESCRIPT",
    displayName: "TSX",
    previewKind: "code",
    thumbnailStrategy: "icon",
    color: "text-blue-500",
    icon: FileCode,
  },
  {
    extensions: ["py"],
    mime: "text/x-python",
    category: "CODE",
    subCategory: "PYTHON",
    displayName: "Python",
    previewKind: "code",
    thumbnailStrategy: "icon",
    color: "text-emerald-500",
    icon: Code,
  },
  {
    extensions: ["rb", "rbw", "rake", "ru", "gemspec"],
    aliases: [
      "Rakefile",
      "Gemfile",
      "Vagrantfile",
      "Berksfile",
      "Brewfile",
      "Capfile",
      "Guardfile",
      "Podfile",
      "Fastfile",
      "Appfile",
      "Deliverfile",
      "Matchfile",
      "Pluginfile",
      "Snapfile",
      "Scanfile",
      "Gymfile",
    ],
    mime: "text/x-ruby",
    category: "CODE",
    subCategory: "RUBY",
    displayName: "Ruby",
    previewKind: "code",
    thumbnailStrategy: "icon",
    color: "text-red-500",
    icon: Code,
  },
  {
    extensions: ["go"],
    mime: "text/x-go",
    category: "CODE",
    subCategory: "GO",
    displayName: "Go",
    previewKind: "code",
    thumbnailStrategy: "icon",
    color: "text-cyan-500",
    icon: Code,
  },
  {
    extensions: ["rs"],
    mime: "text/x-rust",
    category: "CODE",
    subCategory: "RUST",
    displayName: "Rust",
    previewKind: "code",
    thumbnailStrategy: "icon",
    color: "text-orange-600",
    icon: Code,
  },
  {
    extensions: ["java"],
    mime: "text/x-java",
    category: "CODE",
    subCategory: "JAVA",
    displayName: "Java",
    previewKind: "code",
    thumbnailStrategy: "icon",
    color: "text-red-600",
    icon: Code,
  },
  {
    extensions: ["swift"],
    mime: "text/x-swift",
    category: "CODE",
    subCategory: "SWIFT",
    displayName: "Swift",
    previewKind: "code",
    thumbnailStrategy: "icon",
    color: "text-orange-500",
    icon: Code,
  },
  {
    extensions: ["c", "h"],
    mime: "text/x-c",
    category: "CODE",
    subCategory: "C",
    displayName: "C",
    previewKind: "code",
    thumbnailStrategy: "icon",
    color: "text-blue-600",
    icon: Code,
  },
  {
    extensions: ["cpp", "cc", "cxx", "hpp"],
    mime: "text/x-c++",
    category: "CODE",
    subCategory: "CPP",
    displayName: "C++",
    previewKind: "code",
    thumbnailStrategy: "icon",
    color: "text-blue-700",
    icon: Code,
  },
  {
    extensions: ["cs"],
    mime: "text/x-csharp",
    category: "CODE",
    subCategory: "CSHARP",
    displayName: "C#",
    previewKind: "code",
    thumbnailStrategy: "icon",
    color: "text-purple-600",
    icon: Code,
  },
  // HTML — `previewKind: "html"` so the previewer can offer a Rendered /
  // Source toggle (sandboxed iframe vs Prism-highlighted markup). Without
  // the split, opening a saved web page in /files just showed its source,
  // which is the wrong default for almost every consumer. The Edit tab
  // mounts Monaco with `html` language (see CloudFileInlineEditor's
  // LANGUAGE_BY_EXT) and source-of-truth editing happens there.
  {
    extensions: ["html", "htm"],
    mime: "text/html",
    category: "CODE",
    subCategory: "HTML",
    displayName: "HTML",
    previewKind: "html",
    thumbnailStrategy: "icon",
    color: "text-orange-400",
    icon: Code,
  },
  {
    extensions: ["css"],
    mime: "text/css",
    category: "CODE",
    subCategory: "CSS",
    displayName: "CSS",
    previewKind: "code",
    thumbnailStrategy: "icon",
    color: "text-sky-400",
    icon: Code,
  },
  {
    extensions: ["scss"],
    mime: "text/x-scss",
    category: "CODE",
    subCategory: "SCSS",
    displayName: "SCSS",
    previewKind: "code",
    thumbnailStrategy: "icon",
    color: "text-pink-400",
    icon: Code,
  },
  {
    extensions: ["sh", "bash", "zsh", "fish", "ksh", "ash"],
    aliases: [
      // Bash / shell config dotfiles
      ".bashrc",
      ".bash_logout",
      ".bash_profile",
      ".bash_history",
      ".bash_aliases",
      ".profile",
      ".zshrc",
      ".zshenv",
      ".zprofile",
      ".zlogin",
      ".zlogout",
      ".zsh_history",
      ".inputrc",
      ".curlrc",
      ".wgetrc",
      ".npmrc",
      ".yarnrc",
      ".pypirc",
      ".tool-versions",
      ".nvmrc",
      ".node-version",
      ".python-version",
      ".ruby-version",
      // Env files (exact)
      ".env",
      ".envrc",
      ".sandbox_env",
      // Editor / formatter / linter config dotfiles (no extension variants)
      ".editorconfig",
      ".gitignore",
      ".gitattributes",
      ".gitmodules",
      ".gitkeep",
      ".gitconfig",
      ".dockerignore",
      ".eslintignore",
      ".prettierignore",
      ".npmignore",
      ".browserslistrc",
      ".stylelintignore",
      ".rsync-filter",
      // SSH / system config that is plain text
      "authorized_keys",
      "known_hosts",
      "config",
      "hosts",
      "passwd",
      "group",
      "shadow",
      "fstab",
      "crontab",
      "resolv.conf",
      "ssh_config",
      "sshd_config",
      // Build / cache markers (text)
      "CACHEDIR.TAG",
      "CODEOWNERS",
    ],
    aliasPrefixes: [
      // .env.local, .env.production, .env.development, .env.test, etc.
      ".env.",
      ".envrc.",
    ],
    mime: "text/x-shellscript",
    category: "CODE",
    subCategory: "SHELL",
    displayName: "Shell script",
    previewKind: "code",
    thumbnailStrategy: "icon",
    color: "text-emerald-400",
    icon: Code,
  },
  {
    extensions: ["sql"],
    mime: "application/sql",
    category: "CODE",
    subCategory: "SQL",
    displayName: "SQL",
    previewKind: "code",
    thumbnailStrategy: "icon",
    color: "text-amber-400",
    icon: Code,
  },
  {
    extensions: ["lua"],
    mime: "text/x-lua",
    category: "CODE",
    subCategory: "LUA",
    displayName: "Lua",
    previewKind: "code",
    thumbnailStrategy: "icon",
    color: "text-blue-500",
    icon: Code,
  },
  {
    extensions: ["pl", "pm"],
    mime: "text/x-perl",
    category: "CODE",
    subCategory: "PERL",
    displayName: "Perl",
    previewKind: "code",
    thumbnailStrategy: "icon",
    color: "text-indigo-400",
    icon: Code,
  },
  {
    extensions: ["r", "R", "rmd", "Rmd"],
    mime: "text/x-r",
    category: "CODE",
    subCategory: "R",
    displayName: "R",
    previewKind: "code",
    thumbnailStrategy: "icon",
    color: "text-blue-400",
    icon: Code,
  },
  {
    extensions: ["dart"],
    mime: "text/x-dart",
    category: "CODE",
    subCategory: "DART",
    displayName: "Dart",
    previewKind: "code",
    thumbnailStrategy: "icon",
    color: "text-cyan-500",
    icon: Code,
  },
  {
    extensions: ["kt", "kts"],
    mime: "text/x-kotlin",
    category: "CODE",
    subCategory: "KOTLIN",
    displayName: "Kotlin",
    previewKind: "code",
    thumbnailStrategy: "icon",
    color: "text-orange-400",
    icon: Code,
  },
  {
    extensions: ["scala", "sbt"],
    mime: "text/x-scala",
    category: "CODE",
    subCategory: "SCALA",
    displayName: "Scala",
    previewKind: "code",
    thumbnailStrategy: "icon",
    color: "text-red-500",
    icon: Code,
  },
  {
    extensions: ["clj", "cljs", "cljc", "edn"],
    mime: "text/x-clojure",
    category: "CODE",
    subCategory: "CLOJURE",
    displayName: "Clojure",
    previewKind: "code",
    thumbnailStrategy: "icon",
    color: "text-emerald-500",
    icon: Code,
  },
  {
    extensions: ["ex", "exs"],
    mime: "text/x-elixir",
    category: "CODE",
    subCategory: "ELIXIR",
    displayName: "Elixir",
    previewKind: "code",
    thumbnailStrategy: "icon",
    color: "text-purple-400",
    icon: Code,
  },
  {
    extensions: ["erl", "hrl"],
    mime: "text/x-erlang",
    category: "CODE",
    subCategory: "ERLANG",
    displayName: "Erlang",
    previewKind: "code",
    thumbnailStrategy: "icon",
    color: "text-rose-500",
    icon: Code,
  },
  {
    extensions: ["hs", "lhs"],
    mime: "text/x-haskell",
    category: "CODE",
    subCategory: "HASKELL",
    displayName: "Haskell",
    previewKind: "code",
    thumbnailStrategy: "icon",
    color: "text-violet-500",
    icon: Code,
  },
  {
    extensions: ["ml", "mli", "fs", "fsi", "fsx"],
    mime: "text/x-ocaml",
    category: "CODE",
    subCategory: "ML",
    displayName: "OCaml / F#",
    previewKind: "code",
    thumbnailStrategy: "icon",
    color: "text-orange-500",
    icon: Code,
  },
  {
    extensions: ["zig"],
    mime: "text/x-zig",
    category: "CODE",
    subCategory: "ZIG",
    displayName: "Zig",
    previewKind: "code",
    thumbnailStrategy: "icon",
    color: "text-yellow-500",
    icon: Code,
  },
  {
    extensions: ["nim", "nims"],
    mime: "text/x-nim",
    category: "CODE",
    subCategory: "NIM",
    displayName: "Nim",
    previewKind: "code",
    thumbnailStrategy: "icon",
    color: "text-yellow-400",
    icon: Code,
  },
  {
    extensions: ["jl"],
    mime: "text/x-julia",
    category: "CODE",
    subCategory: "JULIA",
    displayName: "Julia",
    previewKind: "code",
    thumbnailStrategy: "icon",
    color: "text-purple-500",
    icon: Code,
  },
  {
    extensions: ["vue"],
    mime: "text/x-vue",
    category: "CODE",
    subCategory: "VUE",
    displayName: "Vue",
    previewKind: "code",
    thumbnailStrategy: "icon",
    color: "text-emerald-500",
    icon: Code,
  },
  {
    extensions: ["svelte"],
    mime: "text/x-svelte",
    category: "CODE",
    subCategory: "SVELTE",
    displayName: "Svelte",
    previewKind: "code",
    thumbnailStrategy: "icon",
    color: "text-orange-500",
    icon: Code,
  },
  {
    extensions: ["astro"],
    mime: "text/x-astro",
    category: "CODE",
    subCategory: "ASTRO",
    displayName: "Astro",
    previewKind: "code",
    thumbnailStrategy: "icon",
    color: "text-fuchsia-500",
    icon: Code,
  },
  {
    extensions: ["graphql", "gql", "graphqls"],
    mime: "application/graphql",
    category: "CODE",
    subCategory: "GRAPHQL",
    displayName: "GraphQL",
    previewKind: "code",
    thumbnailStrategy: "icon",
    color: "text-pink-500",
    icon: Code,
  },
  {
    extensions: ["proto"],
    mime: "text/x-protobuf",
    category: "CODE",
    subCategory: "PROTO",
    displayName: "Protocol Buffers",
    previewKind: "code",
    thumbnailStrategy: "icon",
    color: "text-blue-400",
    icon: Code,
  },
  {
    extensions: ["sol"],
    mime: "text/x-solidity",
    category: "CODE",
    subCategory: "SOLIDITY",
    displayName: "Solidity",
    previewKind: "code",
    thumbnailStrategy: "icon",
    color: "text-slate-400",
    icon: Code,
  },
  {
    extensions: ["bat", "cmd"],
    mime: "text/x-msdos-batch",
    category: "CODE",
    subCategory: "BATCH",
    displayName: "Batch script",
    previewKind: "code",
    thumbnailStrategy: "icon",
    color: "text-emerald-400",
    icon: Code,
  },
  {
    extensions: ["ps1", "psm1", "psd1"],
    mime: "application/x-powershell",
    category: "CODE",
    subCategory: "POWERSHELL",
    displayName: "PowerShell",
    previewKind: "code",
    thumbnailStrategy: "icon",
    color: "text-blue-400",
    icon: Code,
  },
  {
    extensions: ["less"],
    mime: "text/x-less",
    category: "CODE",
    subCategory: "LESS",
    displayName: "LESS",
    previewKind: "code",
    thumbnailStrategy: "icon",
    color: "text-blue-400",
    icon: Code,
  },
  {
    extensions: ["styl", "stylus"],
    mime: "text/x-stylus",
    category: "CODE",
    subCategory: "STYLUS",
    displayName: "Stylus",
    previewKind: "code",
    thumbnailStrategy: "icon",
    color: "text-emerald-500",
    icon: Code,
  },
  {
    extensions: ["php", "phtml", "phps"],
    mime: "application/x-php",
    category: "CODE",
    subCategory: "PHP",
    displayName: "PHP",
    previewKind: "code",
    thumbnailStrategy: "icon",
    color: "text-indigo-500",
    icon: Code,
  },
  {
    extensions: ["twig", "jinja", "j2", "njk"],
    mime: "text/x-twig",
    category: "CODE",
    subCategory: "TEMPLATE",
    displayName: "Template",
    previewKind: "code",
    thumbnailStrategy: "icon",
    color: "text-emerald-400",
    icon: Code,
  },
  {
    extensions: ["hbs", "handlebars", "mustache", "ejs", "liquid"],
    mime: "text/x-template",
    category: "CODE",
    subCategory: "TEMPLATE",
    displayName: "Template",
    previewKind: "code",
    thumbnailStrategy: "icon",
    color: "text-amber-500",
    icon: Code,
  },

  // ────────────────────── DATA / CONFIG ──────────────────────
  {
    extensions: ["json", "jsonc", "json5", "har", "geojson", "topojson"],
    aliases: [
      ".babelrc",
      ".eslintrc",
      ".prettierrc",
      ".stylelintrc",
      ".swcrc",
      ".huskyrc",
      ".lintstagedrc",
    ],
    mime: "application/json",
    category: "DATA",
    subCategory: "JSON",
    displayName: "JSON",
    previewKind: "data",
    thumbnailStrategy: "icon",
    color: "text-amber-500",
    icon: FileJson,
  },
  {
    extensions: ["yaml", "yml"],
    aliases: [".yamllint", ".clang-format", ".clang-tidy"],
    mime: "application/yaml",
    category: "CODE",
    subCategory: "YAML",
    displayName: "YAML",
    previewKind: "code",
    thumbnailStrategy: "icon",
    color: "text-amber-500",
    icon: Braces,
  },
  {
    extensions: ["toml"],
    mime: "application/toml",
    category: "CODE",
    subCategory: "TOML",
    displayName: "TOML",
    previewKind: "code",
    thumbnailStrategy: "icon",
    color: "text-amber-500",
    icon: Braces,
  },
  {
    extensions: ["xml"],
    mime: "application/xml",
    category: "DATA",
    subCategory: "XML",
    displayName: "XML",
    previewKind: "data",
    thumbnailStrategy: "icon",
    color: "text-amber-500",
    icon: Braces,
  },
  {
    extensions: ["csv"],
    mime: "text/csv",
    category: "DATA",
    subCategory: "CSV",
    displayName: "CSV",
    previewKind: "data",
    thumbnailStrategy: "icon",
    color: "text-orange-500",
    icon: FileSpreadsheet,
  },
  {
    extensions: ["tsv"],
    mime: "text/tab-separated-values",
    category: "DATA",
    subCategory: "TSV",
    displayName: "TSV",
    previewKind: "data",
    thumbnailStrategy: "icon",
    color: "text-orange-500",
    icon: FileSpreadsheet,
  },
  {
    extensions: ["sqlite", "sqlite3", "db"],
    mime: "application/x-sqlite3",
    category: "DATA",
    subCategory: "SQLITE",
    displayName: "SQLite database",
    previewKind: "generic",
    thumbnailStrategy: "icon",
    color: "text-blue-400",
    icon: Database,
  },
  // PEM-encoded certs / CSRs are armored base64 — i.e. text. `.pem`
  // and `.csr` are PEM by convention; `.crt` / `.cer` / `.key` / `.pub`
  // can be either PEM or DER (binary), so they stay `generic` and the
  // binary viewer's byte sniff offers "View as text" when the bytes
  // turn out to be ASCII-armored.
  {
    extensions: ["pem", "csr"],
    mime: "application/x-pem-file",
    category: "CODE",
    subCategory: "PEM",
    displayName: "PEM certificate / key",
    previewKind: "text",
    thumbnailStrategy: "icon",
    color: "text-amber-500",
    icon: FileText,
  },
  {
    extensions: ["crt", "cer", "der", "key", "pub", "p7b", "p7c", "pfx", "p12"],
    mime: "application/x-x509-ca-cert",
    category: "CODE",
    subCategory: "CERT",
    displayName: "Certificate",
    previewKind: "generic",
    thumbnailStrategy: "icon",
    color: "text-amber-500",
    icon: FileText,
  },
  // RDF / Turtle / N-Triples — text-based RDF data formats.
  {
    extensions: ["ttl", "n3", "nt", "nq", "trig"],
    mime: "text/turtle",
    category: "DATA",
    subCategory: "RDF",
    displayName: "RDF / Turtle",
    previewKind: "code",
    thumbnailStrategy: "icon",
    color: "text-fuchsia-400",
    icon: Braces,
  },

  // ────────────────────── SPREADSHEET (Excel) ──────────────────────
  {
    extensions: ["xlsx"],
    mime: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    category: "DOCUMENT",
    subCategory: "EXCEL",
    displayName: "Excel workbook",
    previewKind: "spreadsheet",
    thumbnailStrategy: "icon",
    color: "text-emerald-600",
    icon: FileSpreadsheet,
    previewSizeCapOverride: null,
  },
  {
    extensions: ["xls"],
    mime: "application/vnd.ms-excel",
    category: "DOCUMENT",
    subCategory: "EXCEL",
    displayName: "Excel workbook (legacy)",
    previewKind: "spreadsheet",
    thumbnailStrategy: "icon",
    color: "text-emerald-600",
    icon: FileSpreadsheet,
    previewSizeCapOverride: null,
  },

  // ────────────────────── OFFICE — NOT YET PREVIEWABLE ──────────────────────
  // Listed here so they get correct icons / categories. Full-text preview
  // requires a parser dependency (mammoth.js for docx, etc.) — tracked as a
  // follow-up. Today users see the icon and a Download button.
  {
    extensions: ["doc", "docx"],
    mime: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    category: "DOCUMENT",
    subCategory: "WORD",
    displayName: "Word document",
    previewKind: "generic",
    thumbnailStrategy: "icon",
    color: "text-blue-500",
    icon: FileText,
  },
  {
    extensions: ["ppt", "pptx"],
    mime: "application/vnd.openxmlformats-officedocument.presentationml.presentation",
    category: "DOCUMENT",
    subCategory: "POWERPOINT",
    displayName: "PowerPoint",
    previewKind: "generic",
    thumbnailStrategy: "icon",
    color: "text-orange-600",
    icon: FileType,
  },

  // ────────────────────── NOTEBOOK ──────────────────────
  // .ipynb is JSON under the hood, so it works in our DataPreview today.
  // Eventually we'll ship a dedicated notebook renderer (cells + outputs).
  {
    extensions: ["ipynb"],
    mime: "application/x-ipynb+json",
    category: "NOTEBOOK",
    subCategory: "JUPYTER",
    displayName: "Jupyter notebook",
    previewKind: "data",
    thumbnailStrategy: "icon",
    color: "text-orange-400",
    icon: FileJson,
  },

  // ────────────────────── EBOOK ──────────────────────
  {
    extensions: ["epub"],
    mime: "application/epub+zip",
    category: "EBOOK",
    subCategory: "EPUB",
    displayName: "EPUB ebook",
    previewKind: "generic",
    thumbnailStrategy: "icon",
    color: "text-indigo-500",
    icon: FileText,
  },

  // ────────────────────── EMAIL ──────────────────────
  {
    extensions: ["eml"],
    mime: "message/rfc822",
    category: "EMAIL",
    subCategory: "EML",
    displayName: "Email message",
    previewKind: "text",
    thumbnailStrategy: "icon",
    color: "text-blue-400",
    icon: FileText,
  },

  // ────────────────────── 3D / CAD ──────────────────────
  // No previewer yet (Three.js loader would be needed). Icons only.
  {
    extensions: ["glb", "gltf"],
    mime: "model/gltf-binary",
    category: "MODEL_3D",
    subCategory: "GLTF",
    displayName: "3D model (glTF)",
    previewKind: "generic",
    thumbnailStrategy: "icon",
    color: "text-violet-400",
    icon: Package,
  },
  {
    extensions: ["stl", "obj", "fbx"],
    mime: "model/stl",
    category: "MODEL_3D",
    subCategory: "MESH",
    displayName: "3D mesh",
    previewKind: "generic",
    thumbnailStrategy: "icon",
    color: "text-violet-400",
    icon: Package,
  },

  // ────────────────────── ARCHIVES ──────────────────────
  {
    extensions: ["zip"],
    mime: "application/zip",
    category: "ARCHIVE",
    subCategory: "ZIP",
    displayName: "ZIP archive",
    previewKind: "generic",
    thumbnailStrategy: "icon",
    color: "text-amber-600",
    icon: Archive,
  },
  {
    extensions: ["rar"],
    mime: "application/vnd.rar",
    category: "ARCHIVE",
    subCategory: "RAR",
    displayName: "RAR archive",
    previewKind: "generic",
    thumbnailStrategy: "icon",
    color: "text-amber-600",
    icon: Archive,
  },
  {
    extensions: ["7z"],
    mime: "application/x-7z-compressed",
    category: "ARCHIVE",
    subCategory: "7Z",
    displayName: "7-Zip archive",
    previewKind: "generic",
    thumbnailStrategy: "icon",
    color: "text-amber-600",
    icon: Archive,
  },
  {
    extensions: ["tar"],
    mime: "application/x-tar",
    category: "ARCHIVE",
    subCategory: "TAR",
    displayName: "TAR archive",
    previewKind: "generic",
    thumbnailStrategy: "icon",
    color: "text-amber-600",
    icon: Package,
  },
  {
    extensions: ["gz", "tgz"],
    mime: "application/gzip",
    category: "ARCHIVE",
    subCategory: "GZ",
    displayName: "Gzip archive",
    previewKind: "generic",
    thumbnailStrategy: "icon",
    color: "text-amber-600",
    icon: Package,
  },
];

// ---------------------------------------------------------------------------
// Defaults — used when an extension isn't in the registry.
// ---------------------------------------------------------------------------

const UNKNOWN_DETAILS: FileTypeDetails = {
  category: "UNKNOWN",
  subCategory: "UNKNOWN",
  displayName: "File",
  previewKind: "generic",
  thumbnailStrategy: "icon",
  color: "text-muted-foreground",
  icon: FileIcon,
  canPreview: false,
  previewSizeCapOverride: null,
  mime: "application/octet-stream",
};

/**
 * Soft default for "almost certainly text but we don't know what kind"
 * filenames — unrecognized dotfiles, files with no extension, etc.
 *
 * Returning this from the dotfile heuristic instead of `UNKNOWN_DETAILS`
 * makes the file open in the text editor instead of the binary viewer.
 */
const ASSUMED_TEXT_DETAILS: FileTypeDetails = {
  category: "DOCUMENT",
  subCategory: "PLAIN",
  displayName: "Text",
  previewKind: "text",
  thumbnailStrategy: "icon",
  color: "text-muted-foreground",
  icon: FileText,
  canPreview: true,
  previewSizeCapOverride: null,
  mime: "text/plain",
};

const FOLDER_DETAILS: FileTypeDetails = {
  category: "FOLDER",
  subCategory: "FOLDER",
  displayName: "Folder",
  previewKind: "generic",
  thumbnailStrategy: "icon",
  color: "text-sky-500",
  icon: Folder,
  canPreview: false,
  previewSizeCapOverride: null,
  mime: "inode/directory",
};

// ---------------------------------------------------------------------------
// Lookup index — built once at module load.
// ---------------------------------------------------------------------------

const BY_EXTENSION = new Map<string, FileTypeEntry>();
const BY_MIME = new Map<string, FileTypeEntry>();

/** Exact filenames (case-sensitive). e.g. "Dockerfile" → entry. */
const BY_NAME_EXACT = new Map<string, FileTypeEntry>();
/** Exact filenames (lowercased). Tried after the case-sensitive map. */
const BY_NAME_LOWER = new Map<string, FileTypeEntry>();
/**
 * Filename prefix rules. Sorted by descending prefix length so the most
 * specific match wins (e.g. ".envrc." beats ".env.").
 */
const NAME_PREFIX_RULES: Array<{ prefix: string; entry: FileTypeEntry }> = [];

for (const entry of FILE_TYPES) {
  for (const ext of entry.extensions)
    BY_EXTENSION.set(ext.toLowerCase(), entry);
  // Only the first entry per MIME wins — important for shared MIMEs like
  // text/plain (txt + log) where the extension is the better key.
  if (!BY_MIME.has(entry.mime)) BY_MIME.set(entry.mime, entry);
  if (entry.aliases) {
    for (const alias of entry.aliases) {
      BY_NAME_EXACT.set(alias, entry);
      const lower = alias.toLowerCase();
      if (!BY_NAME_LOWER.has(lower)) BY_NAME_LOWER.set(lower, entry);
    }
  }
  if (entry.aliasPrefixes) {
    for (const prefix of entry.aliasPrefixes) {
      NAME_PREFIX_RULES.push({ prefix: prefix.toLowerCase(), entry });
    }
  }
}
NAME_PREFIX_RULES.sort((a, b) => b.prefix.length - a.prefix.length);

function entryToDetails(entry: FileTypeEntry): FileTypeDetails {
  return {
    category: entry.category,
    subCategory: entry.subCategory,
    displayName: entry.displayName,
    previewKind: entry.previewKind,
    thumbnailStrategy: entry.thumbnailStrategy,
    color: entry.color,
    icon: entry.icon,
    canPreview: entry.previewKind !== "generic",
    previewSizeCapOverride:
      entry.previewSizeCapOverride !== undefined
        ? entry.previewSizeCapOverride
        : null,
    mime: entry.mime,
  };
}

// ---------------------------------------------------------------------------
// Public helpers
// ---------------------------------------------------------------------------

/** Lowercase extension without the dot, or "" if there isn't one. */
function extOf(filename: string): string {
  const i = filename.lastIndexOf(".");
  if (i <= 0 || i === filename.length - 1) return "";
  return filename.slice(i + 1).toLowerCase();
}

/** Just the basename (last path segment) — handles forward and back slashes. */
function basenameOf(filename: string): string {
  const slash = Math.max(filename.lastIndexOf("/"), filename.lastIndexOf("\\"));
  return slash >= 0 ? filename.slice(slash + 1) : filename;
}

/**
 * Resolve a filename to a registered entry, in order of specificity:
 *   1. exact basename match (case-sensitive — e.g. "Dockerfile")
 *   2. exact basename match (case-insensitive — e.g. "dockerfile")
 *   3. extension match (e.g. "*.ts" → typescript entry)
 *   4. prefix rule match (e.g. ".env.local" → ".env." → shell entry)
 *
 * Returns null when no entry matches; callers fall back to the dotfile
 * heuristic and finally to UNKNOWN_DETAILS.
 */
function resolveEntry(filename: string): FileTypeEntry | null {
  const name = basenameOf(filename);
  const exact = BY_NAME_EXACT.get(name);
  if (exact) return exact;
  const ci = BY_NAME_LOWER.get(name.toLowerCase());
  if (ci) return ci;
  const ext = extOf(name);
  if (ext) {
    const byExt = BY_EXTENSION.get(ext);
    if (byExt) return byExt;
  }
  const lower = name.toLowerCase();
  for (const rule of NAME_PREFIX_RULES) {
    if (lower.startsWith(rule.prefix)) return rule.entry;
  }
  return null;
}

/**
 * Heuristic fallback for filenames that didn't match the registry. We
 * bias toward "this is text" — most files agents encounter on a sandbox
 * VM are text-shaped, and even when they aren't, the binary viewer's
 * "View as text" override gives users the escape hatch. Treating
 * unknowns as text avoids the awful UX where opening `.bashrc` or
 * `authorized_keys` shows "this file type can't be previewed."
 *
 * The rule: filenames that start with `.` are almost always config
 * dotfiles. They get the assumed-text profile so they open in Monaco.
 * Other unknown-extension files stay UNKNOWN — the binary viewer's
 * runtime byte sniff still offers a "View as text" button when the
 * actual bytes are printable.
 */
function dotfileLooksLikeText(filename: string): boolean {
  const name = basenameOf(filename);
  if (!name.startsWith(".")) return false;
  // Skip the leading dot, then make sure there's at least one alphanumeric
  // character — guards against pathological "..", "...", etc.
  for (let i = 1; i < name.length; i++) {
    const c = name.charCodeAt(i);
    if (
      (c >= 48 && c <= 57) || // 0-9
      (c >= 65 && c <= 90) || // A-Z
      (c >= 97 && c <= 122) || // a-z
      c === 95 || // _
      c === 45 // -
    ) {
      return true;
    }
  }
  return false;
}

/** Look up details by file name (basename / alias / prefix / extension match). */
export function getFileTypeDetails(filename: string): FileTypeDetails {
  const entry = resolveEntry(filename);
  if (entry) return entryToDetails(entry);
  if (dotfileLooksLikeText(filename)) return ASSUMED_TEXT_DETAILS;
  return UNKNOWN_DETAILS;
}

/**
 * Same as `getFileTypeDetails` but never falls through to UNKNOWN — used
 * by the binary viewer's "View as text" override and any caller that has
 * already decided "treat this as text, no matter what."
 */
export function getAssumedTextDetails(filename: string): FileTypeDetails {
  const entry = resolveEntry(filename);
  if (entry) {
    const details = entryToDetails(entry);
    if (details.previewKind === "generic") {
      return { ...details, previewKind: "text", canPreview: true };
    }
    // Force-text view explicitly demanded — for an HTML file this means the
    // user clicked "View as text" in the binary viewer / code workspace.
    // Demote to plain text so they see the raw markup, not the rendered
    // iframe. (The standard Preview tab still gets the rendered toggle.)
    if (details.previewKind === "html") {
      return { ...details, previewKind: "text" };
    }
    return details;
  }
  return ASSUMED_TEXT_DETAILS;
}

/** True when the filename is recognized as text-bearing without sniffing bytes. */
export function isLikelyTextFilename(filename: string): boolean {
  const entry = resolveEntry(filename);
  if (entry) {
    return (
      entry.previewKind === "code" ||
      entry.previewKind === "text" ||
      entry.previewKind === "markdown" ||
      entry.previewKind === "data" ||
      // HTML and SVG are markup-under-the-hood. The binary viewer / sniffer
      // should treat them as text so "View as text" works on edge cases.
      entry.previewKind === "html" ||
      entry.previewKind === "svg"
    );
  }
  return dotfileLooksLikeText(filename);
}

/** Folder details — used by sidebar + tree rendering. */
export function getFolderTypeDetails(open = false): FileTypeDetails {
  return open ? { ...FOLDER_DETAILS, icon: FolderOpen } : FOLDER_DETAILS;
}

/** Canonical MIME for an extension (or `application/octet-stream`). */
export function mimeFromFilename(filename: string): string {
  const entry = resolveEntry(filename);
  return entry ? entry.mime : "application/octet-stream";
}

/**
 * Resolve a final MIME, preferring the server-supplied value when it's
 * meaningful, otherwise falling back to the extension table.
 */
export function resolveMime(
  explicit: string | null | undefined,
  filename: string,
): string {
  if (explicit && explicit !== "application/octet-stream") return explicit;
  return mimeFromFilename(filename);
}

/**
 * Given a (filename, mime, size) tuple, return the full preview profile —
 * what to render at full size, what to render in a grid thumbnail, whether
 * either is allowed at the file's current byte size, and the resolved MIME.
 *
 * This is THE function components should call. `getPreviewCapability` and
 * `useFileTypeDetails` are thin views on top.
 */
export interface FilePreviewProfile {
  details: FileTypeDetails;
  /** Effective `previewKind` after MIME-prefix override. */
  previewKind: PreviewKind;
  /** True when the type is renderable AND the byte size fits the cap. */
  canPreview: boolean;
  /** False = file is too big for inline preview; offer download instead. */
  sizeOk: boolean;
  /** The cap that was effectively applied (in bytes). */
  effectiveSizeCap: number;
  /** True iff the registry says this file should render a real thumbnail. */
  thumbnailStrategy: ThumbnailStrategy;
  /** Resolved canonical MIME. */
  mime: string;
}

export function getFilePreviewProfile(
  fileName: string,
  mimeType: string | null,
  fileSize: number | null,
): FilePreviewProfile {
  const mime = resolveMime(mimeType, fileName);
  const fromExt = getFileTypeDetails(fileName);

  // MIME-prefix override — handles "we got `image/avif` but the extension
  // table doesn't have .avif yet" and similar future-proofing.
  //
  // SVG is intentionally NOT promoted to the generic "image" kind here:
  // its previewKind is already "svg" from the extension lookup and the
  // override would clobber that, hiding the dedicated SvgPreview + Edit
  // routing. Same idea would apply to any future text-shaped image MIME.
  let kind: PreviewKind = fromExt.previewKind;
  let thumb: ThumbnailStrategy = fromExt.thumbnailStrategy;
  if (mime === "image/svg+xml") {
    kind = "svg";
    thumb = "image";
  } else if (mime.startsWith("image/")) {
    kind = "image";
    thumb = "image";
  } else if (mime.startsWith("video/")) {
    kind = "video";
    thumb = thumb === "icon" ? "video-poster" : thumb;
  } else if (mime.startsWith("audio/")) {
    kind = "audio";
  } else if (mime === "application/pdf") {
    kind = "pdf";
  } else if (kind === "generic" && isTextMime(mime)) {
    kind = "text";
  }

  const canPreviewKind = kind !== "generic";

  const cap =
    fromExt.previewSizeCapOverride ??
    // Streamable kinds are always allowed regardless of size. SVG joins the
    // group: even though it's text underneath, it streams as an image via
    // a signed URL — never read into memory by the renderer. HTML joins
    // too: the Rendered view drives a sandboxed iframe `src={signedUrl}`
    // (no client-side blob read), and the Source view fetches the bytes
    // through the standard blob path which has its own truncation.
    (kind === "image" ||
    kind === "svg" ||
    kind === "html" ||
    kind === "video" ||
    kind === "audio" ||
    kind === "pdf" ||
    kind === "spreadsheet"
      ? Number.POSITIVE_INFINITY
      : MAX_INLINE_PREVIEW_BYTES);

  const sizeOk = fileSize == null || fileSize <= cap;

  return {
    details: { ...fromExt, previewKind: kind, thumbnailStrategy: thumb },
    previewKind: kind,
    canPreview: canPreviewKind && sizeOk,
    sizeOk,
    effectiveSizeCap: cap,
    thumbnailStrategy: thumb,
    mime,
  };
}

// ---------------------------------------------------------------------------
// Mime-prefix helpers (kept pure so consumers can still ask "is this image?")
// ---------------------------------------------------------------------------

export function isTextMime(mime: string): boolean {
  if (mime.startsWith("text/")) return true;
  return (
    mime === "application/json" ||
    mime === "application/xml" ||
    mime === "application/yaml" ||
    mime === "application/x-yaml" ||
    mime === "application/toml" ||
    mime === "application/sql" ||
    mime === "application/x-subrip" ||
    mime === "message/rfc822"
  );
}

export function isImageMime(mime: string): boolean {
  return mime.startsWith("image/");
}

export function isVideoMime(mime: string): boolean {
  return mime.startsWith("video/");
}

export function isAudioMime(mime: string): boolean {
  return mime.startsWith("audio/");
}

export function isPdfMime(mime: string): boolean {
  return mime === "application/pdf";
}

// ---------------------------------------------------------------------------
// Byte sniffing — used by the code workspace's binary viewer to decide
// whether a generic / unknown file is actually text-shaped at runtime, so
// it can offer (or auto-engage) a "View as text" override even for
// filenames the registry doesn't recognize.
// ---------------------------------------------------------------------------

/**
 * Result of `sniffTextBytes`. We split "definitely text" from "looks text-y
 * but we're not sure" so the UI can pick a different default action:
 *
 *   - `confidence === "high"` — safe to render in Monaco automatically.
 *   - `confidence === "medium"` — probably text; offer a button.
 *   - `confidence === "low"` — almost certainly binary; only show on
 *     manual override.
 */
export interface TextSniffResult {
  isText: boolean;
  confidence: "high" | "medium" | "low";
  reason: string;
}

/**
 * Heuristic byte-level text detector. Inspects the first ~4KB of the
 * sample and answers "could this be displayed as text?". Designed to be
 * permissive — false positives are recoverable (the user sees garbage
 * and closes the tab), while false negatives are exactly the bug we're
 * fighting (.bashrc, authorized_keys, etc. being declared "binary").
 *
 * Rules, in order:
 *   1. Empty bytes → text (an empty file is fine to open in Monaco).
 *   2. UTF-8 BOM, UTF-16 BOM, UTF-32 BOM → text (high confidence).
 *   3. Strict UTF-8 decode succeeds → text (high confidence).
 *   4. Otherwise count printable / control bytes:
 *        - any null byte (0x00) → binary (high confidence).
 *        - >= 95% printable + tab/newline/CR → text (medium).
 *        - everything else → binary (low).
 */
export function sniffTextBytes(
  bytes: Uint8Array,
  sampleSize = 4096,
): TextSniffResult {
  if (bytes.length === 0) {
    return { isText: true, confidence: "high", reason: "empty file" };
  }
  const sample = bytes.subarray(0, Math.min(sampleSize, bytes.length));

  // BOM checks first — these are unambiguous.
  if (
    sample.length >= 3 &&
    sample[0] === 0xef &&
    sample[1] === 0xbb &&
    sample[2] === 0xbf
  ) {
    return { isText: true, confidence: "high", reason: "UTF-8 BOM" };
  }
  if (
    sample.length >= 2 &&
    ((sample[0] === 0xff && sample[1] === 0xfe) ||
      (sample[0] === 0xfe && sample[1] === 0xff))
  ) {
    return { isText: true, confidence: "high", reason: "UTF-16 BOM" };
  }

  // Strict UTF-8 decode — succeeds for the vast majority of text we see
  // in sandboxes (source code, configs, logs). Falls through on truncated
  // multi-byte sequences at the sample boundary, which is fine.
  if (typeof TextDecoder !== "undefined") {
    try {
      new TextDecoder("utf-8", { fatal: true }).decode(sample);
      return { isText: true, confidence: "high", reason: "valid UTF-8" };
    } catch {
      // Fall through to printability check.
    }
  }

  // Printability fallback — covers files that are mostly ASCII but had a
  // single bad byte at the sample boundary, plus legacy 8-bit encodings.
  let printable = 0;
  for (let i = 0; i < sample.length; i++) {
    const b = sample[i];
    if (b === 0) {
      return { isText: false, confidence: "high", reason: "null byte" };
    }
    if (b === 9 || b === 10 || b === 13 || (b >= 0x20 && b <= 0x7e)) {
      printable++;
    }
  }
  const ratio = printable / sample.length;
  if (ratio >= 0.95) {
    return {
      isText: true,
      confidence: "medium",
      reason: `${Math.round(ratio * 100)}% printable`,
    };
  }
  return {
    isText: false,
    confidence: "low",
    reason: `only ${Math.round(ratio * 100)}% printable`,
  };
}

// ---------------------------------------------------------------------------
// Documentation helpers — exported so /admin pages or QA dashboards can
// render "what does cloud-files support today?" tables straight from the
// registry, without ever drifting from runtime behavior.
// ---------------------------------------------------------------------------

/** Every supported (extension, displayName, previewKind, thumbnailStrategy). */
export interface SupportedTypeRow {
  extensions: readonly string[];
  mime: string;
  category: FileCategory;
  displayName: string;
  previewKind: PreviewKind;
  thumbnailStrategy: ThumbnailStrategy;
  /** True when previewKind !== "generic" — i.e. we have a real previewer. */
  canPreview: boolean;
}

export function listSupportedTypes(): SupportedTypeRow[] {
  return FILE_TYPES.map((e) => ({
    extensions: e.extensions,
    mime: e.mime,
    category: e.category,
    displayName: e.displayName,
    previewKind: e.previewKind,
    thumbnailStrategy: e.thumbnailStrategy,
    canPreview: e.previewKind !== "generic",
  }));
}
