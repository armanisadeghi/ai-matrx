"use client";

// ─────────────────────────────────────────────────────────────────────────
// BUILD-GRAPH FRONT DOOR — the ONE react-markdown edge for the whole app.
//
// Before this existed there were 15 independent react-markdown boundaries
// (each `dynamic(() => import("react-markdown"))` call manufactures its own
// loadable/chunk group per consuming context — see the code-splitting skill,
// rule 3, THE FRAGMENTATION LAW). Every markdown wrapper now renders this
// front door with a named plugin preset; react-markdown, the unified/remark
// graph, and every plugin compile ONCE inside MarkdownCoreImpl.
//
// Never import react-markdown (as a value) or a remark/rehype plugin from a
// component — pick or add a preset instead. `import type` from
// react-markdown remains fine everywhere (erased at compile).
//
// NOT this module's job: the rich-document ENGINE (block registry, code
// surfaces, interactive blocks) — that is MarkdownStream/RichDocument.
// ─────────────────────────────────────────────────────────────────────────

import dynamic from "next/dynamic";
export type {
  MarkdownCoreProps,
  MarkdownPreset,
} from "./markdown-core-types";

const MarkdownCore = dynamic(() => import("./MarkdownCoreImpl"), {
  ssr: false,
  loading: () => null,
});

export default MarkdownCore;
