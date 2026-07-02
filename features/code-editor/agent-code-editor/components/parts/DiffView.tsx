"use client";

// features/code-editor/agent-code-editor/components/parts/DiffView.tsx
//
// Was a verbatim copy of features/code-editor/components/DiffView (Prism + LCS).
// Both are now the same thin wrapper over the canonical DiffViewer, so this just
// re-exports the one implementation — no duplicated diff code. (FEATURE.md A5.)

export { DiffView } from "@/features/code-editor/components/DiffView";
