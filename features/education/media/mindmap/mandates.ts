// features/education/media/mindmap/mandates.ts
//
// Mandate key for the Mind Maps tool. This is a MANDATE KEY, not an agent id:
// it resolves LIVE (system default → org binding → user binding) to whatever
// agent the DATABASE currently binds — agent identity never lives in code.
// Swap the agent at /agents/mandates; no code change, no deploy. See
// features/agents/mandates/FEATURE.md.

export const EDU_MEDIA_MANDATES = {
  /** source_content, title, focus → diagram_spec { __kind, title, type, nodes[], edges[] } */
  mindMap: "education.mindmap_generate",
} as const;
