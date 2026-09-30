import { redirect } from "next/navigation";

/**
 * `/knowledge/visualization` (and `/rag/visualization`) — the animation of how
 * Knowledge search works now lives at `/knowledge/flow`; an old link lands there.
 */
export default function RetiredVisualization() {
  redirect("/knowledge/flow");
}
