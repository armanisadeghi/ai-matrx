// components/rich-editor/islands/island-meta.ts
//
// What a person sees on a protected block: a plain name and an icon per island
// type, plus the language its source editor should highlight. Pure data.

import { isPageBreakLine } from "@ai-matrx/print/directives";
import {
  Braces,
  Code,
  Hash,
  Info,
  LayoutPanelTop,
  CodeXml,
  EyeOff,
  FileCog,
  FileText,
  FolderTree,
  Lock,
  Pin,
  SeparatorHorizontal,
  Shapes,
  Sigma,
  Tags,
  Workflow,
  type LucideIcon,
} from "lucide-react";

export type IslandEditorLanguage = "markdown" | "json" | "xml" | "code" | "math";

export interface IslandMeta {
  label: string;
  icon: LucideIcon;
  language: IslandEditorLanguage;
  /** Rendered through the shared renderer (false: shown as its source). */
  renders: boolean;
}

const KIND_RE = /"__kind"\s*:\s*"([^"]+)"/;

export function kindOf(raw: string): string | null {
  return KIND_RE.exec(raw)?.[1] ?? null;
}

function fenceLanguage(raw: string): string {
  return /^(?:`{3,}|~{3,})[ \t]*([^\s`]*)/.exec(raw)?.[1] ?? "";
}

function xmlTag(raw: string): string {
  return /^\s*<([A-Za-z][\w:-]*)/.exec(raw)?.[1] ?? "section";
}

export function islandMeta(islandType: string, raw: string): IslandMeta {
  if (isPageBreakLine(raw.trim())) {
    return { label: "Page break", icon: SeparatorHorizontal, language: "markdown", renders: false };
  }
  switch (islandType) {
    case "fence": {
      const language = fenceLanguage(raw);
      const kind = kindOf(raw);
      if (kind) return { label: `Kind · ${kind}`, icon: Shapes, language: "json", renders: true };
      if (language === "mermaid") return { label: "Diagram", icon: Workflow, language: "code", renders: true };
      if (language === "markdown" || language === "md") {
        return { label: "Markdown block", icon: FileText, language: "markdown", renders: true };
      }
      return { label: language ? `Code · ${language}` : "Code", icon: Code, language: "code", renders: true };
    }
    case "json": {
      const kind = kindOf(raw);
      return {
        label: kind ? `Kind · ${kind}` : "Structured data",
        icon: kind ? Shapes : Braces,
        language: "json",
        renders: true,
      };
    }
    case "xml_region":
    case "xml_attr":
    case "xml_container":
      return { label: `Section · ${xmlTag(raw)}`, icon: Tags, language: "xml", renders: true };
    case "html_block":
      return { label: "HTML", icon: CodeXml, language: "xml", renders: true };
    case "html_comment":
      return { label: "Hidden comment", icon: EyeOff, language: "xml", renders: false };
    case "anchor":
      return { label: "Pinned anchor", icon: Pin, language: "xml", renders: false };
    case "math_block":
      return { label: "Equation", icon: Sigma, language: "math", renders: true };
    case "front_matter":
      return { label: "Front matter", icon: FileCog, language: "code", renders: false };
    case "tree":
      return { label: "File tree", icon: FolderTree, language: "code", renders: true };
    case "callout": {
      const name = /^\s*>\s*\[!([\w-]+)\]/.exec(raw)?.[1];
      return { label: name ? `Callout · ${name.toLowerCase()}` : "Callout", icon: Info, language: "markdown", renders: true };
    }
    case "directive": {
      const name = /^\s*(?::{2,}|!!!|\?{3}\+?)\s*([\w-]+)/.exec(raw)?.[1];
      return { label: name ? `Block · ${name}` : "Block", icon: LayoutPanelTop, language: "markdown", renders: true };
    }
    case "footnote_def": {
      const id = /^\s*\[\^([^\]]+)\]:/.exec(raw)?.[1];
      return { label: id ? `Footnote ${id}` : "Footnote", icon: Hash, language: "markdown", renders: true };
    }
    default:
      return { label: "Protected block", icon: Lock, language: "markdown", renders: true };
  }
}

/** Inline islands: short label for a chip. */
export function inlineIslandLabel(islandType: string): string {
  switch (islandType) {
    case "variable":
      return "Variable";
    case "math_inline":
      return "Equation";
    case "cite":
      return "Citation";
    case "md_image":
      return "Image";
    case "anchor":
      return "Pinned anchor";
    case "kind_json":
      return "Kind";
    case "media_ref":
      return "Media";
    case "wikilink":
      return "Page link";
    default:
      return "Protected text";
  }
}

/** Common fence languages for the picker, most used first. */
export const CODE_LANGUAGES = [
  "",
  "python",
  "typescript",
  "javascript",
  "tsx",
  "json",
  "sql",
  "bash",
  "html",
  "css",
  "markdown",
  "yaml",
  "mermaid",
  "go",
  "rust",
  "java",
  "csharp",
  "php",
  "ruby",
  "swift",
  "kotlin",
  "xml",
  "text",
] as const;

/** Rewrite a fence's info string, keeping its fence characters and body bytes. */
export function withFenceLanguage(raw: string, language: string): string {
  return raw.replace(/^(`{3,}|~{3,})[^\n]*/, (_whole, fence: string) => `${fence}${language}`);
}

/** The TeX inside `$$…$$` / `\[…\]` / `$…$`. */
export function texOf(raw: string): string {
  const block = /^\$\$\s*\n?([\s\S]*?)\n?\s*\$\$$/.exec(raw.trim());
  if (block) return block[1] ?? "";
  const bracket = /^\\\[([\s\S]*?)\\\]$/.exec(raw.trim());
  if (bracket) return (bracket[1] ?? "").trim();
  const inline = /^\$([\s\S]*?)\$$/.exec(raw.trim()) ?? /^\\\(([\s\S]*?)\\\)$/.exec(raw.trim());
  return inline?.[1] ?? raw;
}
