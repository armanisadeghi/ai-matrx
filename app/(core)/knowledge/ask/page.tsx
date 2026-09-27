/**
 * `/knowledge/ask` — Ask your knowledge over the filter in the URL
 * (KNOWLEDGE-HUB §5.3, H4). The panel itself lives in `features/knowledge/ask/`.
 */

import { Suspense } from "react";
import { AskRoute } from "@/features/knowledge/ask/AskRoute";

export default function KnowledgeAskPage() {
  return (
    <div className="h-full overflow-hidden">
      <Suspense fallback={null}>
        <AskRoute />
      </Suspense>
    </div>
  );
}
