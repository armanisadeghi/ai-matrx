import { TemplatesGalleryPanel } from "@/features/scopes/components/management/TemplatesGalleryPanel";


export default function ScopesTemplatesPage() {
  return (
    <div className="h-[calc(100dvh-var(--header-height))] overflow-y-auto bg-textured">
      <div className="max-w-6xl mx-auto p-6 md:p-8">
        <TemplatesGalleryPanel />
      </div>
    </div>
  );
}
