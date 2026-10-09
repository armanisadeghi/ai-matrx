// /intelligence/go/<id> — open any agent, agent version, workflow or workflow
// version from its id alone (member view). See features/mandates/go.
import {
  IntelligenceGoPage,
  type IntelligenceGoRouteProps,
} from "@/features/mandates/go/IntelligenceGoPage";

export const metadata = { title: "Opening…" };

export default function IntelligenceGoRoute(props: IntelligenceGoRouteProps) {
  return <IntelligenceGoPage {...props} lane="user" />;
}
