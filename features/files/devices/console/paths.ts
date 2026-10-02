/**
 * Paths on the device, as the protocol carries them: absolute, forward slashes on every OS
 * (Windows arrives as "C:/Users/…"). Pure helpers for the files panel.
 */

export function joinPath(dir: string, name: string): string {
  return dir.endsWith("/") ? `${dir}${name}` : `${dir}/${name}`;
}

/** The containing folder; a root ("/" or "C:/") is its own parent. */
export function parentPath(path: string): string {
  const trimmed = path.length > 1 ? path.replace(/\/+$/, "") : path;
  const i = trimmed.lastIndexOf("/");
  if (i <= 0) return "/";
  const parent = trimmed.slice(0, i);
  return /^[A-Za-z]:$/.test(parent) ? `${parent}/` : parent;
}

export function baseName(path: string): string {
  const trimmed = path.replace(/\/+$/, "");
  return trimmed.slice(trimmed.lastIndexOf("/") + 1) || trimmed;
}

export interface Crumb {
  label: string;
  path: string;
}

/**
 * Breadcrumb for `path`. Inside `home` the trail starts at "~" (what a terminal shows); outside it
 * starts at the root.
 */
export function crumbs(path: string, home: string | null): Crumb[] {
  const clean = path.length > 1 ? path.replace(/\/+$/, "") : path;
  if (home && (clean === home || clean.startsWith(`${home}/`))) {
    const rest = clean.slice(home.length).split("/").filter(Boolean);
    const out: Crumb[] = [{ label: "~", path: home }];
    let acc = home;
    for (const part of rest) {
      acc = joinPath(acc, part);
      out.push({ label: part, path: acc });
    }
    return out;
  }
  const drive = /^([A-Za-z]:)\//.exec(clean);
  const rootPath = drive ? `${drive[1]}/` : "/";
  const out: Crumb[] = [{ label: drive ? drive[1]! : "/", path: rootPath }];
  let acc = rootPath;
  for (const part of clean.slice(rootPath.length).split("/").filter(Boolean)) {
    acc = joinPath(acc, part);
    out.push({ label: part, path: acc });
  }
  return out;
}

export type PreviewKind = "text" | "image" | "none";

const TEXT_EXT = new Set([
  "txt", "md", "markdown", "json", "jsonc", "yaml", "yml", "toml", "ini", "cfg", "conf", "env", "log", "csv", "tsv",
  "xml", "html", "htm", "css", "scss", "js", "mjs", "cjs", "jsx", "ts", "tsx", "py", "rb", "go", "rs", "java", "kt",
  "swift", "c", "h", "cc", "cpp", "hpp", "cs", "php", "sh", "bash", "zsh", "fish", "ps1", "sql", "graphql", "lua",
  "r", "pl", "vue", "svelte", "dockerfile", "gitignore", "editorconfig", "lock", "plist", "gradle", "makefile",
]);
const TEXT_NAMES = new Set(["Dockerfile", "Makefile", "LICENSE", "README", "Procfile", "Gemfile", ".gitignore", ".zshrc", ".bashrc", ".profile", ".env"]);
const IMAGE_MIME: Record<string, string> = {
  png: "image/png",
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  gif: "image/gif",
  webp: "image/webp",
  svg: "image/svg+xml",
  bmp: "image/bmp",
  ico: "image/x-icon",
  avif: "image/avif",
  heic: "image/heic",
};

export function extensionOf(name: string): string {
  const i = name.lastIndexOf(".");
  return i > 0 ? name.slice(i + 1).toLowerCase() : name.startsWith(".") ? name.slice(1).toLowerCase() : "";
}

export function previewKind(name: string, mime: string | null = null): PreviewKind {
  if (mime?.startsWith("image/")) return "image";
  if (mime?.startsWith("text/") || mime === "application/json") return "text";
  const ext = extensionOf(name);
  if (ext in IMAGE_MIME) return "image";
  if (TEXT_EXT.has(ext) || TEXT_NAMES.has(name)) return "text";
  return "none";
}

export function imageMime(name: string, mime: string | null): string {
  return mime?.startsWith("image/") ? mime : (IMAGE_MIME[extensionOf(name)] ?? "application/octet-stream");
}
