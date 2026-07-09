import type { LucideIcon } from "lucide-react";
import { FileText, NotebookText, Code2, BookOpen, Mic, Globe } from "lucide-react";
import type { ToolAccent } from "@/features/tool-call-visualization/types";

/**
 * Canonical source-kind → glossy glyph mapping for RAG hits. One place so every
 * surface (the rag_search tool card, /rag/search, the omnibox) draws the same
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
};

export function kindGlyph(kind: string): KindGlyph {
  return KIND[kind] ?? { icon: FileText, accent: "slate", label: kind };
}
