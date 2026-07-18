import { AgentAssignmentsDemo } from "@/features/agents/components/assignment-demo/AgentAssignmentsDemo";
import { createRouteMetadata } from "@/utils/route-metadata";

export const metadata = createRouteMetadata("/demos/agent-assignments", {
  title: "Agent Assignment Engine",
  description:
    "Test secure random variables and durable coordinated agent assignment sessions.",
});

export default function AgentAssignmentsDemoPage() {
  return <AgentAssignmentsDemo />;
}
