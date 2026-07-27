/**
 * Sync key check for the unified artifact renderers WITHOUT importing any
 * component code (right-way experiment; keep in lockstep with RENDERERS in
 * artifact-renderers.tsx).
 */
const KEYS = new Set([
  "comparison","flashcards","timeline","research","resources","progress",
  "troubleshooting","recipe","diagram","decision-tree","presentation",
  "math_problem","quiz","mermaid","svg","chart","map","stats","diff",
  "questionnaire","tasks","html","react","table","transcript",
  "structured_info","tree","iframe","code","image",
]);

export function hasArtifactRenderer(canvasType: string | null | undefined): boolean {
  return !!canvasType && KEYS.has(canvasType);
}
