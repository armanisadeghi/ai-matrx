// alchemy-plain-text-format — "Plain text" for every Alchemy workspace in the
// app, built by THE one engine per format (@ai-matrx/alchemy/operate).
//
// The design-system preparation workspace's own serializer can only echo a
// Markdown draft back, so "Plain text" of a conversation or a note was the
// Markdown (and was then hidden). Registered under the built-in id "plain",
// this engine supersedes it everywhere (design-system hostEngineFor): Markdown
// becomes real text from the one parse — a conversation reads "You" /
// "Assistant" and each message's words in order, no "##" — while rows and
// plain text come out exactly as before. Structured content has no separate
// plain text (it would be the JSON), so it is not offered.

import type { FormatAdapter } from "@ai-matrx/kit/content-transfer";

export const alchemyPlainTextFormat: FormatAdapter = {
  id: "plain",
  label: "Plain text",
  supports: (payload) => payload.kind !== "json" && payload.kind !== "registered",
  build: async (draft, signal) => {
    const { formatAdapter } = await import("@ai-matrx/alchemy/operate");
    const engine = await formatAdapter("plain").load();
    return engine.build(draft, {}, signal);
  },
};
