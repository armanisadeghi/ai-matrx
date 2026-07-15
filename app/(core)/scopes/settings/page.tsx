import { ScopesSettingsPanel } from "@/features/scopes/components/management/ScopesSettingsPanel";
import { ScopesHubHeader } from "@/features/scopes/components/management/ScopesHubHeader";


export default function ScopesSettingsPage() {
  return (
    <>
      <ScopesHubHeader />
      <div className="h-full overflow-y-auto bg-textured pt-[var(--shell-header-h)]">
        <div className="max-w-3xl mx-auto p-6 md:p-8">
          <ScopesSettingsPanel />
        </div>
      </div>
    </>
  );
}
