import { AdminDomainLanding } from "@/features/admin/components/AdminDomainLanding";
import { ContextParityLastRun } from "@/features/agents/components/context-preview/inspector/ContextParityLastRun";

export default function ScopesContextAdministrationPage() {
  return (
    <AdminDomainLanding domainSlug="scopes-context">
      <ContextParityLastRun />
    </AdminDomainLanding>
  );
}
