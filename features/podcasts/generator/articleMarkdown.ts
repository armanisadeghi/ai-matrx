// features/podcasts/generator/articleMarkdown.ts
//
// The blog-writer and show-notes agents emit a structured JSON envelope (often
// behind a <reasoning> preamble), NOT raw markdown. These helpers extract that
// object from the agent's accumulated text and assemble the renderable
// markdown + a clean title. Shapes mirror the agent specs:
//   internal_agents/podcast_blog_writer.md  (§4 json_schema)
//   internal_agents/podcast_show_notes_generator.md  (§4 json)

import { extractFirstObject } from "@/utils/json/extract-json";
import type { PcArticleKind } from "@/features/podcasts/types";

interface BlogJson {
  title?: string;
  slug_suggestion?: string;
  meta_description?: string;
  excerpt?: string;
  intro?: string;
  sections?: { heading?: string; body?: string }[];
  resources?: { label?: string; url?: string }[];
  outro?: string;
}

interface ShowNotesJson {
  key_takeaways?: string[];
  topics?: { timestamp?: string; title?: string; summary?: string }[];
  links?: { label?: string; url?: string }[];
  people?: { name?: string; role?: string }[];
}

export interface AssembledArticle {
  title: string;
  markdown: string;
  /** The agent's own slug suggestion, if any (blog only). */
  slugSuggestion?: string;
  metaDescription?: string;
}

function blogMarkdown(j: BlogJson, fallbackTitle: string): AssembledArticle {
  const title = j.title?.trim() || fallbackTitle;
  const parts: string[] = [`# ${title}`];
  if (j.intro?.trim()) parts.push(j.intro.trim());
  for (const s of j.sections ?? []) {
    if (s.heading?.trim()) parts.push(`## ${s.heading.trim()}`);
    if (s.body?.trim()) parts.push(s.body.trim());
  }
  const resources = (j.resources ?? []).filter((r) => r.url?.trim());
  if (resources.length) {
    parts.push("## Resources");
    parts.push(
      resources
        .map((r) => `- [${r.label?.trim() || r.url}](${r.url})`)
        .join("\n"),
    );
  }
  if (j.outro?.trim()) parts.push(j.outro.trim());
  return {
    title,
    markdown: parts.join("\n\n"),
    slugSuggestion: j.slug_suggestion?.trim() || undefined,
    metaDescription: j.meta_description?.trim() || undefined,
  };
}

function showNotesMarkdown(
  j: ShowNotesJson,
  fallbackTitle: string,
): AssembledArticle {
  const parts: string[] = [];
  const takeaways = (j.key_takeaways ?? []).filter((t) => t?.trim());
  if (takeaways.length) {
    parts.push("## Key takeaways");
    parts.push(takeaways.map((t) => `- ${t.trim()}`).join("\n"));
  }
  const topics = (j.topics ?? []).filter((t) => t.title?.trim());
  if (topics.length) {
    parts.push("## Topics");
    parts.push(
      topics
        .map((t) => {
          const ts = t.timestamp?.trim() ? `**${t.timestamp.trim()}** — ` : "";
          const summary = t.summary?.trim() ? ` ${t.summary.trim()}` : "";
          return `- ${ts}${t.title?.trim()}${summary}`;
        })
        .join("\n"),
    );
  }
  const links = (j.links ?? []).filter((l) => l.url?.trim());
  if (links.length) {
    parts.push("## Links");
    parts.push(
      links.map((l) => `- [${l.label?.trim() || l.url}](${l.url})`).join("\n"),
    );
  }
  const people = (j.people ?? []).filter((p) => p.name?.trim());
  if (people.length) {
    parts.push("## People");
    parts.push(
      people
        .map((p) => `- ${p.name?.trim()}${p.role?.trim() ? ` (${p.role.trim()})` : ""}`)
        .join("\n"),
    );
  }
  return { title: fallbackTitle, markdown: parts.join("\n\n") };
}

/**
 * Parse the agent's accumulated text into renderable markdown + title.
 * Falls back to treating the text as markdown directly if no JSON object is
 * found (so a future plain-markdown agent still works).
 */
export function assembleArticle(
  kind: PcArticleKind,
  agentText: string,
  fallbackTitle: string,
): AssembledArticle {
  const extracted = extractFirstObject(agentText);
  if (!extracted) {
    return { title: fallbackTitle, markdown: agentText.trim() };
  }
  const obj = extracted.value as Record<string, unknown>;
  return kind === "blog"
    ? blogMarkdown(obj as BlogJson, fallbackTitle)
    : showNotesMarkdown(obj as ShowNotesJson, fallbackTitle);
}
