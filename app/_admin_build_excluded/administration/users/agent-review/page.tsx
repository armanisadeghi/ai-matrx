// Agent Review Queue — super-admin gated by app/(admin)/layout.tsx.
// All logic lives in features/admin/agent-review/.

import AgentReviewClient from "@/features/admin/agent-review/components/AgentReviewClient";

export const dynamic = "force-dynamic";

export default function AgentReviewPage() {
  return <AgentReviewClient />;
}
