import { TemplatesGalleryPanel } from "@/features/scopes/components/management/TemplatesGalleryPanel";
import { ScopesHubHeader } from "@/features/scopes/components/management/ScopesHubHeader";


export default function ScopesTemplatesPage() {
  return (
    <>
      <ScopesHubHeader />
      <div className="h-full overflow-y-auto bg-textured pt-[var(--shell-header-h)]">
        <div className="max-w-6xl mx-auto p-6 md:p-8">
          <TemplatesGalleryPanel />
        </div>
      </div>
    </>
  );
}
