import { ScopesSettingsPanel } from "@/features/scopes/components/management/ScopesSettingsPanel";


export default function ScopesSettingsPage() {
  return (
    <div className="h-[calc(100dvh-var(--header-height))] overflow-y-auto bg-textured">
      <div className="max-w-3xl mx-auto p-6 md:p-8">
        <ScopesSettingsPanel />
      </div>
    </div>
  );
}
