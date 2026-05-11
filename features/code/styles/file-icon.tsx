/**
 * Filename → language id → icon mapping.
 *
 * Centralizes the "what icon does this file get?" decision so the FileTree,
 * editor tabs, and any other consumer stay consistent.
 */
import React from "react";
import { Folder, FolderOpen, FileText } from "lucide-react";
import { cn } from "@/lib/utils";
import { getLanguageIconNode } from "./language-display";

/** Map file extension (without dot) → Monaco language id. */
const EXT_TO_LANGUAGE: Record<string, string> = {
  // TypeScript / JavaScript
  ts: "typescript",
  tsx: "typescript",
  mts: "typescript",
  cts: "typescript",
  js: "javascript",
  jsx: "javascript",
  mjs: "javascript",
  cjs: "javascript",
  // JSON
  json: "json",
  jsonc: "json",
  json5: "json",
  har: "json",
  geojson: "json",
  topojson: "json",
  // Python / Ruby / Go / Rust
  py: "python",
  pyw: "python",
  pyi: "python",
  rb: "ruby",
  rbw: "ruby",
  rake: "ruby",
  ru: "ruby",
  gemspec: "ruby",
  go: "go",
  rs: "rust",
  // JVM family
  java: "java",
  kt: "kotlin",
  kts: "kotlin",
  scala: "scala",
  sbt: "scala",
  groovy: "groovy",
  gradle: "groovy",
  // Apple
  swift: "swift",
  m: "objective-c",
  mm: "objective-c",
  // C-family
  cs: "csharp",
  cpp: "cpp",
  cc: "cpp",
  cxx: "cpp",
  hpp: "cpp",
  hh: "cpp",
  c: "c",
  h: "c",
  // Web
  html: "html",
  htm: "html",
  xhtml: "html",
  css: "css",
  scss: "scss",
  sass: "scss",
  less: "less",
  styl: "stylus",
  stylus: "stylus",
  vue: "html",
  svelte: "html",
  astro: "html",
  // Templates
  hbs: "handlebars",
  handlebars: "handlebars",
  mustache: "handlebars",
  ejs: "html",
  liquid: "html",
  twig: "html",
  jinja: "html",
  j2: "html",
  njk: "html",
  // PHP
  php: "php",
  phtml: "php",
  phps: "php",
  // Shell / scripting
  sh: "shell",
  bash: "shell",
  zsh: "shell",
  fish: "shell",
  ksh: "shell",
  ash: "shell",
  ps1: "powershell",
  psm1: "powershell",
  psd1: "powershell",
  bat: "bat",
  cmd: "bat",
  // Data / config
  sql: "sql",
  yml: "yaml",
  yaml: "yaml",
  toml: "ini",
  ini: "ini",
  cfg: "ini",
  conf: "ini",
  config: "ini",
  properties: "properties",
  prefs: "ini",
  xml: "xml",
  // SVG is XML markup. Treat it as `xml` so Monaco highlights tags and
  // attributes properly when an SVG is opened in the code workspace
  // (sandbox / git filesystems).
  svg: "xml",
  csv: "plaintext",
  tsv: "plaintext",
  // Docs
  md: "markdown",
  markdown: "markdown",
  mdx: "markdown",
  rst: "restructuredtext",
  tex: "latex",
  latex: "latex",
  ltx: "latex",
  sty: "latex",
  cls: "latex",
  bib: "bibtex",
  // Functional / scientific
  r: "r",
  rmd: "r",
  jl: "julia",
  hs: "haskell",
  lhs: "haskell",
  ml: "ocaml",
  mli: "ocaml",
  fs: "fsharp",
  fsi: "fsharp",
  fsx: "fsharp",
  ex: "elixir",
  exs: "elixir",
  erl: "erlang",
  hrl: "erlang",
  clj: "clojure",
  cljs: "clojure",
  cljc: "clojure",
  edn: "clojure",
  // Other languages
  lua: "lua",
  pl: "perl",
  pm: "perl",
  dart: "dart",
  zig: "zig",
  nim: "plaintext",
  nims: "plaintext",
  // Data interchange
  graphql: "graphql",
  gql: "graphql",
  graphqls: "graphql",
  proto: "proto",
  sol: "sol",
  // Patches & misc text
  diff: "plaintext",
  patch: "plaintext",
  log: "plaintext",
  out: "plaintext",
  err: "plaintext",
  txt: "plaintext",
  text: "plaintext",
  // Crypto / cert text
  pem: "plaintext",
  crt: "plaintext",
  cer: "plaintext",
  key: "plaintext",
  pub: "plaintext",
  csr: "plaintext",
  // Container / build descriptors
  dockerfile: "dockerfile",
  containerfile: "dockerfile",
  mk: "makefile",
  make: "makefile",
};

/**
 * Map exact filename → Monaco language id (wins over extension matching).
 * Kept in sync with the aliases declared in `features/files/utils/file-types.ts`
 * so opening any registered named text file gets a sensible language hint.
 */
const NAME_TO_LANGUAGE: Record<string, string> = {
  // Container / Make / Ruby / Build descriptors
  Dockerfile: "dockerfile",
  Containerfile: "dockerfile",
  ".dockerignore": "ignore",
  Makefile: "makefile",
  makefile: "makefile",
  GNUmakefile: "makefile",
  BSDmakefile: "makefile",
  Justfile: "makefile",
  justfile: "makefile",
  Earthfile: "makefile",
  Procfile: "yaml",
  Pipfile: "ini",
  Rakefile: "ruby",
  Gemfile: "ruby",
  Vagrantfile: "ruby",
  Berksfile: "ruby",
  Brewfile: "ruby",
  Capfile: "ruby",
  Guardfile: "ruby",
  Podfile: "ruby",
  Fastfile: "ruby",
  Appfile: "ruby",
  Deliverfile: "ruby",
  Matchfile: "ruby",
  Pluginfile: "ruby",
  Snapfile: "ruby",
  Scanfile: "ruby",
  Gymfile: "ruby",
  // Git / SCM dotfiles
  ".gitignore": "ignore",
  ".gitattributes": "ignore",
  ".gitmodules": "ini",
  ".gitconfig": "ini",
  ".gitkeep": "plaintext",
  // Lint / format / tooling dotfiles
  ".eslintignore": "ignore",
  ".prettierignore": "ignore",
  ".npmignore": "ignore",
  ".stylelintignore": "ignore",
  ".rsync-filter": "plaintext",
  ".editorconfig": "ini",
  ".browserslistrc": "plaintext",
  ".babelrc": "json",
  ".eslintrc": "json",
  ".prettierrc": "json",
  ".stylelintrc": "json",
  ".swcrc": "json",
  ".huskyrc": "json",
  ".lintstagedrc": "json",
  ".clang-format": "yaml",
  ".clang-tidy": "yaml",
  ".yamllint": "yaml",
  // Shell config dotfiles
  ".bashrc": "shell",
  ".bash_logout": "shell",
  ".bash_profile": "shell",
  ".bash_history": "shell",
  ".bash_aliases": "shell",
  ".profile": "shell",
  ".zshrc": "shell",
  ".zshenv": "shell",
  ".zprofile": "shell",
  ".zlogin": "shell",
  ".zlogout": "shell",
  ".zsh_history": "shell",
  ".inputrc": "ini",
  ".curlrc": "shell",
  ".wgetrc": "shell",
  ".npmrc": "ini",
  ".yarnrc": "ini",
  ".pypirc": "ini",
  ".tool-versions": "plaintext",
  ".nvmrc": "plaintext",
  ".node-version": "plaintext",
  ".python-version": "plaintext",
  ".ruby-version": "plaintext",
  // Env files
  ".env": "shell",
  ".envrc": "shell",
  ".sandbox_env": "shell",
  // System / SSH config
  authorized_keys: "plaintext",
  known_hosts: "plaintext",
  hosts: "plaintext",
  passwd: "plaintext",
  group: "plaintext",
  shadow: "plaintext",
  fstab: "plaintext",
  crontab: "shell",
  "resolv.conf": "ini",
  ssh_config: "ini",
  sshd_config: "ini",
  config: "ini",
  // Build markers
  "CACHEDIR.TAG": "plaintext",
  CODEOWNERS: "plaintext",
  // Plain-text project metadata
  README: "markdown",
  Readme: "markdown",
  readme: "markdown",
  LICENSE: "plaintext",
  License: "plaintext",
  license: "plaintext",
  LICENCE: "plaintext",
  COPYING: "plaintext",
  COPYRIGHT: "plaintext",
  NOTICE: "plaintext",
  AUTHORS: "plaintext",
  CONTRIBUTORS: "plaintext",
  MAINTAINERS: "plaintext",
  CHANGELOG: "markdown",
  CHANGES: "plaintext",
  HISTORY: "plaintext",
  NEWS: "plaintext",
  TODO: "plaintext",
  INSTALL: "plaintext",
  VERSION: "plaintext",
  MANIFEST: "plaintext",
  PATENTS: "plaintext",
  ROADMAP: "markdown",
  SECURITY: "markdown",
  // Common JSON / YAML manifests
  "tsconfig.json": "json",
  "package.json": "json",
  "package-lock.json": "json",
  "pnpm-lock.yaml": "yaml",
  "yarn.lock": "plaintext",
  "bun.lockb": "plaintext",
  "Cargo.toml": "ini",
  "Cargo.lock": "ini",
  "pyproject.toml": "ini",
  "go.mod": "plaintext",
  "go.sum": "plaintext",
};

/** Filename prefixes (case-insensitive) → Monaco language id. */
const NAME_PREFIX_TO_LANGUAGE: Array<[string, string]> = [
  ["dockerfile.", "dockerfile"],
  ["containerfile.", "dockerfile"],
  ["makefile.", "makefile"],
  [".env.", "shell"],
  [".envrc.", "shell"],
];

function basenameOf(filename: string): string {
  const slash = Math.max(filename.lastIndexOf("/"), filename.lastIndexOf("\\"));
  return slash >= 0 ? filename.slice(slash + 1) : filename;
}

function extOf(filename: string): string {
  const dot = filename.lastIndexOf(".");
  if (dot <= 0) return "";
  return filename.slice(dot + 1).toLowerCase();
}

/** Returns the Monaco language id for a filename, or "plaintext". */
export function languageFromFilename(filename: string): string {
  const name = basenameOf(filename);
  // Exact match (case-sensitive — important for Dockerfile vs dockerfile).
  if (NAME_TO_LANGUAGE[name]) return NAME_TO_LANGUAGE[name];
  // Case-insensitive fallback.
  const lower = name.toLowerCase();
  for (const key in NAME_TO_LANGUAGE) {
    if (key.toLowerCase() === lower) return NAME_TO_LANGUAGE[key];
  }
  // Extension match.
  const ext = extOf(name);
  if (ext && EXT_TO_LANGUAGE[ext]) return EXT_TO_LANGUAGE[ext];
  // Prefix match (e.g. ".env.local" → "shell").
  for (const [prefix, lang] of NAME_PREFIX_TO_LANGUAGE) {
    if (lower.startsWith(prefix)) return lang;
  }
  return "plaintext";
}

interface FileIconProps {
  name: string;
  kind?: "file" | "directory";
  expanded?: boolean;
  size?: number;
  className?: string;
}

export const FileIcon: React.FC<FileIconProps> = ({
  name,
  kind = "file",
  expanded,
  size = 14,
  className,
}) => {
  if (kind === "directory") {
    const Icon = expanded ? FolderOpen : Folder;
    return (
      <Icon
        size={size}
        className={cn("text-sky-500 dark:text-sky-400", className)}
      />
    );
  }

  const lang = languageFromFilename(name);
  if (lang === "plaintext") {
    return (
      <FileText
        size={size}
        className={cn("text-neutral-500 dark:text-neutral-400", className)}
      />
    );
  }
  return <>{getLanguageIconNode(lang, { size, className })}</>;
};
