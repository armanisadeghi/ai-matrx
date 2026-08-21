// Agent Review Queue — super-admin gated by app/(admin)/layout.tsx.
// All logic lives in features/admin/agent-review/.

import AgentReviewQueueTable from "@/features/admin/agent-review/components/AgentReviewQueueTable";

export const dynamic = "force-dynamic";

export default function AgentReviewPage() {
  return <AgentReviewQueueTable />;
}
