import { AdminDomainLanding } from "@/features/admin/components/AdminDomainLanding";
import { ContextParityLastRun } from "@/features/agents/components/context-preview/inspector/ContextParityLastRun";
import { SystemItemDefaultsEditor } from "@/features/admin/system-context/SystemItemDefaultsEditor";

export default function ScopesContextAdministrationPage() {
  return (
    <AdminDomainLanding domainSlug="scopes-context">
      <div className="space-y-3">
        <ContextParityLastRun />
        <SystemItemDefaultsEditor />
      </div>
    </AdminDomainLanding>
  );
}
