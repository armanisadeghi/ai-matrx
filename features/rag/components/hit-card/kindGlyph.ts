import type { LucideIcon } from "lucide-react";
import { FileText, NotebookText, Code2, BookOpen, Mic, Globe, ClipboardType } from "lucide-react";
import type { ToolAccent } from "@/features/tool-call-visualization/types";

/**
 * Canonical source-kind → glossy glyph mapping for Knowledge hits. One place so every
 * surface (the knowledge_search tool card, /knowledge/search, the omnibox) draws the same
 * icon + accent + label for a kind. The tool-viz `parseRag` re-exports this.
 */

export interface KindGlyph {
  icon: LucideIcon;
  accent: ToolAccent;
  label: string;
}

const KIND: Record<string, KindGlyph> = {
  cld_file: { icon: FileText, accent: "slate", label: "File" },
  note: { icon: NotebookText, accent: "amber", label: "Note" },
  code_file: { icon: Code2, accent: "blue", label: "Code" },
  library_doc: { icon: BookOpen, accent: "violet", label: "Library" },
  transcript: { icon: Mic, accent: "rose", label: "Transcript" },
  scraped: { icon: Globe, accent: "cyan", label: "Web page" },
  // The kinds chunks actually carry since the Sources door (2026-09-27 audit:
  // web and pasted Sources fell through to their raw token as the label).
  scrape_parsed_page: { icon: Globe, accent: "cyan", label: "Web page" },
  web_page: { icon: Globe, accent: "cyan", label: "Web page" },
  external_url: { icon: Globe, accent: "cyan", label: "Web page" },
  inline: { icon: ClipboardType, accent: "green", label: "Pasted text" },
};

export function kindGlyph(kind: string): KindGlyph {
  return KIND[kind] ?? { icon: FileText, accent: "slate", label: kind };
}
