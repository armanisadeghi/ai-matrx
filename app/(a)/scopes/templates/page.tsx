import { TemplatesGalleryPanel } from "@/features/scopes/components/management/TemplatesGalleryPanel";

export const metadata = {
  title: "Scope templates",
  description:
    "Reusable scope-type bundles. Apply one to seed an organization with the right dimensions and context items in a single step.",
};

export default function ScopesTemplatesPage() {
  return (
    <div className="h-[calc(100dvh-var(--header-height))] overflow-y-auto bg-textured">
      <div className="max-w-6xl mx-auto p-6 md:p-8">
        <TemplatesGalleryPanel />
      </div>
    </div>
  );
}
