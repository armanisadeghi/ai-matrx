import { ConversationExplorer } from "@/features/cx-dashboard/explorer/ConversationExplorer";

// Every conversation on the platform, found by person, organization, agent, model, cost, tokens,
// source and date — every query runs in the database (features/cx-dashboard/explorer).
export default function ConversationsPage() {
  return <ConversationExplorer />;
}
