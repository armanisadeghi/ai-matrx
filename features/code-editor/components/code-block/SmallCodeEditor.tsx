"use client";

/**
 * SmallCodeEditor — the FRONT DOOR (thin shell).
 *
 * The Monaco-backed editor body lives in `SmallCodeEditorImpl.tsx` behind the
 * `next/dynamic` (ssr: false) boundary below, so `@monaco-editor/react`,
 * `monaco-config`, and `CodeEditorContextMenu` never enter any route's static
 * dep graph — before this shell existed, ~10 static importers (CodeBlock,
 * SqlFunctionForm, HtmlPageEditor, the code windows, …) compiled Monaco into
 * 11+ route entries (`code-splitting` skill, Method B).
 *
 * Import THIS file, always. Never import `SmallCodeEditorImpl` directly —
 * one static value import of the Impl re-leaks Monaco into that importer's
 * whole route graph. Do not wrap this shell in another `dynamic()` either;
 * it already is the boundary (rule 2: never stack).
 */

import dynamic from "next/dynamic";
import type { CodeEditorProps as ImplProps } from "./SmallCodeEditorImpl";

/** Props of the editor — sourced from the Impl so the shapes cannot drift. */
export type CodeEditorProps = ImplProps;

const SmallCodeEditor = dynamic(() => import("./SmallCodeEditorImpl"), {
  ssr: false,
  loading: () => (
    <div className="h-full w-full min-h-24 animate-pulse rounded-md bg-muted" />
  ),
});

export default SmallCodeEditor;
