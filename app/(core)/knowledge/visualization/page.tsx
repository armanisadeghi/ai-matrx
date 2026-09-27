import { redirect } from "next/navigation";

/**
 * `/knowledge/visualization` (and `/rag/visualization`) — a retired animation
 * demo with no user actions; the Knowledge hub is the destination. The same
 * animation still explains the pipeline at `/knowledge/flow`.
 */
export default function RetiredVisualization() {
  redirect("/knowledge");
}
