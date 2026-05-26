/**
 * /rag — Knowledge home.
 *
 * Landing page that surfaces live state across data stores, library,
 * and search. The previous /rag had no index page so the route would
 * 404; this is the canonical entry point.
 */

import { RagHomePage } from "@/features/rag/components/RagHomePage";

export default function Page() {
  return <RagHomePage />;
}
