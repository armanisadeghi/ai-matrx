// features/education/media/mindmap/agents.ts
//
// The live agent id for the Mind Maps tool. Authored + tuned in-system on
// gemini-3.5-flash (2026-07-07). Emits a content-IR `diagram_spec` envelope
// (nodes + labeled edges) grounded in the supplied study material. This
// permanent id tracks the latest published version — the prompt/rubric can keep
// improving with no code change.

export const EDU_MEDIA_AGENTS = {
  /** source_content, title, focus → diagram_spec { __kind, title, type, nodes[], edges[] } */
  mindMap: "d13184d4-6a46-4b08-aff4-a95b7be93fc5",
} as const;
