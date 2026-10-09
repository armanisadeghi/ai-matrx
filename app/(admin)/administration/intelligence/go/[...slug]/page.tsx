// /administration/intelligence/go/<id> — open any agent, agent version,
// workflow or workflow version from its id alone; system agents open in the
// System Agents tree. See features/mandates/go.
import {
  IntelligenceGoPage,
  type IntelligenceGoRouteProps,
} from "@/features/mandates/go/IntelligenceGoPage";

export const metadata = { title: "Opening…" };

export default function AdminIntelligenceGoRoute(props: IntelligenceGoRouteProps) {
  return <IntelligenceGoPage {...props} lane="admin" />;
}
