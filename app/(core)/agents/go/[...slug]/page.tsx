/**
 * /agents/go/<id> — the always-valid agent address (`agentGoHref`). A member
 * page, so it resolves for the member view; admin surfaces link through
 * `/administration/intelligence/go` instead. One resolver for both, and it
 * also accepts version and workflow ids: features/mandates/go.
 */
import {
  IntelligenceGoPage,
  type IntelligenceGoRouteProps,
} from "@/features/mandates/go/IntelligenceGoPage";

export const metadata = { title: "Opening agent…" };

export default function AgentGoPage(props: IntelligenceGoRouteProps) {
  return <IntelligenceGoPage {...props} lane="user" />;
}
