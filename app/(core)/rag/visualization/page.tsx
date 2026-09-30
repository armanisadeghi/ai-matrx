import { redirect } from "next/navigation";

/**
 * `/rag/visualization` — the old address of the pipeline animation. It lives at
 * `/knowledge/flow`; an old link lands there (the same place `/knowledge/visualization` goes).
 */
export default function RagVisualizationRedirect() {
  redirect("/knowledge/flow");
}
